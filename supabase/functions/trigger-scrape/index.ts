// trigger-scrape: queues optional SKU codes in sku_market_data and dispatches the GitHub Actions scraper workflow.
import { authenticate, HttpError, json, serve } from "../_shared/common.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST required");
  const { db } = await authenticate(req, ["approver", "uploader"]);

  const body = await req.json().catch(() => ({})) as { sku_codes?: unknown; mode?: unknown };
  const mode = body.mode === "daily" ? "daily" : "queued";

  const rawCodes = Array.isArray(body.sku_codes) ? body.sku_codes : [];
  const codes = [...new Set(
    rawCodes.map((c) => String(c ?? "").trim().toUpperCase()).filter(Boolean),
  )];

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const githubRepo = Deno.env.get("GITHUB_SCRAPER_REPO");
  const missing: string[] = [];
  if (!githubToken) missing.push("GITHUB_TOKEN");
  if (!githubRepo) missing.push("GITHUB_SCRAPER_REPO");
  if (missing.length) {
    throw new HttpError(
      500,
      `Missing Supabase Edge Function secret(s): ${missing.join(", ")}. Set them with 'supabase secrets set' before triggering scrapes.`,
    );
  }

  if (codes.length > 0) {
    const now = new Date().toISOString();
    const rows = codes.map((sku_code) => ({
      sku_code,
      scrape_status: "queued",
      scrape_error: null,
      updated_at: now,
    }));
    const { error } = await db.from("sku_market_data").upsert(rows, { onConflict: "sku_code" });
    if (error) throw new HttpError(500, `failed to queue sku_market_data: ${error.message}`);
  }

  const workflow = Deno.env.get("GITHUB_SCRAPER_WORKFLOW") || "scrape_skus.yml";
  const ref = Deno.env.get("GITHUB_SCRAPER_BRANCH") || "main";
  const url = `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflow}/dispatches`;

  const ghRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "creative-portal-edge-fn",
    },
    body: JSON.stringify({ ref, inputs: { mode } }),
  });

  if (!ghRes.ok) {
    const detail = await ghRes.text().catch(() => "");
    throw new HttpError(502, `GitHub workflow dispatch failed (${ghRes.status}): ${detail || ghRes.statusText}`);
  }

  return json({ ok: true, queued: codes.length, dispatched: true });
});


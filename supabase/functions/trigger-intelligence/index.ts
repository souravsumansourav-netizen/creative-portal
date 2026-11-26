// trigger-intelligence: dispatches the train_intelligence.yml workflow in souravsumansourav-netizen/scrapper-p.
import { authenticate, HttpError, json, serve } from "../_shared/common.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST required");
  await authenticate(req, ["approver", "uploader"]);

  const body = await req.json().catch(() => ({})) as { batch_id?: unknown };
  const batchId = typeof body.batch_id === "string" ? body.batch_id.trim() : "";

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    throw new HttpError(
      500,
      "Missing Supabase Edge Function secret: GITHUB_TOKEN. Set it with 'supabase secrets set' before running the intelligence model.",
    );
  }

  const repo = Deno.env.get("GITHUB_INTEL_REPO") || "souravsumansourav-netizen/scrapper-p";
  const workflow = Deno.env.get("GITHUB_INTEL_WORKFLOW") || "train_intelligence.yml";
  const ref = Deno.env.get("GITHUB_INTEL_BRANCH") || "main";
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;

  const ghRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "creative-portal-edge-fn",
    },
    body: JSON.stringify({ ref, inputs: { batch_id: batchId } }),
  });

  if (!ghRes.ok) {
    const detail = await ghRes.text().catch(() => "");
    throw new HttpError(502, `GitHub workflow dispatch failed (${ghRes.status}): ${detail || ghRes.statusText}`);
  }

  return json({ ok: true, dispatched: true, batch_id: batchId });
});


"use client";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Invoke an Edge Function and surface the server's error message (incl. line-item errors). */
export async function invoke<T = any>(name: string, body: any): Promise<T> {
  const { data, error } = await supabaseBrowser().functions.invoke(name, { body });
  if (error) {
    let payload: any = null;
    try { payload = await (error as any).context?.json(); } catch { /* not json */ }
    const e = new Error(payload?.error ?? error.message) as Error & { errors?: any[] };
    e.errors = payload?.errors;
    throw e;
  }
  return data as T;
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseBrowser().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function presignGet(key: string): Promise<string> {
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { url } = await invoke<{ url: string }>("presign", { action: "get", key });
  urlCache.set(key, { url, exp: Date.now() + 8 * 60_000 }); // URLs live ~10 min
  return url;
}

const BLOCK_FLAG = "r2-direct-blocked";
const directBlocked = () => { try { return sessionStorage.getItem(BLOCK_FLAG) === "1"; } catch { return false; } };
const markBlocked = () => { try { sessionStorage.setItem(BLOCK_FLAG, "1"); } catch { /* ignore */ } };

/** Same-site URL that serves an R2 image through this app (for networks that block direct R2 access). */
export const proxyUrl = (key: string, name?: string) =>
  `/api/r2/get?key=${encodeURIComponent(key)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;

/**
 * Browser -> R2 upload (image bytes never touch Supabase). Tries the direct presigned PUT first; if the network
 * blocks it ("Failed to fetch" / CORS), it falls back to posting the file to this site, which uploads it for you.
 */
export async function uploadToR2(key: string, file: File) {
  const contentType = file.type || "image/jpeg";
  if (!directBlocked()) {
    try {
      const { url } = await invoke<{ url: string }>("presign", { action: "put", key, contentType });
      const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
      if (!res.ok) throw new Error(`upload of ${file.name} failed (${res.status})`);
      return;
    } catch (e) {
      if (!(e instanceof TypeError)) throw e; // a real server answer: don't retry
      markBlocked();                          // network-level failure: use the fallback from now on
    }
  }
  const res = await fetch(`/api/r2/upload?key=${encodeURIComponent(key)}`, { method: "POST", body: file, headers: { "Content-Type": contentType } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error ?? `upload of ${file.name} failed (${res.status})`);
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Open the full-size image in a new tab (served through this site, so it works on restricted networks). */
export async function openAsset(key: string) {
  window.open(proxyUrl(key), "_blank", "noopener");
}

/** Save the image under `filename`. */
export async function downloadAsset(key: string, filename: string) {
  const a = document.createElement("a");
  a.href = proxyUrl(key, filename);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Post the creator's comment for an upload she just made. It is tagged to the new version(s): `count` consecutive
 * versions were created, so the comment points at the first and records how many.
 */
export async function postResubmitComment(shotId: string, body: string, count: number) {
  const sb = supabaseBrowser();
  const { data: { user } } = await sb.auth.getUser();
  const { data: nv } = await sb.from("shot_versions").select("id, version_no").eq("shot_id", shotId)
    .order("version_no", { ascending: false }).limit(Math.max(1, count));
  const first = nv?.[nv.length - 1];
  const { error } = await sb.from("shot_comments").insert({
    shot_id: shotId, author_id: user!.id, body,
    version_id: first?.id ?? null, tag: first ? "resubmitted" : null, version_count: nv?.length ?? 1,
  });
  if (error) throw new Error(error.message);
}

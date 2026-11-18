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

/** Direct browser -> R2 upload; image bytes never touch Supabase. */
export async function uploadToR2(key: string, file: File) {
  const contentType = file.type || "image/jpeg";
  const { url } = await invoke<{ url: string }>("presign", { action: "put", key, contentType });
  const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`upload of ${file.name} failed (${res.status})`);
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Open the full-size image in a new tab (short-lived presigned URL). */
export async function openAsset(key: string) {
  window.open(await presignGet(key), "_blank", "noopener");
}

/** Save the image under `filename` (presigned URL with an attachment Content-Disposition). */
export async function downloadAsset(key: string, filename: string) {
  const { url } = await invoke<{ url: string }>("presign", { action: "get", key, download_name: filename });
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

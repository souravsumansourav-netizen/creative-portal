import { NextResponse } from "next/server";
import { proxyAuth } from "@/lib/r2-proxy";

export const runtime = "nodejs";

/**
 * Serves an image through this site (for networks that block direct R2 access). Authorisation is the same as the
 * direct path: the `presign` function only returns a URL if the caller can see the asset (row-level security).
 * `?name=` makes the browser save it under that file name.
 */
export async function GET(req: Request) {
  const auth = await proxyAuth();
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const key = sp.get("key") ?? "";
  const name = sp.get("name") ?? undefined;
  if (!key || key.includes("..")) return NextResponse.json({ error: "invalid key" }, { status: 400 });

  try {
    const url = await auth.presign({ action: "get", key, download_name: name });
    const r2 = await fetch(url);
    if (!r2.ok || !r2.body) return NextResponse.json({ error: "image not found" }, { status: r2.status === 404 ? 404 : 502 });
    const headers = new Headers({
      "Content-Type": r2.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    });
    const len = r2.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    const cd = r2.headers.get("content-disposition");
    if (cd) headers.set("Content-Disposition", cd);
    return new Response(r2.body, { headers });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}

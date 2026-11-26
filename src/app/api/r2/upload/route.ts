import { NextResponse } from "next/server";
import { proxyAuth } from "@/lib/r2-proxy";

export const runtime = "nodejs";
const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Fallback for networks that block direct browser -> R2 uploads: the browser posts the image here and this server
 * PUTs it to R2 using a presigned URL from the `presign` function. Same rules as direct upload (own staging prefix only).
 */
export async function POST(req: Request) {
  const auth = await proxyAuth();
  if (!auth) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const key = new URL(req.url).searchParams.get("key") ?? "";
  const allowed = key.startsWith(`staging/${auth.user.id}/`) || key.startsWith("intelligence/");
  if (!allowed || key.includes("..")) {
    return NextResponse.json({ error: "uploads must go under your staging or intelligence prefix" }, { status: 403 });
  }
  const contentType = req.headers.get("content-type") || "image/jpeg";
  const body = Buffer.from(await req.arrayBuffer());
  if (!body.length) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "file too large" }, { status: 413 });

  try {
    const url = await auth.presign({ action: "put", key, contentType });
    const put = await fetch(url, { method: "PUT", body, headers: { "Content-Type": contentType, "Content-Length": String(body.length) } });
    if (!put.ok) return NextResponse.json({ error: `storage rejected the upload (${put.status})` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

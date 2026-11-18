import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/** Wraps a handler with CORS preflight + uniform error handling. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message, ...e.extra }, e.status);
      console.error(e);
      return json({ ok: false, error: (e as Error).message ?? "internal error" }, 500);
    }
  });
}

export type Role = "uploader" | "approver" | "creator" | "pdp_uploader" | "performance" | "admin";

export const adminClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

/** Client acting as the caller (RLS applies). */
export const userClient = (req: Request): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });

/** Verifies the JWT, loads the profile role, and enforces the allowed roles (admin always passes). */
export async function authenticate(req: Request, allowed: Role[]) {
  const client = userClient(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new HttpError(401, "not signed in");
  const db = adminClient();
  const { data: profile } = await db.from("profiles").select("id, role").eq("id", user.id).single();
  if (!profile) throw new HttpError(403, "no profile");
  if (profile.role !== "admin" && !allowed.includes(profile.role)) {
    throw new HttpError(403, `role '${profile.role}' may not do this`);
  }
  return { user, role: profile.role as Role, client, db };
}

// ---------- R2 ----------
export const BUCKET = () => Deno.env.get("R2_BUCKET") ?? "creative-assets";

let _s3: S3Client | null = null;
export function r2(): S3Client {
  if (!_s3) {
    const endpoint = Deno.env.get("R2_ENDPOINT") ??
      `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
    _s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
      },
    });
  }
  return _s3;
}

export const PRESIGN_TTL_SECONDS = 600; // ~10 min

export const presignPut = (key: string, contentType: string) =>
  getSignedUrl(r2(), new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });

/** With `downloadName` the browser saves the file under that name instead of displaying it. */
export const presignGet = (key: string, downloadName?: string) =>
  getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ...(downloadName
        ? { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/[^\w.\-]+/g, "_")}"` }
        : {}),
    }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await r2().send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType }));
}

export async function copyObject(srcKey: string, dstKey: string) {
  await r2().send(new CopyObjectCommand({
    Bucket: BUCKET(),
    Key: dstKey,
    CopySource: `${BUCKET()}/${srcKey.split("/").map(encodeURIComponent).join("/")}`,
    ContentType: "image/jpeg",
    MetadataDirective: "REPLACE",
  }));
}

export async function deleteObjects(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const res = await r2().send(new DeleteObjectsCommand({
      Bucket: BUCKET(),
      Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
    }));
    if (res.Errors?.length) {
      throw new Error(`R2 delete failed for ${res.Errors.length} object(s): ${res.Errors[0].Message}`);
    }
  }
}

export const deleteObject = (key: string) => r2().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));

/** Lists objects under a prefix → Map<key, size>. */
export async function listObjects(prefix: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  let token: string | undefined;
  do {
    const res = await r2().send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) out.set(o.Key!, o.Size ?? 0);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export const getObject = (key: string) => r2().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));

export const objectKeyFor = (skuCode: string, shotType: string, version: number) =>
  `${skuCode}/${shotType}/v${version}.jpg`;

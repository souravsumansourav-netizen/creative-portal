// presign: short-lived presigned R2 PUT (upload) / GET (download) URLs. R2 credentials never leave the server.
//   POST { action: "put", key, contentType }  -> { url }   key must live under staging/{caller uid}/
//   POST { action: "get", key }               -> { url }   caller must be able to see the asset row (RLS)
import { authenticate, HttpError, json, presignGet, presignPut, serve } from "../_shared/common.ts";

serve(async (req) => {
  const { user, role, client } = await authenticate(req, ["uploader", "approver", "creator", "pdp_uploader", "performance"]);
  const { action, key, contentType, download_name } = await req.json();
  if (typeof key !== "string" || !key || key.includes("..")) throw new HttpError(400, "invalid key");

  if (action === "put") {
    const allowedIntel = key.startsWith("intelligence/") && (role === "admin" || role === "approver" || role === "uploader");
    if (!key.startsWith(`staging/${user.id}/`) && !allowedIntel) {
      throw new HttpError(403, "uploads must go under your staging prefix");
    }
    return json({ ok: true, url: await presignPut(key, contentType || "image/jpeg") });
  }

  if (action === "get") {
    // Authorisation = RLS: the asset row is only visible if the caller can see a version that references it.
    const { data } = await client.from("assets").select("id").eq("object_key", key).limit(1);
    if (!data?.length) throw new HttpError(403, "not allowed to read this object");
    return json({ ok: true, url: await presignGet(key, typeof download_name === "string" ? download_name : undefined) });
  }

  throw new HttpError(400, "action must be 'put' or 'get'");
});

// validate-upload (supports a `variations: true` mode with shot_id: many images, one shot, no name checks): creator submits images that were already PUT to R2 under staging/{uid}/{staging_id}/.
// POST { staging_id, shot_type: "mood"|"model", shot_id? }
//  - shot_id given  -> single upload: the (one) staged file becomes the next version of that shot.
//  - no shot_id     -> bulk upload: each file name (minus extension) must equal the SKU code of one of the
//                      caller's in-production shots of that type. Non-matching files are rejected with a line error.
// Per-file results: valid files are submitted (in_production -> submitted -> in_review); invalid ones are reported
// and their shots stay `in_production` (auto-bounce, the approver never sees them).
import {
  authenticate, BUCKET, copyObject, deleteObjects, HttpError, json, listObjects, objectKeyFor, serve,
} from "../_shared/common.ts";

type FileError = { file: string | null; message: string };

serve(async (req) => {
  const { user, role, db } = await authenticate(req, ["creator"]);
  const { staging_id: stagingId, shot_type: shotType, shot_id: shotId, variations } = await req.json();
  if (!/^[\w-]+$/.test(stagingId ?? "")) throw new HttpError(400, "invalid staging_id");
  if (shotType !== "mood" && shotType !== "model") throw new HttpError(400, "shot_type must be mood or model");
  const prefix = `staging/${user.id}/${stagingId}/`;

  // Shots this person can currently deliver for
  let q = db.from("shots")
    .select("id, shot_type, current_version, skus!inner(sku_code)")
    .eq("status", "in_production").eq("shot_type", shotType);
  if (role !== "admin") q = q.eq("creator_id", user.id);
  const { data: shots, error: sErr } = await q;
  if (sErr) throw new Error(sErr.message);

  const staged = await listObjects(prefix);
  const names = [...staged.keys()].map((k) => k.slice(prefix.length));
  if (!names.length) throw new HttpError(400, "no images were received");

  const errors: FileError[] = [];
  const plan: { shot: any; name: string; sku: string; version: number }[] = [];
  const claimed = new Set<string>();
  const isJpeg = (n: string) => /\.jpe?g$/i.test(n);

  if (shotId && variations) {
    // Variations: any number of images for ONE shot, no name checks. Each becomes its own pending version.
    const shot = (shots as any[] | null)?.find((s) => s.id === shotId);
    if (!shot) errors.push({ file: null, message: `this ${shotType} shot isn't awaiting an image from you` });
    else {
      let n = shot.current_version ?? 0;
      for (const name of names.sort()) {
        if (!isJpeg(name)) { errors.push({ file: name, message: "only .jpg / .jpeg images are accepted" }); continue; }
        plan.push({ shot, name, sku: shot.skus.sku_code, version: ++n });
      }
    }
  } else if (shotId) {
    const shot = (shots as any[] | null)?.find((s) => s.id === shotId);
    if (!shot) errors.push({ file: null, message: `this ${shotType} shot isn't awaiting an image from you` });
    else if (names.length !== 1) errors.push({ file: null, message: "upload exactly one image for a single shot" });
    else if (!isJpeg(names[0])) errors.push({ file: names[0], message: "only .jpg / .jpeg images are accepted" });
    else plan.push({ shot, name: names[0], sku: shot.skus.sku_code, version: (shot.current_version ?? 0) + 1 });
  } else {
    for (const name of names) {
      if (!isJpeg(name)) { errors.push({ file: name, message: "only .jpg / .jpeg images are accepted" }); continue; }
      const base = name.replace(/\.jpe?g$/i, "").trim().toLowerCase();
      const matches = (shots as any[] ?? []).filter((s) => s.skus.sku_code.trim().toLowerCase() === base);
      if (matches.length === 0) {
        errors.push({ file: name, message: `no ${shotType} shot assigned to you is awaiting an image for SKU '${name.replace(/\.jpe?g$/i, "")}'` });
      } else if (matches.length > 1) {
        errors.push({ file: name, message: "SKU code is ambiguous (matches more than one shot); upload it individually" });
      } else if (claimed.has(matches[0].id)) {
        errors.push({ file: name, message: "duplicate image for the same SKU" });
      } else {
        claimed.add(matches[0].id);
        plan.push({ shot: matches[0], name, sku: matches[0].skus.sku_code, version: (matches[0].current_version ?? 0) + 1 });
      }
    }
  }

  if (!plan.length) return json({ ok: false, error: "no valid images", submitted: 0, errors }, 422);

  // ---- push valid images to final keys, create assets + versions, advance shots ----
  const keyOf = (p: typeof plan[number]) => objectKeyFor(p.sku, shotType, p.version);
  for (const p of plan) await copyObject(prefix + p.name, keyOf(p));

  const { data: assets, error: aErr } = await db.from("assets").insert(plan.map((p) => ({
    provider: "r2", bucket: BUCKET(), object_key: keyOf(p), file_name: p.name,
    mime: "image/jpeg", size_bytes: staged.get(prefix + p.name),
  }))).select("id, object_key");
  if (aErr) throw new Error(aErr.message);
  const assetByKey = new Map(assets!.map((a) => [a.object_key, a.id]));

  const { error: vErr } = await db.from("shot_versions").insert(plan.map((p) => ({
    shot_id: p.shot.id, version_no: p.version, uploaded_by: user.id, asset_id: assetByKey.get(keyOf(p)),
  })));
  if (vErr) throw new Error(vErr.message);

  // one submitted -> in_review pair per shot, however many variations it received
  const perShot = new Map<string, { latest: number; count: number }>();
  for (const p of plan) {
    const e = perShot.get(p.shot.id) ?? { latest: 0, count: 0 };
    perShot.set(p.shot.id, { latest: Math.max(e.latest, p.version), count: e.count + 1 });
  }
  const transitions: any[] = [];
  for (const [shotId2, e] of perShot) {
    const { error } = await db.from("shots").update({ current_version: e.latest, status: "in_review" }).eq("id", shotId2);
    if (error) throw new Error(error.message);
    transitions.push(
      { entity_type: "shot", entity_id: shotId2, from_state: "in_production", to_state: "submitted", actor: user.id, note: e.count > 1 ? `${e.count} variations` : `v${e.latest}` },
      { entity_type: "shot", entity_id: shotId2, from_state: "submitted", to_state: "in_review", actor: user.id, note: "auto-validated" },
    );
  }
  const { error: tErr } = await db.from("transitions").insert(transitions);
  if (tErr) throw new Error(tErr.message);

  try { await deleteObjects([...staged.keys()]); } catch (e) { console.warn("staging cleanup failed", e); }
  return json({ ok: true, submitted: perShot.size, images: plan.length, errors });
});

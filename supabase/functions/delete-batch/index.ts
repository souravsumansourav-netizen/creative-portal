// delete-batch (admin only): POST { batch_id, confirm_name }
// 1 verify admin  2 collect asset keys  3 delete R2 objects  4 log transition  5 delete batch (FK cascade)  6 delete orphaned assets  7 delete uploads left with no SKUs
import { authenticate, deleteObjects, HttpError, json, serve } from "../_shared/common.ts";

serve(async (req) => {
  const { batch_id, confirm_name } = await req.json();
  // 1. admin only (authenticate lets admin through; every other role is rejected by the empty allow-list)
  const { user, db } = await authenticate(req, []);

  const { data: batch } = await db.from("batches").select("id, batch_no, name").eq("id", batch_id).maybeSingle();
  if (!batch) throw new HttpError(404, "batch not found");
  const label = `Batch ${batch.batch_no}`;
  if (confirm_name !== label && (!batch.name || confirm_name !== batch.name)) {
    throw new HttpError(400, `confirmation text does not match "${label}"`);
  }

  // 2. skus -> shots -> shot_versions -> assets
  const { data: skus } = await db.from("skus").select("id, upload_id").eq("batch_id", batch_id);
  const skuIds = (skus ?? []).map((s) => s.id);
  const uploadIds = [...new Set((skus ?? []).map((s) => s.upload_id).filter(Boolean) as string[])];
  let assets: { id: string; object_key: string }[] = [];
  if (skuIds.length) {
    const { data: shots } = await db.from("shots").select("id").in("sku_id", skuIds);
    const shotIds = (shots ?? []).map((s) => s.id);
    if (shotIds.length) {
      const { data: versions } = await db.from("shot_versions").select("asset_id").in("shot_id", shotIds).not("asset_id", "is", null);
      const assetIds = [...new Set((versions ?? []).map((v) => v.asset_id as string))];
      if (assetIds.length) {
        const { data } = await db.from("assets").select("id, object_key").in("id", assetIds);
        assets = data ?? [];
      }
    }
  }

  // 3. R2 first: if this throws, the DB is untouched and the delete can be retried
  await deleteObjects(assets.map((a) => a.object_key));

  // 4. audit row (entity_id has no FK, so it survives the batch)
  await db.from("transitions").insert({
    entity_type: "batch", entity_id: batch_id, from_state: "active", to_state: "deleted", actor: user.id,
    note: `${label}: ${skuIds.length} SKUs, ${assets.length} assets`,
  });

  // 5. cascade removes skus -> shots -> versions -> routings
  const { error: delErr } = await db.from("batches").delete().eq("id", batch_id);
  if (delErr) throw new Error(delErr.message);

  // 6. orphaned assets
  if (assets.length) {
    const { error } = await db.from("assets").delete().in("id", assets.map((a) => a.id));
    if (error) throw new Error(error.message);
  }

  // 7. uploads left with no SKUs in any batch: remove the upload record and its stored Excel file
  let deletedUploads = 0;
  for (const uploadId of uploadIds) {
    const { count } = await db.from("skus").select("id", { count: "exact", head: true }).eq("upload_id", uploadId);
    if ((count ?? 0) > 0) continue; // some of its SKUs live in another batch: keep the upload
    const { data: up } = await db.from("uploads").select("source_object_key").eq("id", uploadId).maybeSingle();
    if (up?.source_object_key) {
      try { await deleteObjects([up.source_object_key]); } catch (e) { console.warn("source excel not deleted", e); }
    }
    const { error } = await db.from("uploads").delete().eq("id", uploadId);
    if (error) throw new Error(error.message);
    deletedUploads++;
  }

  return json({ ok: true, deleted_assets: assets.length, deleted_skus: skuIds.length, deleted_uploads: deletedUploads });
});

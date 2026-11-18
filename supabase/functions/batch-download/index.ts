// batch-download: POST { batch_id, destination: "pdp"|"performance", include_done?: boolean }
// Streams a ZIP of approved-version images, mood and model in separate folders: mood/{sku_code}.jpg, model/{sku_code}.jpg. Objects are streamed from R2 one at a
// time (ZIP entries are "stored", JPEGs are already compressed), so memory stays ~one chunk regardless of batch size.
import { Zip, ZipPassThrough } from "npm:fflate@0.8.2";
import { authenticate, corsHeaders, getObject, HttpError, serve } from "../_shared/common.ts";

serve(async (req) => {
  const { batch_id, destination, include_done = true } = await req.json();
  if (destination !== "pdp" && destination !== "performance") throw new HttpError(400, "destination must be pdp or performance");
  const { db } = await authenticate(req, [destination === "pdp" ? "pdp_uploader" : "performance", "approver"]);

  let q = db.from("routings")
    .select("status, shots!inner(id, shot_type, skus!inner(sku_code, batch_id))")
    .eq("destination", destination).eq("released", true).eq("shots.skus.batch_id", batch_id);
  if (!include_done) q = q.eq("status", "pending");
  const { data: routings, error } = await q;
  if (error) throw new Error(error.message);
  if (!routings?.length) throw new HttpError(404, "nothing routed to this destination in this batch");

  // approved version asset for each shot
  const shotIds = routings.map((r: any) => r.shots.id);
  const { data: versions } = await db.from("shot_versions")
    .select("shot_id, version_no, assets(object_key)")
    .in("shot_id", shotIds).eq("review_status", "approved").order("version_no", { ascending: false });
  const keyByShot = new Map<string, string>();
  for (const v of (versions ?? []) as any[]) if (!keyByShot.has(v.shot_id) && v.assets) keyByShot.set(v.shot_id, v.assets.object_key);

  const items = routings
    // mood/ and model/ folders, each file named {sku_code}.jpg
    .map((r: any) => ({ key: keyByShot.get(r.shots.id), name: `${r.shots.shot_type}/${r.shots.skus.sku_code}.jpg` }))
    .filter((i): i is { key: string; name: string } => !!i.key);
  if (!items.length) throw new HttpError(404, "no approved assets found");

  let idx = 0;
  let ended = false;
  let zip: Zip;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
    },
    // pull() is only called when the consumer has drained the queue => natural backpressure, one object per pull
    async pull(controller) {
      if (idx >= items.length) {
        if (!ended) { ended = true; zip.end(); }
        return;
      }
      const item = items[idx++];
      try {
        const obj = await getObject(item.key);
        const entry = new ZipPassThrough(item.name);
        zip.add(entry);
        const reader = (obj.Body as any).transformToWebStream().getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { entry.push(new Uint8Array(0), true); break; }
          entry.push(value);
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${destination}_${batch_id}.zip"`,
    },
  });
});

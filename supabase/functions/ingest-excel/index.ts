// ingest-excel: multipart form with `file` (.xlsx/.xls/.csv). Creates an upload + one SKU per row in Batch 1.
import * as XLSX from "npm:xlsx@0.18.5";
import { authenticate, HttpError, json, putObject, serve } from "../_shared/common.ts";

const SKU_HEADERS = new Set(["sku", "skucode", "sku_code", "skuid", "sku_id", "itemcode", "stylecode"]);
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

serve(async (req) => {
  const { user, db } = await authenticate(req, ["uploader"]);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "file is required");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(bytes, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new HttpError(400, "workbook has no sheets");
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  if (rows.length < 2) throw new HttpError(400, "no data rows found");

  let col = rows[0].findIndex((h) => SKU_HEADERS.has(norm(h)));
  if (col < 0) col = 0; // fall back to the first column
  const seen = new Set<string>();
  const codes: string[] = [];
  let duplicates = 0;
  for (const r of rows.slice(1)) {
    const code = String(r[col] ?? "").trim();
    if (!code) continue;
    if (seen.has(code)) { duplicates++; continue; }
    seen.add(code);
    codes.push(code);
  }
  if (!codes.length) throw new HttpError(400, "no SKU codes found");

  // Batch 1 (create if missing)
  let { data: batch1 } = await db.from("batches").select("id").eq("batch_no", 1).maybeSingle();
  if (!batch1) {
    const ins = await db.from("batches").insert({ batch_no: 1, created_by: user.id }).select("id").single();
    if (ins.error) { // lost a race with another ingest
      batch1 = (await db.from("batches").select("id").eq("batch_no", 1).single()).data;
    } else {
      batch1 = ins.data;
      await db.from("transitions").insert({ entity_type: "batch", entity_id: batch1!.id, to_state: "created", actor: user.id });
    }
  }

  const { data: upload, error: upErr } = await db.from("uploads")
    .insert({ uploaded_by: user.id, file_name: file.name, sku_count: codes.length })
    .select("id").single();
  if (upErr) throw new Error(upErr.message);

  // Keep the original Excel in R2 (optional; ingest still succeeds if this fails)
  try {
    const key = `uploads/${upload.id}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
    await putObject(key, bytes, file.type || "application/octet-stream");
    await db.from("uploads").update({ source_object_key: key }).eq("id", upload.id);
  } catch (e) {
    console.warn("source excel not stored:", (e as Error).message);
  }

  const { data: skus, error: skuErr } = await db.from("skus")
    .insert(codes.map((sku_code) => ({ sku_code, upload_id: upload.id, batch_id: batch1!.id, triaged: false })))
    .select("id");
  if (skuErr) throw new Error(skuErr.message);

  const { error: tErr } = await db.from("transitions").insert(
    skus!.map((s) => ({
      entity_type: "sku", entity_id: s.id, from_state: null, to_state: "ingested",
      actor: user.id, note: `upload ${upload.id}`,
    })),
  );
  if (tErr) throw new Error(tErr.message);

  return json({ ok: true, upload_id: upload.id, sku_count: codes.length, duplicates_skipped: duplicates });
});

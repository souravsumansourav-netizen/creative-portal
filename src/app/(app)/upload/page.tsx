"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, btn, Card, Empty, Msg, PageHeader } from "@/components/ui";
import { TableSkeleton } from "@/components/controls";
import { FilePicker } from "@/components/controls";

export default function UploadPage() {
  const [uploads, setUploads] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [file, setFile] = useState<File | null>(null);

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const { data, error } = await supabaseBrowser()
      .from("uploads")
      .select("id, file_name, sku_count, created_at, skus(id, sku_code, triaged, batches(batch_no), shots(shot_type, status))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    setUploads(data ?? []);
  }, ["skus", "shots"]);

  async function onUpload() {
    if (!file) return;
    setBusy(true); setMsg({});
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await invoke("ingest-excel", fd);
      setMsg({ ok: `Ingested ${r.sku_count} SKUs into Batch 1${r.duplicates_skipped ? ` (${r.duplicates_skipped} duplicates skipped)` : ""}.` });
      setFile(null);
      reload();
    } catch (e) {
      setMsg({ error: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Upload SKUs" sub="Upload an Excel/CSV with a SKU column. All SKUs start in Batch 1 until the approver triages them." />
      <Card className="mb-6 flex flex-wrap items-center gap-3">
        <FilePicker className="min-w-[18rem] flex-1" files={file ? [file] : []} onFiles={(f) => setFile(f[0] ?? null)} accept=".xlsx,.xls,.csv" disabled={busy}
          label="Choose an Excel or CSV file" hint="Needs a SKU column. Drop it here or click." />
        <button className={btn} disabled={busy || !file} onClick={onUpload}>{busy ? "Uploading…" : "Upload"}</button>
      </Card>
      <Msg error={msg.error ?? loadError} ok={msg.ok} />

      <h2 className="mb-2 font-medium">My uploads</h2>
      {loading ? <TableSkeleton /> : !uploads.length ? <Empty hint="Choose an Excel or CSV file above to get started.">No uploads yet</Empty> : (
        <div className="stagger space-y-4">
          {uploads.map((u) => {
            const shots = u.skus.flatMap((s: any) => s.shots);
            const triaged = u.skus.filter((s: any) => s.triaged).length;
            return (
              <Card key={u.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b>{u.file_name}</b>
                    <span className="ml-2 text-sm text-stone-500">{new Date(u.created_at).toLocaleString()}</span>
                  </div>
                  <span className="text-sm text-stone-600">{u.sku_count} SKUs · {triaged} triaged · {shots.filter((s: any) => s.status === "done").length}/{shots.length} shots done</span>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-stone-600">SKU status</summary>
                  <table className="mt-2 w-full text-sm">
                    <thead><tr className="text-left text-stone-500"><th className="py-1">SKU</th><th>Batch</th><th>Shots</th></tr></thead>
                    <tbody>
                      {u.skus.map((s: any) => (
                        <tr key={s.id} className="border-t border-black/[0.05]">
                          <td className="py-1">{s.sku_code}</td>
                          <td>{s.batches ? `Batch ${s.batches.batch_no}` : "—"}</td>
                          <td className="flex flex-wrap gap-1 py-1">
                            {!s.triaged ? <span className="text-stone-400">awaiting triage</span> :
                              s.shots.map((sh: any) => <span key={sh.shot_type} className="flex items-center gap-1">{sh.shot_type} <Badge value={sh.status} /></span>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

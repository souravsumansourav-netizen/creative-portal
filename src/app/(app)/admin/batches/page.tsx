"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke, rpc } from "@/lib/api";
import { formatBytes, STORAGE_ALERT_BYTES, STORAGE_LIMIT_BYTES } from "@/lib/constants";
import { useLiveData } from "@/lib/hooks";
import { btnDanger, btnGhost, Card, Empty, input, Msg, PageHeader } from "@/components/ui";

export default function AdminBatchesPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [used, setUsed] = useState(0);
  const [target, setTarget] = useState<any | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [b, st, total] = await Promise.all([
      sb.from("v_batch_sku_counts").select("*").order("batch_no"),
      sb.from("v_batch_storage").select("*"),
      rpc<number>("storage_used_bytes", {}),
    ]);
    if (b.error) throw b.error;
    const size = new Map<string, any>((st.data ?? []).map((r: any) => [r.batch_id, r]));
    setBatches((b.data ?? []).map((r: any) => ({ ...r, bytes: Number(size.get(r.batch_id)?.bytes ?? 0), images: size.get(r.batch_id)?.images ?? 0 })));
    setUsed(Number(total));
  }, ["skus"]);

  const label = (b: any) => `Batch ${b.batch_no}`;

  async function del() {
    setBusy(true); setMsg({});
    try {
      const r = await invoke("delete-batch", { batch_id: target.batch_id, confirm_name: typed });
      setMsg({ ok: `${label(target)} deleted (${r.deleted_skus} SKUs, ${r.deleted_assets} images).` });
      setTarget(null); setTyped(""); reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Batch management" sub="Deleting a batch permanently removes its SKUs, shots, versions, routings and R2 images." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      <Card className="mb-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="font-medium">Image storage</span>
          <span className={used >= STORAGE_ALERT_BYTES ? "font-semibold text-red-700" : "text-stone-600"}>
            {formatBytes(used)} of {formatBytes(STORAGE_LIMIT_BYTES)} · alert at {formatBytes(STORAGE_ALERT_BYTES)}
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded bg-stone-100">
          <div className={`h-3 ${used >= STORAGE_ALERT_BYTES ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (used / STORAGE_LIMIT_BYTES) * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs text-stone-500">Counts stored images only (not temporary uploads or source Excel files). Delete finished batches to free space.</p>
      </Card>
      {loading ? <p className="text-sm text-stone-500">Loading…</p> : !batches.length ? <Empty>No batches.</Empty> : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500"><tr><th className="p-2">Batch</th><th>SKUs</th><th>Untriaged</th><th>Images</th><th>Size</th><th /></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batch_id} className="border-t border-stone-100">
                  <td className="p-2 font-medium">{label(b)}{b.name && <span className="ml-2 text-stone-500">{b.name}</span>}</td>
                  <td>{b.skus}</td><td>{b.untriaged}</td><td>{b.images}</td><td>{formatBytes(b.bytes)}</td>
                  <td className="p-2 text-right"><button className={btnDanger} onClick={() => { setTarget(b); setTyped(""); }}>Delete…</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {target && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-2 text-lg font-semibold text-red-700">Delete {label(target)}?</h2>
            <p className="mb-3 text-sm text-stone-600">
              This permanently deletes {target.skus} SKU(s) and every image for them. It cannot be undone.
              Type <b>{label(target)}</b> to confirm.
            </p>
            <input className={`${input} mb-3 w-full`} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setTarget(null)}>Cancel</button>
              <button className={btnDanger} disabled={busy || typed !== label(target)} onClick={del}>{busy ? "Deleting…" : "Delete batch"}</button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

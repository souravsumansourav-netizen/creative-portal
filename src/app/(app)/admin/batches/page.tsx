"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke, rpc } from "@/lib/api";
import { formatBytes, STORAGE_ALERT_BYTES, STORAGE_LIMIT_BYTES } from "@/lib/constants";
import { useLiveData } from "@/lib/hooks";
import { btnDanger, btnGhost, Card, Empty, input, Msg, PageHeader } from "@/components/ui";
import { TableSkeleton } from "@/components/controls";

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
      <PageHeader title="Batch management" sub="Deleting a batch permanently removes its SKUs and images." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      <Card className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[0.9375rem] font-medium">Image storage</span>
          <span className={`text-sm tabular-nums ${used >= STORAGE_ALERT_BYTES ? "font-semibold text-ink-red" : "text-stone-500"}`}>
            {formatBytes(used)} of {formatBytes(STORAGE_LIMIT_BYTES)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
          <div className={`h-1.5 rounded-full transition-[width] duration-500 ${used >= STORAGE_ALERT_BYTES ? "bg-apple-red" : "bg-apple-green"}`} style={{ width: `${Math.min(100, (used / STORAGE_LIMIT_BYTES) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-stone-500">Stored images only. You&apos;re alerted at {formatBytes(STORAGE_ALERT_BYTES)}.</p>
      </Card>

      {loading ? <TableSkeleton /> : !batches.length ? <Empty>No batches yet</Empty> : (
        <Card className="divide-y divide-black/[0.06] p-0">
          {batches.map((b) => (
            <div key={b.batch_id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-medium text-stone-900">{label(b)}{b.name && <span className="ml-2 font-normal text-stone-500">{b.name}</span>}</p>
                <p className="text-sm tabular-nums text-stone-500">
                  {b.skus} SKU{b.skus === 1 ? "" : "s"}{b.untriaged ? ` · ${b.untriaged} untriaged` : ""} · {b.images} image{b.images === 1 ? "" : "s"} · {formatBytes(b.bytes)}
                </p>
              </div>
              <button className="rounded-[10px] bg-apple-red/10 px-3.5 py-2 text-[0.875rem] font-medium text-ink-red transition-[background-color,transform] duration-150 hover:bg-apple-red/[0.16] active:scale-[0.97]"
                onClick={() => { setTarget(b); setTyped(""); }}>Delete…</button>
            </div>
          ))}
        </Card>
      )}

      {target && (
        <div className="scrim anim-fade fixed inset-0 z-50 flex items-center justify-center p-4">
          <Card className="sheet anim-pop w-full max-w-md !rounded-2xl">
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

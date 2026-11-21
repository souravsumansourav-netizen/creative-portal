"use client";
import { use, useState } from "react";
import { notFound } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadAsset, invoke, rpc, saveBlob } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btn, btnGhost, Card, Empty, Msg, PageHeader, R2Image } from "@/components/ui";
import { RefImage } from "@/components/RefImage";
import { TableSkeleton } from "@/components/controls";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

/** Approved image for a routing: the approved version, else the latest. */
const approvedKey = (r: any): string | undefined => {
  const vs = [...(r.shots?.shot_versions ?? [])].sort((a: any, b: any) => b.version_no - a.version_no);
  return (vs.find((v: any) => v.review_status === "approved") ?? vs[0])?.assets?.object_key;
};
const fileName = (r: any) => `${r.shots.skus.sku_code}_${r.shots.shot_type}.jpg`;

export default function OutputPage({ params }: { params: Promise<{ dest: string }> }) {
  const { dest } = use(params);
  if (dest !== "pdp" && dest !== "performance") notFound();

  const [routings, setRoutings] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null); // routing id

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const { data, error } = await supabaseBrowser()
      .from("routings")
      .select("id, status, campaign_name, shots(shot_type, skus(sku_code, batch_id, batches(id, batch_no, name)), shot_versions(version_no, review_status, assets(object_key)))")
      .eq("destination", dest).eq("released", true).order("routed_at");
    if (error) throw error;
    setRoutings(data ?? []);
  }, ["routings"]);

  const groups = new Map<string, { batch: any; items: any[] }>();
  for (const r of routings) {
    const b = r.shots.skus.batches;
    if (!groups.has(b.id)) groups.set(b.id, { batch: b, items: [] });
    groups.get(b.id)!.items.push(r);
  }

  async function download(batchId: string, label: string) {
    setBusy(batchId); setMsg({});
    try {
      const blob = await invoke<Blob>("batch-download", { batch_id: batchId, destination: dest });
      saveBlob(blob, `${label.replace(/\W+/g, "_")}_${dest}.zip`);
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(null);
  }

  async function markDone(ids: string[]) {
    setMsg({});
    try { for (const id of ids) await rpc("complete_routing", { p_routing_id: id }); reload(); }
    catch (e) { setMsg({ error: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title={dest === "pdp" ? "PDP uploads" : "Performance uploads"} sub="Download a batch, then mark items done." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      {loading ? <TableSkeleton /> : !groups.size ? <Empty hint="Approved shots appear here once they are sent to this team.">Nothing routed here yet</Empty> : (
        <div className="stagger space-y-5">
          {[...groups.values()].map(({ batch, items }) => {
            const pending = items.filter((i) => i.status === "pending");
            const label = batchLabel(batch);
            return (
              <Card key={batch.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">{label} <span className="text-sm font-normal text-stone-500">· {pending.length} pending / {items.length}</span></h2>
                  <div className="flex gap-2">
                    <button className={btnGhost} disabled={busy === batch.id} onClick={() => download(batch.id, `Batch_${batch.batch_no}`)}>{busy === batch.id ? "Preparing ZIP…" : "Download batch (.zip)"}</button>
                    <button className={btn} disabled={!pending.length} onClick={() => markDone(pending.map((p) => p.id))}>Mark all done</button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-stone-500"><tr><th>Preview</th><th>SKU</th><th>Type</th>{dest === "performance" && <th>Campaign</th>}<th>Status</th><th /></tr></thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.id} className="border-t border-black/[0.05]">
                        <td className="py-2">
                          <button type="button" title="Click to enlarge" onClick={() => setPreview(r.id)}>
                            <R2Image objectKey={approvedKey(r)} className="h-24 w-24 rounded border border-stone-200" />
                          </button>
                        </td>
                        <td className="py-1.5 font-medium">{r.shots.skus.sku_code}</td>
                        <td>{r.shots.shot_type}</td>
                        {dest === "performance" && <td>{r.campaign_name}</td>}
                        <td><Badge value={r.status} /></td>
                        <td className="space-x-2 whitespace-nowrap text-right">
                          <button className={btnGhost} disabled={!approvedKey(r)} onClick={() => downloadAsset(approvedKey(r)!, fileName(r))}><Download size={15} /> Download</button>
                          {r.status === "pending" && <button className={btn} onClick={() => markDone([r.id])}>Mark done</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}
      {(() => {
        const pr = preview ? routings.find((r) => r.id === preview) : null;
        if (!pr) return null;
        const pi = routings.findIndex((r) => r.id === pr.id);
        return (
          <div className="scrim anim-fade fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
            <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl sheet anim-pop" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-2 text-sm">
                <b className="text-base">{pr.shots.skus.sku_code}</b>
                <span className="rounded-full bg-stone-100 px-2 py-0.5">{pr.shots.shot_type}</span>
                {dest === "performance" && pr.campaign_name && <span className="text-stone-500">Campaign: {pr.campaign_name}</span>}
                <span className="text-stone-500">{pi + 1} of {routings.length}</span>
                <span className="flex-1" />
                <button className={btn} disabled={!approvedKey(pr)} onClick={() => downloadAsset(approvedKey(pr)!, fileName(pr))}><Download size={15} /> Download</button>
                <button className={btnGhost} disabled={pi <= 0} onClick={() => setPreview(routings[pi - 1].id)}><ChevronLeft size={16} /></button>
                <button className={btnGhost} disabled={pi >= routings.length - 1} onClick={() => setPreview(routings[pi + 1].id)}><ChevronRight size={16} /></button>
                <button className={btnGhost} onClick={() => setPreview(null)}><X size={16} /></button>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-stone-300">
                <div className="bg-white p-2"><p className="mb-1 text-xs text-stone-500">Approved image</p><R2Image objectKey={approvedKey(pr)} className="h-[68vh] w-full" /></div>
                <div className="bg-white p-2"><p className="mb-1 text-xs text-stone-500">Original · tanishq.co.in</p><RefImage sku={pr.shots.skus.sku_code} lazy={false} className="h-[68vh] w-full" /></div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

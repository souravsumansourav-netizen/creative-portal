"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btn, btnGhost, Card, Empty, input, Msg, PageHeader, R2Image } from "@/components/ui";
import { RefImage } from "@/components/RefImage";

/** The approved image for a routing row: the approved version, else the latest one. */
const approvedKey = (r: any): string | undefined => {
  const vs = [...(r.shots?.shot_versions ?? [])].sort((a: any, b: any) => b.version_no - a.version_no);
  return (vs.find((v: any) => v.review_status === "approved") ?? vs[0])?.assets?.object_key;
};

/** Module-level so the thumbnails don't remount (and flicker) every time a checkbox changes. */
function CampaignTable({ rows, sel, toggle, setMany, onRelease, onPreview }: {
  rows: any[]; sel: Set<string>; toggle: (id: string) => void; setMany: (ids: string[], on: boolean) => void;
  onRelease: (ids: string[]) => void; onPreview: (r: any) => void;
}) {
  const waiting = rows.filter((r) => !r.released).map((r) => r.id);
  const chosen = waiting.filter((i) => sel.has(i));
  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-stone-500">
          <tr>
            <th className="w-8"><input type="checkbox" disabled={!waiting.length} checked={!!waiting.length && chosen.length === waiting.length} onChange={(e) => setMany(waiting, e.target.checked)} /></th>
            <th>Preview</th><th>Batch</th><th>SKU</th><th>Type</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-stone-100">
              <td className="py-2">{!r.released && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />}</td>
              <td className="py-2">
                <button type="button" title="Click to enlarge" onClick={() => onPreview(r)}>
                  <R2Image objectKey={approvedKey(r)} className="h-28 w-28 rounded border border-stone-200" />
                </button>
              </td>
              <td>{batchLabel(r.shots.skus.batches)}</td>
              <td className="font-medium">{r.shots.skus.sku_code}</td>
              <td>{r.shots.shot_type}</td>
              <td>{r.released ? <Badge value={r.status} /> : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">not sent</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3">
        <button className={btn} disabled={!chosen.length} onClick={() => onRelease(chosen)}>Send {chosen.length || ""} selected to Performance</button>
        <span className="text-xs text-stone-500">{waiting.length} waiting · {rows.length - waiting.length} already sent</span>
      </div>
    </>
  );
}

/**
 * PDP shots go straight to the PDP team when approved. Here the approver/admin reviews the shots planned for
 * performance, campaign by campaign, and picks which ones to send as the final set.
 */
export default function RoutingPage() {
  const [routings, setRoutings] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null); // routing id
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [uSel, setUSel] = useState<Set<string>>(new Set());
  const [uDest, setUDest] = useState<"pdp" | "performance" | "both">("pdp");
  const [uCampaign, setUCampaign] = useState("");

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [r, u] = await Promise.all([
      sb.from("routings")
        .select("id, destination, campaign_name, status, released, shots(shot_type, status, skus(sku_code, batches(batch_no, name)), shot_versions(version_no, review_status, assets(object_key)))")
        .eq("destination", "performance").order("routed_at"),
      sb.from("shots")
        .select("id, shot_type, skus(sku_code, batches(batch_no, name)), routings(id)")
        .eq("status", "approved").order("created_at"),
    ]);
    if (r.error) throw r.error;
    if (u.error) throw u.error;
    setRoutings(r.data ?? []);
    setUnassigned((u.data ?? []).filter((s: any) => s.routings.length === 0));
  }, ["shots", "routings"]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });

  async function release(ids: string[]) {
    setMsg({});
    try {
      const n = await rpc<number>("release_routings", { p_ids: ids });
      setMsg({ ok: `Sent ${n} shot(s) to Performance.` });
      setMany(ids, false); reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  async function assign() {
    const needs = uDest !== "pdp";
    if (needs && !uCampaign.trim()) return setMsg({ error: "Campaign name is required for performance." });
    setMsg({});
    try {
      for (const id of uSel) {
        await rpc("route_shot", { p_shot_id: id, p_destinations: uDest === "both" ? ["pdp", "performance"] : [uDest], p_campaign: needs ? uCampaign.trim() : null });
      }
      setMsg({ ok: `Assigned ${uSel.size} shot(s).${uDest === "pdp" ? "" : " Performance shots appear above, ready to send."}` });
      setUSel(new Set()); reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  const campaigns = new Map<string, any[]>();
  for (const r of routings) {
    const k = r.campaign_name || "(no campaign)";
    campaigns.set(k, [...(campaigns.get(k) ?? []), r]);
  }
  const pi = preview ? routings.findIndex((r) => r.id === preview) : -1;
  const pr = pi >= 0 ? routings[pi] : null;

  return (
    <>
      <PageHeader title="Routing" sub="PDP shots go to the PDP team automatically on approval. Pick which performance shots to send on, campaign by campaign." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      {loading ? <p className="text-sm text-stone-500">Loading…</p> : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-medium">Performance · by campaign</h2>
            {!campaigns.size ? <Empty>Nothing assigned to performance.</Empty> : (
              <div className="space-y-4">
                {[...campaigns.entries()].map(([name, rows]) => (
                  <Card key={name}>
                    <h3 className="mb-2 font-medium">Campaign: {name} <span className="text-sm font-normal text-stone-500">· {rows.length} shot(s)</span></h3>
                    <CampaignTable rows={rows} sel={sel} toggle={toggle} setMany={setMany} onRelease={release} onPreview={(r) => setPreview(r.id)} />
                  </Card>
                ))}
              </div>
            )}
          </section>

          {unassigned.length > 0 && (
            <section>
              <h2 className="mb-2 font-medium">Approved, no destination yet <span className="text-sm font-normal text-stone-500">· {unassigned.length}</span></h2>
              <Card>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                  <select className={input} value={uDest} onChange={(e) => setUDest(e.target.value as any)}>
                    <option value="pdp">PDP</option><option value="performance">Performance</option><option value="both">Both</option>
                  </select>
                  {uDest !== "pdp" && <input className={input} placeholder="Campaign name (required)" value={uCampaign} onChange={(e) => setUCampaign(e.target.value)} />}
                  <button className={btn} disabled={!uSel.size} onClick={assign}>Assign {uSel.size || ""} selected</button>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {unassigned.map((s) => (
                      <tr key={s.id} className="border-t border-stone-100">
                        <td className="w-8 py-1.5"><input type="checkbox" checked={uSel.has(s.id)} onChange={() => setUSel((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} /></td>
                        <td>{batchLabel(s.skus.batches)}</td><td className="font-medium">{s.skus.sku_code}</td><td>{s.shot_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}
        </div>
      )}

      {pr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-2 text-sm">
              <b className="text-base">{pr.shots.skus.sku_code}</b>
              <span className="rounded-full bg-stone-100 px-2 py-0.5">{pr.shots.shot_type}</span>
              <span className="text-stone-500">Campaign: {pr.campaign_name} · {pi + 1} of {routings.length}</span>
              <span className="flex-1" />
              {!pr.released && (
                <label className="flex items-center gap-2"><input type="checkbox" checked={sel.has(pr.id)} onChange={() => toggle(pr.id)} /> Include in send</label>
              )}
              <button className={btnGhost} disabled={pi <= 0} onClick={() => setPreview(routings[pi - 1].id)}>←</button>
              <button className={btnGhost} disabled={pi >= routings.length - 1} onClick={() => setPreview(routings[pi + 1].id)}>→</button>
              <button className={btnGhost} onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-stone-300">
              <div className="bg-white p-2"><p className="mb-1 text-xs text-stone-500">Approved image</p><R2Image objectKey={approvedKey(pr)} className="h-[68vh] w-full" /></div>
              <div className="bg-white p-2"><p className="mb-1 text-xs text-stone-500">Original · tanishq.co.in</p><RefImage sku={pr.shots.skus.sku_code} lazy={false} className="h-[68vh] w-full" /></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

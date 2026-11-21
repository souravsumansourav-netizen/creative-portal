"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLiveData } from "@/lib/hooks";
import { Card, Empty, PageHeader } from "@/components/ui";
import { STAGES } from "@/lib/constants";
import { TableSkeleton } from "@/components/controls";

const STAGE_COLOR: Record<string, string> = {
  in_production: "bg-apple-orange", submitted: "bg-apple-blue", in_review: "bg-apple-purple", approved: "bg-apple-green", done: "bg-apple-gray",
};

function fmtDuration(seconds?: number | null) {
  if (seconds == null) return "—";
  const m = seconds / 60;
  if (m < 60) return `${m.toFixed(1)} min`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

export default function DashboardPage() {
  const [stage, setStage] = useState<any[]>([]);
  const [skuCounts, setSkuCounts] = useState<any[]>([]);
  const [ttc, setTtc] = useState<any[]>([]);
  const [aging, setAging] = useState<any[]>([]);
  const [rej, setRej] = useState<any[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);

  const { loading, error: loadError } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [a, b, c, d, e] = await Promise.all([
      sb.from("v_batch_stage_counts").select("*"),
      sb.from("v_batch_sku_counts").select("*").order("batch_no"),
      sb.from("v_batch_time_to_complete").select("*").order("batch_no"),
      sb.from("v_stage_aging").select("*"),
      sb.from("v_creator_rejection").select("*"),
    ]);
    for (const r of [a, b, c, d, e]) if (r.error) throw r.error;
    setStage(a.data ?? []); setSkuCounts(b.data ?? []); setTtc(c.data ?? []); setAging(d.data ?? []); setRej(e.data ?? []);
    setUpdated(new Date());
  }, ["transitions", "skus"]);

  const byBatch = (id: string) => Object.fromEntries(stage.filter((s) => s.batch_id === id).map((s) => [s.stage, s.shots]));
  const agingMax = Math.max(1, ...aging.map((a) => a.avg_seconds ?? 0));
  const order = (s: string) => STAGES.indexOf(s as any);

  if (loading) return <TableSkeleton />;
  if (loadError) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</p>;

  return (
    <>
      <PageHeader title="Dashboard" sub={updated ? `Live · updated ${updated.toLocaleTimeString()}` : undefined} />

      <h2 className="mb-2 font-medium">Batch stage tracker</h2>
      {!skuCounts.length ? <Empty>No batches yet.</Empty> : (
        <Card className="mb-6 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.025] text-left text-stone-500">
              <tr><th className="p-2">Batch</th><th>Untriaged SKUs</th>{STAGES.map((s) => <th key={s}>{s.replace("_", " ")}</th>)}<th className="w-64">Progress</th></tr>
            </thead>
            <tbody>
              {skuCounts.map((b) => {
                const counts = byBatch(b.batch_id);
                const total = STAGES.reduce((n, s) => n + (counts[s] ?? 0), 0);
                return (
                  <tr key={b.batch_id} className="border-t border-black/[0.05]">
                    <td className="p-2 font-medium">Batch {b.batch_no}</td>
                    <td>{b.untriaged}</td>
                    {STAGES.map((s) => <td key={s}>{counts[s] ?? 0}</td>)}
                    <td>
                      <div className="flex h-3 overflow-hidden rounded bg-stone-100">
                        {total > 0 && STAGES.map((s) => <div key={s} className={STAGE_COLOR[s]} style={{ width: `${((counts[s] ?? 0) / total) * 100}%` }} title={`${s}: ${counts[s] ?? 0}`} />)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium">Time to complete</h2>
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.025] text-left text-stone-500"><tr><th className="p-2">Batch</th><th>Shots done</th><th>Elapsed</th></tr></thead>
              <tbody>
                {ttc.map((t) => {
                  const complete = t.shots_total > 0 && t.shots_done === t.shots_total;
                  const secs = t.started_at && t.last_done_at ? (+new Date(t.last_done_at) - +new Date(t.started_at)) / 1000 : null;
                  return (
                    <tr key={t.batch_id} className="border-t border-black/[0.05]">
                      <td className="p-2 font-medium">Batch {t.batch_no}</td>
                      <td>{t.shots_done}/{t.shots_total}</td>
                      <td>{complete ? fmtDuration(secs) : <span className="text-stone-400">in progress</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="mb-2 font-medium">Stage aging <span className="text-sm font-normal text-stone-500">(avg time spent in each state)</span></h2>
          <Card className="space-y-2">
            {!aging.length ? <p className="text-sm text-stone-500">Not enough transitions yet.</p> :
              [...aging].sort((a, b) => order(a.stage) - order(b.stage)).map((a) => (
                <div key={a.stage} className="text-sm">
                  <div className="flex justify-between"><span>{a.stage.replace("_", " ")} <span className="text-stone-400">n={a.samples}</span></span><b>{fmtDuration(a.avg_seconds)}</b></div>
                  <div className="h-2 rounded bg-stone-100"><div className={`h-2 rounded ${STAGE_COLOR[a.stage] ?? "bg-stone-400"}`} style={{ width: `${(a.avg_seconds / agingMax) * 100}%` }} /></div>
                </div>
              ))}
          </Card>
        </section>
      </div>

      <h2 className="mb-2 mt-6 font-medium">Creator rejection rate</h2>
      {!rej.length ? <Empty>No submissions yet.</Empty> : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.025] text-left text-stone-500"><tr><th className="p-2">Creator</th><th>Submissions</th><th>Rejections</th><th>Rate</th></tr></thead>
            <tbody>
              {rej.map((r) => (
                <tr key={r.creator_id} className="border-t border-black/[0.05]">
                  <td className="p-2 font-medium">{r.creator}</td><td>{r.submissions}</td><td>{r.rejections}</td>
                  <td>{r.submissions ? `${Math.round((r.rejections / r.submissions) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

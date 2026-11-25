"use client";
import { CATEGORY_ORDER, categoryOf } from "@/lib/skuCategory";

/** Shape the panel needs: one entry per non-dropped shot. */
export type PipelineShot = {
  status: string;
  skus: { sku_code: string };
  shot_versions: { review_status: string; reject_comment: string | null }[];
};

type Tally = { fresh: number; redo: number; review: number; done: number };
const empty = (): Tally => ({ fresh: 0, redo: 0, review: 0, done: 0 });

/** A shot the reviewer sent back (a real rejection; "Not selected" variations don't count). */
const isRedo = (s: PipelineShot) =>
  s.shot_versions.some((v) => v.review_status === "rejected" && !String(v.reject_comment ?? "").startsWith("Not selected"));

/** Per-category progress for the reviewer: what is still with creators (new / sent back), in review, approved. */
export function PipelineStatus({ shots }: { shots: PipelineShot[] }) {
  const by = new Map<string, Tally>();
  const total = empty();
  for (const s of shots) {
    const g = categoryOf(s.skus.sku_code).group;
    const t = by.get(g) ?? empty();
    by.set(g, t);
    for (const x of [t, total]) {
      if (s.status === "in_production") (isRedo(s) ? x.redo++ : x.fresh++);
      else if (s.status === "submitted" || s.status === "in_review") x.review++;
      else if (s.status === "approved" || s.status === "done") x.done++;
    }
  }
  const left = (t: Tally) => t.fresh + t.redo;
  const sum = (t: Tally) => t.fresh + t.redo + t.review + t.done;
  // biggest backlog first: that is what the reviewer is asking about
  const groups = [...by.keys()].sort((a, b) => left(by.get(b)!) - left(by.get(a)!) || CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  const withCreators = left(total);
  const all = sum(total);
  const pct = all ? Math.round((total.done / all) * 100) : 0;

  if (!all) return <p className="py-6 text-center text-sm text-stone-500">No shots in the pipeline yet.</p>;

  // bar segments, left to right: finished work first, what is still open last
  const SEG: { key: keyof Tally; label: string; bar: string; dot: string; text: string }[] = [
    { key: "done", label: "Approved", bar: "bg-apple-green", dot: "bg-apple-green", text: "text-white" },
    { key: "review", label: "In review", bar: "bg-apple-purple", dot: "bg-apple-purple", text: "text-white" },
    { key: "redo", label: "Sent back", bar: "bg-red-600", dot: "bg-red-600", text: "text-white" },
    { key: "fresh", label: "Not uploaded", bar: "bg-stone-300", dot: "bg-stone-300", text: "text-stone-700" },
  ];

  const tiles: { label: string; n: number; sub: string; dot: string; tone?: string }[] = [
    { label: "With creators", n: withCreators, sub: `${total.fresh} new · ${total.redo} redo`, dot: "bg-apple-orange" },
    { label: "Sent back", n: total.redo, sub: "waiting on creators to redo", dot: "bg-red-600", tone: total.redo ? "text-red-700" : "" },
    { label: "In review", n: total.review, sub: "waiting on you", dot: "bg-apple-purple" },
    { label: "Approved", n: total.done, sub: `${pct}% of ${all}`, dot: "bg-apple-green" },
  ];

  return (
    <div className="text-sm">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-black/[0.06] bg-white p-3.5 shadow-card">
            <p className="flex items-center gap-1.5 text-[0.75rem] font-medium text-stone-500"><span className={`h-2 w-2 rounded-full ${t.dot}`} />{t.label}</p>
            <p className={`mt-1.5 text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums ${t.tone || "text-stone-900"}`}>{t.n}</p>
            <p className="mt-1.5 text-xs text-stone-500">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-[0.8125rem] font-semibold text-stone-800">By category</p>
        <ul className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-stone-500">
          {SEG.map((g) => <li key={g.key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${g.dot}`} />{g.label}</li>)}
        </ul>
      </div>

      <ul className="mt-2.5 divide-y divide-black/[0.05] overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        {groups.map((g) => {
          const t = by.get(g)!;
          const n = sum(t);
          const open = left(t);
          return (
            <li key={g} className="px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-medium text-stone-900">{g}</span>
                <span className="text-xs tabular-nums text-stone-500">
                  {open ? <><b className="text-[0.9375rem] font-semibold text-stone-900">{open}</b> left with creators</> : <span className="font-medium text-apple-green">All done</span>}
                  <span className="text-stone-300"> · </span>{t.done}/{n} approved
                </span>
              </div>
              <div className="flex h-6 gap-px overflow-hidden rounded-full bg-black/[0.05]" role="img"
                aria-label={SEG.map((x) => `${t[x.key]} ${x.label.toLowerCase()}`).join(", ")}>
                {SEG.map((x) => t[x.key] > 0 && (
                  <div key={x.key} className={`flex items-center justify-center text-[0.6875rem] font-semibold tabular-nums ${x.bar} ${x.text}`}
                    style={{ width: `${(t[x.key] / n) * 100}%` }} title={`${t[x.key]} ${x.label.toLowerCase()}`}>
                    {t[x.key] / n >= 0.08 ? t[x.key] : ""}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

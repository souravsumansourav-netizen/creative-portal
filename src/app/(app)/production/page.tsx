"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke, postResubmitComment, uploadToR2 } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btn, Card, Empty, input, Msg, PageHeader, R2Image } from "@/components/ui";
import { REJECT_REASONS } from "@/lib/constants";

type ShotType = "mood" | "model";
type Filter = "todo" | "review" | "done";
type FileError = { file: string | null; message: string };

const THEME: Record<ShotType, { label: string; tab: string; box: string; hint: string }> = {
  mood: {
    label: "Mood shots",
    tab: "border-amber-500 text-amber-700",
    box: "border-amber-300 bg-amber-50",
    hint: "Name each image exactly like the SKU code, e.g. 50D6C4BWJLAP1.jpg",
  },
  model: {
    label: "Model shots",
    tab: "border-maroon-600 text-maroon-700",
    box: "border-maroon-200 bg-maroon-50",
    hint: "Name each model image exactly like the SKU code, e.g. 50D6C4BWJLAP1.jpg",
  },
};

const FILTERS: { key: Filter; label: string; match: (s: string) => boolean }[] = [
  { key: "todo", label: "To do", match: (s) => s === "in_production" },
  { key: "review", label: "In review", match: (s) => s === "submitted" || s === "in_review" },
  { key: "done", label: "Approved / done", match: (s) => s === "approved" || s === "done" },
];

export default function ProductionPage() {
  const [shots, setShots] = useState<any[]>([]);
  const [tab, setTab] = useState<ShotType | "variations">("mood");
  const [filter, setFilter] = useState<Filter>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [errors, setErrors] = useState<FileError[]>([]);
  const bulkRef = useRef<HTMLInputElement>(null);

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const { data, error } = await supabaseBrowser()
      .from("shots")
      .select("id, shot_type, status, current_version, skus(sku_code, batches(id, batch_no, name)), shot_versions(version_no, review_status, reject_reason, reject_comment, assets(object_key))")
      .neq("status", "dropped").order("created_at");
    if (error) throw error;
    setShots(data ?? []);
  }, ["shots", "shot_versions"]);

  /** Upload files straight to R2 (staging), then ask the function to validate + submit them. */
  async function send(files: File[], shotType: ShotType, shotId?: string, variations = false, comment?: string) {
    if (!files.length) return;
    setBusy(shotId ?? "bulk"); setMsg({}); setErrors([]);
    try {
      const stagingId = crypto.randomUUID();
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      const prefix = `staging/${user!.id}/${stagingId}/`;
      const queue = [...files];
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) await uploadToR2(prefix + f.name, f);
      }));
      const r = await invoke("validate-upload", { staging_id: stagingId, shot_type: shotType, shot_id: shotId, variations });
      if (comment?.trim() && shotId) await postResubmitComment(shotId, comment.trim(), r.images ?? files.length);
      setMsg({ ok: variations ? `Submitted ${r.images} variation${r.images === 1 ? "" : "s"} for review.` : `Submitted ${r.submitted} ${shotType} shot${r.submitted === 1 ? "" : "s"} for review.` });
      setErrors(r.errors ?? []);
      if (bulkRef.current) bulkRef.current.value = "";
      if (!variations) setFilter("review");
      reload();
    } catch (e) {
      setMsg({ error: (e as Error).message });
      setErrors((e as any).errors ?? []);
    }
    setBusy(null);
  }

  const reason = (v: string) => REJECT_REASONS.find((r) => r.value === v)?.label ?? v;
  const shotTab: ShotType = tab === "variations" ? "mood" : tab;
  const ofType = shots.filter((s) => s.shot_type === shotTab);
  const active = FILTERS.find((f) => f.key === filter)!;
  const rows = ofType.filter((s) => active.match(s.status));
  const count = (t: ShotType, f: Filter) => shots.filter((s) => s.shot_type === t && FILTERS.find((x) => x.key === f)!.match(s.status)).length;
  const theme = THEME[shotTab];

  return (
    <>
      <PageHeader title="Production" sub="Upload one image per shot, or drop many at once named after the SKU code. JPEG only." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />
      {errors.length > 0 && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="mb-2 text-sm font-medium text-red-800">These files were not accepted (their shots stay in production):</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-800">
            {errors.map((e, i) => <li key={i}>{e.file ? <b>{e.file}: </b> : null}{e.message}</li>)}
          </ul>
        </Card>
      )}

      <SummaryCards shots={shots} filter={filter} onFilter={setFilter} />

      <div className="mb-4 flex gap-2 border-b border-stone-200">
        {(Object.keys(THEME) as ShotType[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? THEME[t].tab : "border-transparent text-stone-500 hover:text-stone-800"}`}>
            {THEME[t].label} <span className="ml-1 rounded-full bg-stone-100 px-2 text-xs text-stone-600">{count(t, "todo")} to do</span>
          </button>
        ))}
        <button onClick={() => setTab("variations")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === "variations" ? "border-teal-500 text-teal-700" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
          Variations
        </button>
      </div>

      {tab === "variations" ? (
        <VariationsPanel shots={shots} busy={busy} onSend={(files, shot, note) => send(files, shot.shot_type, shot.id, true, note)} />
      ) : (<>
      <Card className={`mb-4 flex flex-wrap items-center gap-3 text-sm ${theme.box}`}>
        <div className="mr-auto">
          <p className="font-medium">Bulk upload · {theme.label}</p>
          <p className="text-stone-600">{theme.hint}</p>
        </div>
        <input ref={bulkRef} type="file" accept="image/jpeg" multiple disabled={!!busy} />
        <button className={btn} disabled={!!busy} onClick={() => send([...(bulkRef.current?.files ?? [])], shotTab)}>
          {busy === "bulk" ? "Uploading…" : "Upload images"}
        </button>
      </Card>

      <div className="mb-3 flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 ${filter === f.key ? "bg-maroon-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>
            {f.label} ({count(shotTab, f.key)})
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-stone-500">Loading…</p> : !rows.length ? <Empty>Nothing here.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr><th className="p-2">Batch</th><th>SKU</th><th>Preview</th><th>Status</th><th>Ver.</th><th>Latest feedback</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const last = [...s.shot_versions].sort((a: any, b: any) => b.version_no - a.version_no)[0];
                // images the reviewer sent back, newest first (the "not selected" ones are not feedback)
                // what to show as the preview: the approved image, else the latest upload
                const shown = s.shot_versions.find((v: any) => v.review_status === "approved") ?? last;
                const rejected = s.shot_versions
                  .filter((v: any) => v.review_status === "rejected" && !String(v.reject_comment ?? "").startsWith("Not selected"))
                  .sort((a: any, b: any) => b.version_no - a.version_no).slice(0, 4);
                return (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="p-2">{batchLabel(s.skus.batches)}</td>
                    <td className="font-medium">
                      <a href={`/shots/${s.id}`} target="_blank" rel="noopener noreferrer" className="hover:text-maroon-700 hover:underline">{s.skus.sku_code}</a>
                    </td>
                    <td className="py-2">
                      {shown?.assets ? (
                        <a href={`/shots/${s.id}`} target="_blank" rel="noopener noreferrer" title="Open details" className="block w-fit overflow-hidden rounded border border-stone-200">
                          <R2Image objectKey={shown.assets.object_key} className="h-16 w-16 bg-stone-100" />
                        </a>
                      ) : <span className="text-stone-400">—</span>}
                    </td>
                    <td><Badge value={s.status} /></td>
                    <td>{s.current_version || "—"}</td>
                    <td className="py-2">
                      {rejected.length > 0 && (
                        <ul className="space-y-1.5">
                          {rejected.map((r: any) => (
                            <li key={r.version_no} className="flex items-center gap-2">
                              <a href={`/shots/${s.id}`} target="_blank" rel="noopener noreferrer" title="Open the thread and reply"
                                className="shrink-0 overflow-hidden rounded border border-red-200">
                                <R2Image objectKey={r.assets?.object_key} className="h-12 w-12 bg-stone-100" />
                              </a>
                              <span className="text-red-700"><b>v{r.version_no}</b> · {reason(r.reject_reason)}{r.reject_comment ? `: ${r.reject_comment}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {s.status === "in_production" && (
                        <label className={`${btn} cursor-pointer ${busy ? "pointer-events-none opacity-40" : ""}`}>
                          {busy === s.id ? "Uploading…" : last ? "Upload new version" : "Upload image"}
                          <input type="file" accept="image/jpeg" className="hidden" disabled={!!busy}
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send([f], s.shot_type, s.id); }} />
                        </label>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      </>)}
    </>
  );
}

/** Variations: many images for one shot, no name checks. The reviewer picks the winner. */
function VariationsPanel({ shots, busy, onSend }: { shots: any[]; busy: string | null; onSend: (files: File[], shot: any, note: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<any | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState(0);
  const [note, setNote] = useState("");

  const matches = shots
    .filter((s) => s.status === "in_production" && s.skus.sku_code.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 40);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-teal-300 bg-teal-50">
        <p className="mb-1 font-medium">1. Find the SKU</p>
        <input className={`${input} mb-3 w-full`} placeholder="Search assigned SKUs…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!matches.length ? <p className="text-sm text-stone-500">No assigned shots in production match.</p> : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {matches.map((s) => (
              <li key={s.id}>
                <button onClick={() => setSel(s)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${sel?.id === s.id ? "border-teal-600 bg-white" : "border-transparent bg-white/60 hover:bg-white"}`}>
                  <span className="font-medium">{s.skus.sku_code}</span>
                  <span className="text-stone-500">{s.shot_type} · {batchLabel(s.skus.batches)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-1 font-medium">2. Upload variations</p>
        {!sel ? <p className="text-sm text-stone-500">Pick a SKU on the left.</p> : (
          <>
            <p className="mb-3 text-sm">Uploading for <b>{sel.skus.sku_code}</b> · {sel.shot_type}. File names don&apos;t matter and there are no checks; the reviewer will choose one.</p>
            <input ref={filesRef} type="file" accept="image/jpeg" multiple className="mb-3 block text-sm" disabled={!!busy}
              onChange={(e) => setPicked(e.target.files?.length ?? 0)} />
            <textarea className={`${input} mb-3 w-full`} rows={3} placeholder="Add a comment for the reviewer (optional): e.g. what differs between the variations" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={btn} disabled={!!busy || !picked}
              onClick={() => { onSend([...(filesRef.current?.files ?? [])], sel, note); if (filesRef.current) filesRef.current.value = ""; setPicked(0); setNote(""); setSel(null); }}>
              {busy === sel.id ? "Uploading…" : `Submit ${picked || ""} variation${picked === 1 ? "" : "s"} for review`}
            </button>
          </>
        )}
      </Card>
    </div>
  );
}

/** At-a-glance counters for the creator. Clicking a card filters the list below to that stage. */
function SummaryCards({ shots, filter, onFilter }: { shots: any[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const todo = shots.filter((s) => s.status === "in_production");
  const rework = todo.filter((s) => s.shot_versions.some((v: any) => v.review_status === "rejected")).length;
  const review = shots.filter((s) => s.status === "submitted" || s.status === "in_review").length;
  const done = shots.filter((s) => s.status === "approved" || s.status === "done").length;
  const total = shots.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const cards: { key: Filter | null; label: string; n: number; sub?: string; tone: string }[] = [
    { key: null, label: "Assigned to you", n: total, sub: "mood + model shots", tone: "border-maroon-600 bg-maroon-50 text-maroon-800" },
    { key: "todo", label: "To do", n: todo.length, sub: rework ? `${rework} sent back for rework` : "nothing sent back", tone: "border-amber-500 bg-amber-50 text-amber-800" },
    { key: "review", label: "In review", n: review, sub: "waiting on the reviewer", tone: "border-violet-500 bg-violet-50 text-violet-800" },
    { key: "done", label: "Approved", n: done, sub: "approved or complete", tone: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  ];

  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const Tag = c.key ? "button" : "div";
          return (
            <Tag key={c.label} {...(c.key ? { onClick: () => onFilter(c.key!) } : {})}
              className={`rounded-xl border-l-4 p-4 text-left shadow-card ${c.tone} ${c.key && filter === c.key ? "ring-2 ring-maroon-300" : ""} ${c.key ? "transition hover:brightness-95" : ""}`}>
              <p className="text-xs font-medium uppercase tracking-wider opacity-80">{c.label}</p>
              <p className="mt-1 font-display text-4xl font-semibold leading-none">{c.n}</p>
              <p className="mt-1.5 text-xs opacity-80">{c.sub}</p>
            </Tag>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-stone-600">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span>{done} of {total} approved · {pct}%</span>
      </div>
    </div>
  );
}

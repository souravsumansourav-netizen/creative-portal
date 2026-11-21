"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { batchLabel, btn, btnGhost, Card, Empty, input, Msg, PageHeader } from "@/components/ui";
import { RefImage } from "@/components/RefImage";
import { Select, Checkbox } from "@/components/controls";
import { TableSkeleton } from "@/components/controls";
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { Dialog } from "@/components/Dialog";

type Row = { shoot: { mood: boolean; model: boolean }; batch_id: string; creator_id: string };

export default function TriagePage() {
  const [skus, setSkus] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  // bulk-apply controls
  const [bulkBatch, setBulkBatch] = useState("");
  const [bulkCreator, setBulkCreator] = useState("");
  const [preview, setPreview] = useState<number | null>(null); // index into skus
  // batch naming dialogs
  const [dlg, setDlg] = useState<null | "new" | "rename">(null);
  const [newName, setNewName] = useState("");
  const [moveSelected, setMoveSelected] = useState(true);
  const [renames, setRenames] = useState<Record<string, string>>({});

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [s, b, c] = await Promise.all([
      sb.from("skus").select("id, sku_code, batch_id, created_at, uploads(file_name)").eq("triaged", false).order("created_at", { ascending: false }).order("sku_code"),
      sb.from("batches").select("*").order("batch_no"),
      sb.from("profiles").select("id, full_name, email").eq("role", "creator"),
    ]);
    if (s.error) throw s.error;
    setSkus(s.data ?? []); setBatches(b.data ?? []); setCreators(c.data ?? []);
    setRows((prev) => {
      const next = { ...prev };
      for (const k of s.data ?? []) next[k.id] ??= { shoot: { mood: false, model: false }, batch_id: k.batch_id, creator_id: "" };
      return next;
    });
  }, ["skus"]);

  const patch = (ids: string[], p: Partial<Row> | ((r: Row) => Partial<Row>)) =>
    setRows((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...next[id], ...(typeof p === "function" ? p(next[id]) : p) };
      return next;
    });

  const selected = [...sel];
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ready = skus.filter((k) => { const r = rows[k.id]; return r && (r.shoot.mood || r.shoot.model) && r.creator_id; });

  function openNew() { setNewName(""); setMoveSelected(true); setDlg("new"); }
  function openRename() { setRenames(Object.fromEntries(batches.map((b) => [b.id, b.name ?? ""]))); setDlg("rename"); }

  async function createBatch() {
    setMsg({});
    try {
      const b = await rpc("create_batch", { p_name: newName.trim() || null });
      if (moveSelected && selected.length) patch(selected, { batch_id: b.id });
      setBulkBatch(b.id);
      setMsg({ ok: `Created ${batchLabel(b)}${moveSelected && selected.length ? ` and moved ${selected.length} SKU${selected.length === 1 ? "" : "s"} into it` : ""}.` });
      setDlg(null);
      await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  async function saveRenames() {
    const items = batches.filter((b) => (renames[b.id] ?? "") !== (b.name ?? "")).map((b) => ({ id: b.id, name: renames[b.id] ?? "" }));
    if (!items.length) return setDlg(null);
    setMsg({});
    try {
      const n = await rpc<number>("rename_batches", { p_items: items });
      setMsg({ ok: `Renamed ${n} batch${n === 1 ? "" : "es"}.` });
      setDlg(null);
      await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  async function confirm() {
    setBusy(true); setMsg({});
    try {
      const items = ready.map((k) => ({
        sku_id: k.id, batch_id: rows[k.id].batch_id, creator_id: rows[k.id].creator_id,
        shot_types: (["mood", "model"] as const).filter((t) => rows[k.id].shoot[t]),
      }));
      const n = await rpc<number>("triage_skus", { p_items: items });
      setMsg({ ok: `Triaged ${n} SKUs. Their batches are now locked.` });
      setSel(new Set()); await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(false);
  }

  const cName = (c: any) => c.full_name || c.email;

  return (
    <>
      <PageHeader title="Triage" sub="Choose shot types, a creator and a batch. Confirming locks the batch.">
        <button className={btn} disabled={busy || !ready.length} onClick={confirm}>Confirm {ready.length} ready</button>
      </PageHeader>
      <Msg error={msg.error ?? loadError} ok={msg.ok} />

      <Card className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Bulk ({selected.length} selected):</span>
        <button className={btnGhost} disabled={!selected.length} onClick={() => patch(selected, { shoot: { mood: true, model: false } })}>Mood</button>
        <button className={btnGhost} disabled={!selected.length} onClick={() => patch(selected, { shoot: { mood: false, model: true } })}>Model</button>
        <button className={btnGhost} disabled={!selected.length} onClick={() => patch(selected, { shoot: { mood: true, model: true } })}>Both</button>
        <Select className={input} value={bulkBatch} onChange={(e) => setBulkBatch(e.target.value)}>
          <option value="">Batch…</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
        </Select>
        <button className={btnGhost} disabled={!selected.length || !bulkBatch} onClick={() => patch(selected, { batch_id: bulkBatch })}>Set batch</button>
        <button className={btnGhost} onClick={openNew}><Plus size={15} /> New batch</button>
        <button className={btnGhost} onClick={openRename}><Pencil size={14} /> Rename batches</button>
        <Select className={input} value={bulkCreator} onChange={(e) => setBulkCreator(e.target.value)}>
          <option value="">Creator…</option>
          {creators.map((c) => <option key={c.id} value={c.id}>{cName(c)}</option>)}
        </Select>
        <button className={btnGhost} disabled={!selected.length || !bulkCreator} onClick={() => patch(selected, { creator_id: bulkCreator })}>Set creator</button>
      </Card>

      {loading ? <TableSkeleton /> : !skus.length ? <Empty tone="success" hint="New SKUs appear here after an upload or when SKUs are pasted in.">All caught up</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.025] text-left text-stone-500">
              <tr>
                <th className="p-2"><Checkbox checked={sel.size === skus.length} onChange={(e) => setSel(e.target.checked ? new Set(skus.map((k) => k.id)) : new Set())} /></th>
                <th>SKU</th><th>Preview</th><th>Upload</th><th>Mood</th><th>Model</th><th>Batch</th><th>Creator</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((k) => {
                const r = rows[k.id]; if (!r) return null;
                return (
                  <tr key={k.id} className={`border-t border-black/[0.05] transition-colors ${sel.has(k.id) ? "bg-maroon-50/70" : ""}`}>
                    <td className="p-2"><Checkbox checked={sel.has(k.id)} onChange={() => toggle(k.id)} /></td>
                    <td className="font-medium">{k.sku_code}</td>
                    <td className="py-2">
                      <button type="button" title="Click to enlarge" onClick={() => setPreview(skus.indexOf(k))}>
                        <RefImage sku={k.sku_code} className="h-28 w-28 rounded border border-stone-200" />
                      </button>
                    </td>
                    <td className="text-stone-500">{k.uploads?.file_name}</td>
                    <td><Checkbox checked={r.shoot.mood} onChange={(e) => patch([k.id], { shoot: { ...r.shoot, mood: e.target.checked } })} /></td>
                    <td><Checkbox checked={r.shoot.model} onChange={(e) => patch([k.id], { shoot: { ...r.shoot, model: e.target.checked } })} /></td>
                    <td>
                      <Select className={input} value={r.batch_id} onChange={(e) => patch([k.id], { batch_id: e.target.value })}>
                        {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
                      </Select>
                    </td>
                    <td>
                      <Select className={input} value={r.creator_id} onChange={(e) => patch([k.id], { creator_id: e.target.value })}>
                        <option value="">—</option>
                        {creators.map((c) => <option key={c.id} value={c.id}>{cName(c)}</option>)}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {dlg === "new" && (
        <Dialog title="New batch" subtitle="Give it a name your team will recognise." onClose={() => setDlg(null)}
          footer={<><button className={btnGhost} onClick={() => setDlg(null)}>Cancel</button><button className={btn} onClick={createBatch}>Create batch</button></>}>
          <input autoFocus className={`${input} w-full py-2.5`} placeholder="e.g. Wedding Gifting" maxLength={60} value={newName}
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createBatch(); }} />
          {selected.length > 0 && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <Checkbox checked={moveSelected} onChange={(e) => setMoveSelected(e.target.checked)} />
              Move the {selected.length} selected SKU{selected.length === 1 ? "" : "s"} into it
            </label>
          )}
          <p className="mt-3 text-xs text-stone-500">It appears as “Batch N · your name”. You can rename it again any time before SKUs are confirmed.</p>
        </Dialog>
      )}

      {dlg === "rename" && (
        <Dialog title="Rename batches" subtitle="Edit one name or several, then save once. Leave a name blank to go back to the plain batch number."
          width="max-w-lg" onClose={() => setDlg(null)}
          footer={<><button className={btnGhost} onClick={() => setDlg(null)}>Cancel</button><button className={btn} onClick={saveRenames}>Save names</button></>}>
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium text-stone-600">Batch {b.batch_no}</span>
                <input className={`${input} flex-1`} placeholder="Add a name" maxLength={60} value={renames[b.id] ?? ""}
                  onChange={(e) => setRenames((r) => ({ ...r, [b.id]: e.target.value }))} />
              </div>
            ))}
            {!batches.length && <p className="text-sm text-stone-500">No batches yet.</p>}
          </div>
        </Dialog>
      )}

      {preview !== null && skus[preview] && (() => {
        const k = skus[preview]; const r = rows[k.id];
        return (
          <div className="scrim anim-fade fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
            <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl sheet anim-pop md:flex-row" onClick={(e) => e.stopPropagation()}>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-stone-100 p-2">
                <RefImage sku={k.sku_code} lazy={false} className="h-[70vh] w-full" />
              </div>
              <div className="w-full space-y-4 p-5 text-sm md:w-80">
                <div className="flex items-start justify-between">
                  <div><p className="text-base font-semibold">{k.sku_code}</p><p className="text-stone-500">{preview + 1} of {skus.length}</p></div>
                  <button className={btnGhost} onClick={() => setPreview(null)}><X size={16} /></button>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2"><Checkbox checked={r.shoot.mood} onChange={(e) => patch([k.id], { shoot: { ...r.shoot, mood: e.target.checked } })} /> Mood shot</label>
                  <label className="flex items-center gap-2"><Checkbox checked={r.shoot.model} onChange={(e) => patch([k.id], { shoot: { ...r.shoot, model: e.target.checked } })} /> Model shot</label>
                </div>
                <label className="block">Batch
                  <Select className={`${input} mt-1 w-full`} value={r.batch_id} onChange={(e) => patch([k.id], { batch_id: e.target.value })}>
                    {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
                  </Select>
                </label>
                <label className="block">Creator
                  <Select className={`${input} mt-1 w-full`} value={r.creator_id} onChange={(e) => patch([k.id], { creator_id: e.target.value })}>
                    <option value="">—</option>
                    {creators.map((c) => <option key={c.id} value={c.id}>{cName(c)}</option>)}
                  </Select>
                </label>
                <div className="flex gap-2">
                  <button className={btnGhost} disabled={preview <= 0} onClick={() => setPreview(preview - 1)}><ChevronLeft size={16} /> Prev</button>
                  <button className={btn} disabled={preview >= skus.length - 1} onClick={() => setPreview(preview + 1)}>Next <ChevronRight size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

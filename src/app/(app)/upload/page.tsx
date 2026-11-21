"use client";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke, rpc } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, btn, Card, Empty, input, Msg, PageHeader } from "@/components/ui";
import { TableSkeleton } from "@/components/controls";
import { FilePicker, Segmented } from "@/components/controls";

export default function UploadPage() {
  const [uploads, setUploads] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"excel" | "paste">("excel");
  const [pasted, setPasted] = useState("");
  const [label, setLabel] = useState("");

  // split on new lines, commas, semicolons, tabs or spaces; count what will really be added
  const parsed = useMemo(() => {
    const all = pasted.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean);
    const unique = new Map<string, string>();
    for (const c of all) if (!unique.has(c.toLowerCase())) unique.set(c.toLowerCase(), c);
    return { codes: [...unique.values()], repeats: all.length - unique.size };
  }, [pasted]);

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

  async function onPaste() {
    if (!parsed.codes.length) return;
    setBusy(true); setMsg({});
    try {
      const r = await rpc<{ sku_count: number; duplicates_skipped: number; already_in_portal: number }>("ingest_skus", { p_codes: parsed.codes, p_label: label || null });
      setMsg({ ok: `Added ${r.sku_count} SKU${r.sku_count === 1 ? "" : "s"} to Batch 1${r.already_in_portal ? ` (${r.already_in_portal} already existed in the portal)` : ""}. They're waiting in Triage.` });
      setPasted(""); setLabel("");
      reload();
    } catch (e) {
      setMsg({ error: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Upload SKUs" sub="From a file, or pasted in. New SKUs wait in Batch 1 for triage." />
      <div className="mb-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: "excel" as const, label: "Excel / CSV file" }, { value: "paste" as const, label: "Paste SKUs" }]} />
      </div>

      {mode === "excel" ? (
        <Card className="mb-6 flex flex-wrap items-center gap-3">
          <FilePicker className="min-w-[18rem] flex-1" files={file ? [file] : []} onFiles={(f) => setFile(f[0] ?? null)} accept=".xlsx,.xls,.csv" disabled={busy}
            label="Choose an Excel or CSV file" hint="Needs a SKU column. Drop it here or click." />
          <button className={btn} disabled={busy || !file} onClick={onUpload}>{busy ? "Uploading…" : "Upload"}</button>
        </Card>
      ) : (
        <Card className="mb-6">
          <label className="mb-1.5 block text-sm font-medium text-stone-700" htmlFor="paste-skus">SKU codes</label>
          <textarea id="paste-skus" rows={7} disabled={busy} value={pasted} onChange={(e) => setPasted(e.target.value)}
            placeholder={"Paste one SKU, or many: one per line, or separated by commas or spaces.\n\n50D6C4BWJLAP1\n50D4I2FGJAA2A, 50K5H4PEOAAA2A"}
            className={`${input} w-full resize-y font-mono text-[0.875rem] leading-relaxed`} spellCheck={false} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input className={`${input} min-w-[14rem] flex-1`} placeholder="Label this upload (optional), e.g. Diwali drop" maxLength={80}
              value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy} />
            <span className="text-sm text-stone-500 tabular-nums">
              {parsed.codes.length ? <><b className="text-stone-900">{parsed.codes.length}</b> SKU{parsed.codes.length === 1 ? "" : "s"} detected{parsed.repeats ? ` · ${parsed.repeats} repeat${parsed.repeats === 1 ? "" : "s"} ignored` : ""}</> : "Nothing pasted yet"}
            </span>
            <button className={btn} disabled={busy || !parsed.codes.length} onClick={onPaste}>
              {busy ? "Adding…" : parsed.codes.length ? `Add ${parsed.codes.length} SKU${parsed.codes.length === 1 ? "" : "s"}` : "Add SKUs"}
            </button>
          </div>
        </Card>
      )}
      <Msg error={msg.error ?? loadError} ok={msg.ok} />

      {(loading || uploads.length > 0) && <h2 className="mb-3 text-[1.0625rem] font-semibold">My uploads</h2>}
      {loading ? <TableSkeleton /> : !uploads.length ? <Empty hint="Upload a file or paste SKUs above to get started.">No uploads yet</Empty> : (
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

"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Play, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke } from "@/lib/api";
import { btn, btnGhost, Card, input } from "@/components/ui";
import { FilePicker, Select } from "@/components/controls";
import type { Granularity, SourceType, UploadBatch } from "./types";

const STATUS_CLS: Record<UploadBatch["status"], string> = {
  uploaded: "bg-apple-blue/15 text-ink-blue",
  processing: "animate-pulse bg-apple-orange/15 text-ink-orange",
  done: "bg-apple-green/15 text-ink-green",
  error: "bg-apple-red/15 text-ink-red",
};

export function UploadPanel({
  batches,
  onMsg,
  onReload,
}: {
  batches: UploadBatch[];
  onMsg: (m: { error?: string; ok?: string }) => void;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(batches.length === 0);
  const [sourceType, setSourceType] = useState<SourceType>("web");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);

  async function onUploadCsv() {
    if (!file) return;
    setUploading(true);
    onMsg({});
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `intelligence/${sourceType}/${Date.now()}_${safeName}`;
      const res = await fetch(`/api/r2/upload?key=${encodeURIComponent(key)}`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type || "text/csv" },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `CSV upload failed (${res.status})`);
      }

      const { error } = await supabaseBrowser().from("intel_upload_batches").insert({
        source_type: sourceType,
        granularity,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        r2_key: key,
        file_name: file.name,
        status: "uploaded",
      });
      if (error) throw new Error(error.message);

      onMsg({ ok: `Uploaded ${file.name} (${sourceType.toUpperCase()}). Run the intelligence model when ready.` });
      setFile(null);
      await onReload();
    } catch (e) {
      onMsg({ error: (e as Error).message });
    }
    setUploading(false);
  }

  async function onRunModel() {
    setRunning(true);
    onMsg({});
    try {
      const latestUploaded = batches.find((b) => b.status === "uploaded")?.id;
      await invoke("trigger-intelligence", latestUploaded ? { batch_id: latestUploaded } : {});
      onMsg({ ok: "Intelligence model workflow dispatched. Scores will update automatically when finished." });
      await onReload();
    } catch (e) {
      onMsg({ error: (e as Error).message });
    }
    setRunning(false);
  }

  return (
    <Card className="mb-6 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
          {open ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
          <div>
            <span className="text-[0.9375rem] font-semibold text-stone-900">Data Upload &amp; Model Refresh</span>
            <span className="ml-2 text-xs text-stone-500">
              {batches.length ? `${batches.length} batch${batches.length === 1 ? "" : "es"} recorded` : "Upload Web, App, OMS, Perf & Master CSVs"}
            </span>
          </div>
        </button>
        <button type="button" className={btn} disabled={running} onClick={onRunModel}>
          <Play size={14} /> {running ? "Dispatching…" : "Run Intelligence Model"}
        </button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-black/[0.06] px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-medium text-stone-600">
              Source Type
              <Select className={`${input} mt-1 w-full`} value={sourceType} onChange={(e) => {
                const v = e.target.value as SourceType;
                setSourceType(v);
                if (v === "master") setGranularity("catalog");
                else if (granularity === "catalog") setGranularity("monthly");
              }}>
                <option value="web">Web (GA4)</option>
                <option value="app">App (GA4)</option>
                <option value="oms">OMS</option>
                <option value="perf">Perf (Campaigns)</option>
                <option value="master">Master Catalog</option>
              </Select>
            </label>
            <label className="block text-xs font-medium text-stone-600">
              Granularity
              <Select className={`${input} mt-1 w-full`} value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="catalog">Catalog</option>
              </Select>
            </label>
            <label className="block text-xs font-medium text-stone-600">
              Period Start
              <input type="date" className={`${input} mt-1 w-full`} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={granularity === "catalog"} />
            </label>
            <label className="block text-xs font-medium text-stone-600">
              Period End
              <input type="date" className={`${input} mt-1 w-full`} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled={granularity === "catalog"} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <FilePicker className="min-w-[18rem] flex-1" files={file ? [file] : []} onFiles={(f) => setFile(f[0] ?? null)} accept=".csv" disabled={uploading}
              label="Choose a CSV file" hint="Web, App, OMS, Perf, or Master CSV. Use the same period dates for every file of a month." />
            <button type="button" className={btnGhost} disabled={uploading || !file} onClick={onUploadCsv}>
              <Upload size={14} /> {uploading ? "Uploading…" : "Upload CSV"}
            </button>
          </div>

          {batches.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
              <table className="w-full text-xs">
                <thead className="bg-black/[0.025] text-left text-stone-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Ingested</th>
                    <th className="px-3 py-2 text-right font-medium">Excluded</th>
                    <th className="px-3 py-2 text-right font-medium">Master Match</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 12).map((b) => (
                    <tr key={b.id} className="border-t border-black/[0.05]">
                      <td className="max-w-[14rem] truncate px-3 py-2 font-medium text-stone-900" title={b.file_name ?? undefined}>{b.file_name || "—"}</td>
                      <td className="px-3 py-2 uppercase text-stone-600">{b.source_type}</td>
                      <td className="px-3 py-2 text-stone-500">
                        {b.period_start && b.period_end ? `${b.period_start} → ${b.period_end}` : b.granularity ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_CLS[b.status]}`} title={b.error_message ?? undefined}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.rows_ingested ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-500">{b.rows_excluded_non_jewellery ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.master_match_pct != null ? `${Number(b.master_match_pct).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}


"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadAsset, openAsset } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btnGhost, Card, Empty, input, Msg, PageHeader, R2Image } from "@/components/ui";
import { Select } from "@/components/controls";
import { TableSkeleton } from "@/components/controls";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

const PAGE = 12;

/** Everything creators have uploaded, with view + download. Thumbnail = approved version, else the latest one. */
export default function LibraryPage() {
  const [shots, setShots] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(0);

  const { loading, error: loadError } = useLiveData(async () => {
    let query = supabaseBrowser()
      .from("shots")
      .select("id, shot_type, status, current_version, skus!inner(sku_code, batches(batch_no, name)), profiles:creator_id(full_name, email), shot_versions!inner(id, version_no, review_status, assets(object_key, file_name, size_bytes))", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (q.trim()) query = query.ilike("skus.sku_code", `%${q.trim()}%`);
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("shot_type", type);
    const { data, count, error } = await query;
    if (error) throw error;
    setShots(data ?? []); setTotal(count ?? 0);
  }, ["shots", "shot_versions"], [q, status, type, page]);

  const best = (s: any) => {
    const vs = [...s.shot_versions].sort((a: any, b: any) => b.version_no - a.version_no);
    return vs.find((v: any) => v.review_status === "approved") ?? vs[0];
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const set = (fn: () => void) => { fn(); setPage(0); };

  return (
    <>
      <PageHeader title="Library" sub={`${total} shot(s) with uploaded images`} />
      <Msg error={loadError} />
      <Card className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <input className={input} placeholder="Search SKU…" value={q} onChange={(e) => set(() => setQ(e.target.value))} />
        <Select className={input} value={status} onChange={(e) => set(() => setStatus(e.target.value))}>
          <option value="">All statuses</option>
          {["in_production", "in_review", "approved", "done"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
        </Select>
        <Select className={input} value={type} onChange={(e) => set(() => setType(e.target.value))}>
          <option value="">Mood + model</option>
          <option value="mood">Mood</option>
          <option value="model">Model</option>
        </Select>
      </Card>

      {loading ? <TableSkeleton /> : !shots.length ? <Empty hint="Try clearing the search or the filters.">No images found</Empty> : (
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shots.map((s) => {
            const v = best(s);
            const key = v?.assets?.object_key;
            const others = s.shot_versions.filter((o: any) => o.id !== v?.id && o.assets).sort((a: any, b: any) => a.version_no - b.version_no);
            return (
              <Card key={s.id} className="p-3">
                <button className="block w-full" onClick={() => key && openAsset(key)} title="Open full size">
                  <R2Image objectKey={key} className="h-56 w-full rounded bg-stone-100" />
                </button>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <b className="truncate">{s.skus.sku_code}</b><Badge value={s.status} />
                </div>
                <p className="text-xs text-stone-500">{s.shot_type} · v{v?.version_no} · {batchLabel(s.skus.batches)} · {s.profiles?.full_name || s.profiles?.email}</p>
                <div className="mt-2 flex gap-2">
                  <button className={btnGhost} disabled={!key} onClick={() => key && openAsset(key)}>View</button>
                  <button className={btnGhost} disabled={!key} onClick={() => key && downloadAsset(key, `${s.skus.sku_code}_${s.shot_type}_v${v.version_no}.jpg`)}><Download size={15} /> Download</button>
                </div>
                {others.length > 0 && (
                  <details className="mt-2 text-xs text-stone-600">
                    <summary className="cursor-pointer">{others.length} other version{others.length > 1 ? "s" : ""}</summary>
                    <ul className="mt-1 space-y-1">
                      {others.map((o: any) => (
                        <li key={o.id} className="flex items-center justify-between gap-2">
                          <span>v{o.version_no} <Badge value={o.review_status} /></span>
                          <span className="flex gap-2">
                            <button className="underline" onClick={() => openAsset(o.assets.object_key)}>view</button>
                            <button className="underline" onClick={() => downloadAsset(o.assets.object_key, `${s.skus.sku_code}_${s.shot_type}_v${o.version_no}.jpg`)}>download</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <button className={btnGhost} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /> Prev</button>
        <span>Page {page + 1} of {pages}</span>
        <button className={btnGhost} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={16} /></button>
      </div>
    </>
  );
}

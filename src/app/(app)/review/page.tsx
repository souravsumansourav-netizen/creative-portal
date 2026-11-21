"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadAsset, openAsset, rpc } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btn, btnDanger, btnGhost, input, R2Image } from "@/components/ui";
import { REJECT_REASONS, referenceUrl } from "@/lib/constants";
import { Select } from "@/components/controls";
import { TableSkeleton } from "@/components/controls";
import { Segmented } from "@/components/controls";
import { ArrowUpRight, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { MessageSquare } from "lucide-react";

const reasonLabel = (v: string) => REJECT_REASONS.find((r) => r.value === v)?.label ?? v;

/** Original catalogue image, hot-linked from the public site (no referrer sent). */
function ReferenceImage({ sku }: { sku: string }) {
  const [failed, setFailed] = useState(false);
  const url = referenceUrl(sku);
  useEffect(() => setFailed(false), [sku]);
  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-sm text-stone-500">
        <p>No original image found for {sku.toUpperCase()}</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline">Try opening the link</a>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={sku} src={url} alt={`Original ${sku}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex flex-col bg-stone-100">{children}</div>;
}

/** Full-viewport side-by-side review: creator upload (left, switchable variations) vs original (right, fixed). */
export default function ReviewPage() {
  const [shots, setShots] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [varIdx, setVarIdx] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("color_gold_tone");
  const [comment, setComment] = useState("");
  const [dest, setDest] = useState<"" | "pdp" | "performance" | "both">("");
  const [campaign, setCampaign] = useState("");

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const { data, error } = await supabaseBrowser()
      .from("shots")
      .select("id, shot_type, current_version, skus(sku_code, batches(batch_no, name)), profiles:creator_id(full_name, email), shot_versions(id, version_no, review_status, reject_reason, reject_comment, uploaded_at, assets(object_key, file_name)), shot_comments(body, created_at, commenter:author_id(full_name, email))")
      .eq("status", "in_review").order("created_at");
    if (error) throw error;
    setShots(data ?? []);
  }, ["shots", "shot_versions"]);

  const cur = shots[Math.min(idx, Math.max(0, shots.length - 1))];
  const pend: any[] = cur ? cur.shot_versions.filter((v: any) => v.review_status === "pending").sort((a: any, b: any) => a.version_no - b.version_no) : [];
  const past: any[] = cur ? cur.shot_versions.filter((v: any) => v.review_status !== "pending").sort((a: any, b: any) => b.version_no - a.version_no) : [];
  const v = pend[Math.min(varIdx, Math.max(0, pend.length - 1))];
  const multi = pend.length > 1;
  const sku: string = cur?.skus.sku_code ?? "";

  // reset per-shot UI when the shot on screen changes
  useEffect(() => { setVarIdx(0); setRejecting(false); setComment(""); setMsg(null); setDest(""); }, [cur?.id]);

  // ← / → move between shots (ignored while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, shots.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shots.length]);

  const needsCampaign = dest === "performance" || dest === "both";
  const canApprove = !!dest && (!needsCampaign || campaign.trim().length > 0);

  // approve + plan where it goes (PDP / performance / both); released later from the Routing page
  async function approve() {
    setMsg(null);
    try {
      await rpc("approve_shot", {
        p_version_id: v.id,
        p_destinations: dest === "both" ? ["pdp", "performance"] : [dest],
        p_campaign: needsCampaign ? campaign.trim() : null,
      });
      reload();
    } catch (e) { setMsg((e as Error).message); }
  }
  // Rejects only the variation on screen. The shot returns to the creator once no variation is left pending.
  async function rejectCurrent() {
    setMsg(null);
    try {
      await rpc("review_shot", { p_version_id: v.id, p_approve: false, p_reason: reason, p_comment: comment || null });
      setRejecting(false); setComment(""); reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  if (loading) return <Shell><div className="m-auto w-80 max-w-full"><TableSkeleton rows={3} /></div></Shell>;
  if (!cur || !v) {
    return (
      <Shell>
        <div className="m-auto text-center">
          <p className="mb-3 text-stone-600">{loadError ?? "Nothing to review right now."}</p>
          <Link href="/dashboard" className={btnGhost}><ChevronLeft size={15} /> Back to portal</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2 text-sm">
        <Link href="/dashboard" className={btnGhost}><X size={15} /> Exit</Link>
        <span className="text-base font-semibold">{sku.toUpperCase()}</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5">{cur.shot_type}</span>
        <span className="text-stone-500">{batchLabel(cur.skus.batches)} · by {cur.profiles?.full_name || cur.profiles?.email}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className={btnGhost} disabled={idx <= 0} onClick={() => setIdx(idx - 1)}><ChevronLeft size={16} /></button>
          <span>{Math.min(idx, shots.length - 1) + 1} of {shots.length}</span>
          <button className={btnGhost} disabled={idx >= shots.length - 1} onClick={() => setIdx(idx + 1)}><ChevronRight size={16} /></button>
        </div>
      </header>

      {/* variation tabs: left image changes, original on the right stays */}
      {multi && (
        <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-4 py-1.5 text-sm">
          {pend.map((p, i) => (
            <button key={p.id} onClick={() => setVarIdx(i)}
              className={`rounded-md px-3 py-1 ${i === varIdx ? "bg-maroon-700 text-white" : "bg-black/[0.06] text-stone-700 hover:bg-black/[0.10]"}`}>
              Var {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* comparison: fills the rest of the viewport */}
      <main className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-stone-300">
        <section className="flex min-h-0 flex-col bg-white">
          <div className="flex items-center justify-between px-3 py-1 text-xs text-stone-500">
            <span className="font-medium text-stone-700">Uploaded{multi ? ` · Var ${varIdx + 1}` : ""} · v{v.version_no}{v.assets?.file_name ? ` · ${v.assets.file_name}` : ""}</span>
            <button className="underline" onClick={() => v.assets && openAsset(v.assets.object_key)}>open full size</button>
          </div>
          <div className="min-h-0 flex-1 p-2"><R2Image objectKey={v.assets?.object_key} className="h-full w-full" /></div>
        </section>
        <section className="flex min-h-0 flex-col bg-white">
          <div className="flex items-center justify-between px-3 py-1 text-xs text-stone-500">
            <span className="font-medium text-stone-700">Original · tanishq.co.in</span>
            <a className="underline" href={referenceUrl(sku)} target="_blank" rel="noopener noreferrer">open</a>
          </div>
          <div className="min-h-0 flex-1 p-2"><ReferenceImage sku={sku} /></div>
        </section>
      </main>

      {/* action bar */}
      <footer className="border-t border-stone-200 bg-white px-4 py-3 text-sm">
        {msg && <p className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-red-800">{msg}</p>}
        {(() => {
          const last = [...(cur.shot_comments ?? [])].sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))[0];
          return (
            <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-stone-600">
              {last && (
                <span className="max-w-full truncate rounded bg-stone-100 px-2 py-1">
                  <MessageSquare size={13} className="mr-1 inline -translate-y-px" /><b>{last.commenter?.full_name || last.commenter?.email}</b>: {last.body.length > 120 ? `${last.body.slice(0, 120)}…` : last.body}
                </span>
              )}
              <a href={`/shots/${cur.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-maroon-700 underline">
                {last ? "Open full thread" : "Open shot page"} <ArrowUpRight size={13} className="inline" />
              </a>
            </p>
          );
        })()}
        {past.length > 0 && (
          <p className="mb-2 text-xs text-stone-500">
            Earlier: {past.slice(0, 3).map((p: any) => `v${p.version_no} ${p.review_status}${p.reject_reason ? ` (${reasonLabel(p.reject_reason)}${p.reject_comment ? `: ${p.reject_comment}` : ""})` : ""}`).join(" · ")}
          </p>
        )}
        {rejecting ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select className={input} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REJECT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <input className={`${input} min-w-[16rem] flex-1`} placeholder={multi ? `Feedback on Var ${varIdx + 1}` : "Feedback for the creator"} value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className={btnDanger} onClick={rejectCurrent}>{multi ? `Reject Var ${varIdx + 1}` : "Reject & send back"}</button>
            <button className={btnGhost} onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnGhost} disabled={!v.assets}
              onClick={() => v.assets && downloadAsset(v.assets.object_key, `${sku}_${cur.shot_type}_v${v.version_no}.jpg`)}><Download size={15} /> Download</button>
            <button className={btnGhost} onClick={() => setRejecting(true)}>{multi ? `Reject Var ${varIdx + 1} / feedback…` : "Reject / feedback…"}</button>
            <span className="flex-1" />
            <span className="text-stone-600">Send to:</span>
            <Segmented value={dest} onChange={(v) => setDest(v)}
              options={[{ value: "pdp" as const, label: "PDP" }, { value: "performance" as const, label: "Performance" }, { value: "both" as const, label: "Both" }]} />
            {needsCampaign && (
              <input className={`${input} w-56`} placeholder="Campaign name (required)" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            )}
            <button className={btn} disabled={!canApprove} title={!dest ? "Choose where it goes first" : needsCampaign && !campaign.trim() ? "Enter the campaign name" : undefined} onClick={approve}>
              {multi ? `Approve Var ${varIdx + 1}` : "Approve"}
            </button>
          </div>
        )}
      </footer>
    </Shell>
  );
}

"use client";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke, postResubmitComment, rpc, uploadToR2 } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btn, btnDanger, btnGhost, Card, Empty, input, Msg, R2Image } from "@/components/ui";
import { RefImage } from "@/components/RefImage";
import { REJECT_REASONS } from "@/lib/constants";

const reasonLabel = (v: string) => REJECT_REASONS.find((r) => r.value === v)?.label ?? v;
const who = (p: any) => p?.full_name || p?.email || "Someone";
const when = (t: string) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One shot, Jira-style: versions vs the original, a conversation thread, and reply (with or without a new image). */
export default function ShotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [shot, setShot] = useState<any | null | undefined>(undefined);
  const [comments, setComments] = useState<any[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  // reviewer actions
  const [dest, setDest] = useState<"" | "pdp" | "performance" | "both">("");
  const [campaign, setCampaign] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("color_gold_tone");
  const [rejectText, setRejectText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    const [prof, s, c] = await Promise.all([
      sb.from("profiles").select("role").eq("id", user!.id).single(),
      sb.from("shots")
        .select("id, shot_type, status, current_version, skus(sku_code, batches(batch_no, name)), creator:creator_id(full_name, email), shot_versions(id, version_no, review_status, reject_reason, reject_comment, uploaded_at, reviewed_at, uploader:uploaded_by(full_name, email), reviewer:reviewed_by(full_name, email), assets(object_key, file_name))")
        .eq("id", id).maybeSingle(),
      sb.from("shot_comments").select("id, body, created_at, version_id, tag, version_count, author:author_id(id, full_name, email, role)").eq("shot_id", id).order("created_at"),
    ]);
    if (s.error) throw s.error;
    setMe({ id: user!.id, role: prof.data?.role ?? "" });
    setShot(s.data ?? null);
    setComments(c.data ?? []);
  }, ["shots", "shot_versions", "shot_comments"], [id]);

  if (loading && shot === undefined) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!shot) return <Empty>{loadError ?? "This shot wasn't found, or you don't have access to it."}</Empty>;

  const isReviewer = me?.role === "approver" || me?.role === "admin";
  const versions: any[] = [...shot.shot_versions].sort((a, b) => a.version_no - b.version_no);
  const defaultVer = (versions.find((v) => v.review_status === "approved") ?? versions[versions.length - 1])?.version_no ?? null;
  const selNo = ver ?? defaultVer;
  const sel = versions.find((v) => v.version_no === selNo);
  const sku: string = shot.skus.sku_code;
  const canUpload = shot.status === "in_production" && (me?.role === "creator" || me?.role === "admin");
  // reviewers: the first response must be approve / reject; free comments open up once a decision exists
  const hasDecision = versions.some((v) => v.review_status !== "pending");
  const canComment = isReviewer ? hasDecision : shot.status !== "done";
  const canReview = isReviewer && shot.status === "in_review" && sel?.review_status === "pending";
  const needsCampaign = dest === "performance" || dest === "both";

  // timeline: uploads, review decisions and comments in time order
  const events: { t: string; kind: "upload" | "review" | "comment"; v?: any; c?: any }[] = [];
  for (const v of versions) {
    events.push({ t: v.uploaded_at, kind: "upload", v });
    const hasThreadComment = comments.some((c) => c.version_id === v.id && c.tag === "rejected");
    // a rejection with a thread comment is shown as that comment (tagged to the version); other decisions get a card
    if (v.reviewed_at && !hasThreadComment) events.push({ t: v.reviewed_at, kind: "review", v });
  }
  for (const c of comments) events.push({ t: c.created_at, kind: "comment", c });
  events.sort((a, b) => +new Date(a.t) - +new Date(b.t));

  async function send() {
    const files = [...(fileRef.current?.files ?? [])];
    const body = text.trim();
    if (!body && !files.length) return;
    setBusy(true); setMsg({});
    try {
      let uploaded = 0;
      if (files.length) {
        const stagingId = crypto.randomUUID();
        for (const f of files) await uploadToR2(`staging/${me!.id}/${stagingId}/${f.name}`, f);
        // several images = variations (no name checks); one image = the next version
        const r = await invoke("validate-upload", { staging_id: stagingId, shot_type: shot.shot_type, shot_id: shot.id, variations: files.length > 1 });
        uploaded = r.images ?? r.submitted ?? files.length;
      }
      if (body) {
        if (uploaded) await postResubmitComment(shot.id, body, uploaded);
        else {
          const { error } = await supabaseBrowser().from("shot_comments").insert({ shot_id: shot.id, author_id: me!.id, body });
          if (error) throw new Error(error.message);
        }
      }
      setText(""); setVer(null); setPicked([]);
      if (fileRef.current) fileRef.current.value = "";
      setMsg({ ok: uploaded ? `${uploaded > 1 ? `${uploaded} variations` : "New version"} uploaded and sent for review.` : "Comment posted." });
      reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(false);
  }

  async function approve() {
    setMsg({});
    try {
      await rpc("approve_shot", { p_version_id: sel.id, p_destinations: dest === "both" ? ["pdp", "performance"] : [dest], p_campaign: needsCampaign ? campaign.trim() : null });
      setMsg({ ok: "Approved." }); reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }
  async function reject() {
    setMsg({});
    try {
      await rpc("review_shot", { p_version_id: sel.id, p_approve: false, p_reason: reason, p_comment: rejectText || null });
      setRejecting(false); setRejectText(""); setMsg({ ok: "Rejected and sent back." }); reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  const dot: Record<string, string> = { approved: "bg-emerald-500", rejected: "bg-red-500", pending: "bg-amber-400" };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={isReviewer ? "/rework" : "/production"} className="text-sm text-maroon-700 hover:underline">← Back</Link>
          <h1 className="mt-1 text-3xl font-semibold text-maroon-900">{sku.toUpperCase()}</h1>
          <div className="mt-1.5 h-px w-14 bg-gold-500" />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5">{shot.shot_type}</span>
          <Badge value={shot.status} />
          <span>{batchLabel(shot.skus.batches)}</span>
          <span>Creator: {who(shot.creator)}</span>
        </div>
      </div>
      <Msg error={msg.error ?? loadError} ok={msg.ok} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* versions vs original */}
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {versions.map((v) => (
              <button key={v.id} onClick={() => setVer(v.version_no)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${v.version_no === selNo ? "bg-maroon-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>
                <span className={`h-2 w-2 rounded-full ${dot[v.review_status]}`} /> v{v.version_no}
              </button>
            ))}
            {!versions.length && <span className="text-stone-500">No image uploaded yet.</span>}
          </div>
          <div className="grid grid-cols-2 gap-px bg-stone-200">
            <div className="bg-white p-2">
              <p className="mb-1 text-xs text-stone-500">{sel ? `Uploaded · v${sel.version_no} · ${sel.review_status}` : "Uploaded"}</p>
              <R2Image objectKey={sel?.assets?.object_key} className="h-[58vh] w-full" />
            </div>
            <div className="bg-white p-2">
              <p className="mb-1 text-xs text-stone-500">Original · tanishq.co.in</p>
              <RefImage sku={sku} lazy={false} className="h-[58vh] w-full" />
            </div>
          </div>

          {canReview && (
            <div className="mt-4 border-t border-stone-100 pt-4 text-sm">
              {rejecting ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select className={input} value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REJECT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <input className={`${input} min-w-[14rem] flex-1`} placeholder={`Feedback on v${sel.version_no}`} value={rejectText} onChange={(e) => setRejectText(e.target.value)} />
                  <button className={btnDanger} onClick={reject}>Reject v{sel.version_no}</button>
                  <button className={btnGhost} onClick={() => setRejecting(false)}>Cancel</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button className={btnGhost} onClick={() => setRejecting(true)}>Reject v{sel.version_no}…</button>
                  <span className="flex-1" />
                  <span className="text-stone-600">Send to:</span>
                  {([["pdp", "PDP"], ["performance", "Performance"], ["both", "Both"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setDest(k)}
                      className={`rounded-md border px-3 py-1.5 ${dest === k ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 bg-white hover:bg-stone-100"}`}>{label}</button>
                  ))}
                  {needsCampaign && <input className={`${input} w-52`} placeholder="Campaign name" value={campaign} onChange={(e) => setCampaign(e.target.value)} />}
                  <button className={btn} disabled={!dest || (needsCampaign && !campaign.trim())} onClick={approve}>Approve v{sel.version_no}</button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* thread */}
        <Card className="flex flex-col">
          <h2 className="mb-3">Activity</h2>
          <div className="max-h-[52vh] flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
            {!events.length && <p className="text-stone-500">Nothing yet.</p>}
            {events.map((e, i) => {
              if (e.kind === "upload") {
                return <p key={i} className="text-xs text-stone-500">{when(e.t)} · <b>{who(e.v.uploader)}</b> uploaded <button className="underline" onClick={() => setVer(e.v.version_no)}>v{e.v.version_no}</button></p>;
              }
              if (e.kind === "review") {
                const v = e.v; const ok = v.review_status === "approved";
                return (
                  <div key={i} className={`rounded-md border-l-4 px-3 py-2 ${ok ? "border-emerald-500 bg-emerald-50" : "border-red-400 bg-red-50"}`}>
                    <p className="text-xs text-stone-500">{when(e.t)} · {who(v.reviewer)}</p>
                    <p className="font-medium">{ok ? `Approved v${v.version_no}` : `Rejected v${v.version_no}${v.reject_reason ? ` · ${reasonLabel(v.reject_reason)}` : ""}`}</p>
                    {v.reject_comment && <p className="mt-0.5">{v.reject_comment}</p>}
                  </div>
                );
              }
              const c = e.c; const mine = c.author?.id === me?.id;
              const tv = versions.find((v) => v.id === c.version_id);
              const rejected = c.tag === "rejected";
              return (
                <div key={i} className={`rounded-md px-3 py-2 ${rejected ? "border-l-4 border-red-400 bg-red-50" : mine ? "bg-maroon-50" : "bg-stone-100"}`}>
                  <p className="text-xs text-stone-500">{when(e.t)} · <b>{who(c.author)}</b> <span className="capitalize">({(c.author?.role ?? "").replace("_", " ")})</span></p>
                  {tv && (
                    <button onClick={() => setVer(tv.version_no)}
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${rejected ? "bg-red-100 text-red-800" : "bg-maroon-100 text-maroon-800"}`}>
                      {rejected ? `Rejected v${tv.version_no}${tv.reject_reason ? ` · ${reasonLabel(tv.reject_reason)}` : ""}` : (c.version_count ?? 1) > 1 ? `With new variations v${tv.version_no}–v${tv.version_no + c.version_count - 1}` : `With new version v${tv.version_no}`}
                    </button>
                  )}
                  <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                </div>
              );
            })}
          </div>

          {isReviewer && !hasDecision && (
            <p className="mt-4 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">
              Your first response on this shot has to be <b>Approve</b> or <b>Reject</b> (use the buttons under the images). Once you have decided, you can reply here freely.
            </p>
          )}
          {canComment && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <textarea className={`${input} w-full`} rows={3} placeholder={canUpload ? "Reply to the reviewer… (optionally attach new version(s))" : isReviewer ? "Reply to the creator…" : "Write a comment…"} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {canUpload ? (
                  <label className={`${btnGhost} cursor-pointer`}>
                    {picked.length ? `📎 ${picked.length === 1 ? (picked[0].length > 20 ? picked[0].slice(0, 18) + "…" : picked[0]) : `${picked.length} images (variations)`}` : "Attach image(s)"}
                    <input ref={fileRef} type="file" accept="image/jpeg" multiple className="hidden"
                      onChange={(e) => setPicked([...(e.target.files ?? [])].map((f) => f.name))} />
                  </label>
                ) : (
                  !isReviewer && <span className="text-xs text-stone-500">You can upload a new version once the reviewer sends it back.</span>
                )}
                <span className="flex-1" />
                <button className={btn} disabled={busy || (!text.trim() && !picked.length)} onClick={send}>
                  {busy ? "Sending…" : picked.length > 1 ? "Send & submit variations" : picked.length ? "Send & submit new version" : "Post comment"}
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

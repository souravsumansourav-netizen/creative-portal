"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLiveData } from "@/lib/hooks";
import { batchLabel, Card, Empty, Msg, PageHeader, R2Image } from "@/components/ui";
import { REJECT_REASONS } from "@/lib/constants";
import { TableSkeleton } from "@/components/controls";
import { ArrowUpRight } from "lucide-react";
import { MessageSquare } from "lucide-react";

const reasonLabel = (v: string) => REJECT_REASONS.find((r) => r.value === v)?.label ?? v;
const ago = (t: string) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Shots the reviewer sent back and that are waiting on the creator. A creator's reply is flagged "New reply". */
export default function SentBackPage() {
  const [rows, setRows] = useState<any[]>([]);

  const { loading, error: loadError } = useLiveData(async () => {
    const { data, error } = await supabaseBrowser()
      .from("shots")
      .select("id, shot_type, skus(sku_code, batches(batch_no, name)), creator:creator_id(full_name, email), shot_versions(version_no, review_status, reject_reason, reject_comment, reviewed_at, assets(object_key)), shot_comments(body, created_at, author:author_id(role, full_name, email))")
      .eq("status", "in_production");
    if (error) throw error;
    const list = (data ?? [])
      .map((s: any) => {
        const rejected = s.shot_versions.filter((v: any) => v.review_status === "rejected").sort((a: any, b: any) => b.version_no - a.version_no);
        if (!rejected.length) return null; // never reviewed: still just a normal to-do, not "sent back"
        const lastReview = rejected[0].reviewed_at;
        const lastComment = [...s.shot_comments].sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))[0];
        const newReply = !!lastComment && lastComment.author?.role === "creator" && +new Date(lastComment.created_at) > +new Date(lastReview ?? 0);
        return { ...s, rejected: rejected[0], lastComment, newReply };
      })
      .filter(Boolean) as any[];
    list.sort((a, b) => Number(b.newReply) - Number(a.newReply));
    setRows(list);
  }, ["shots", "shot_versions", "shot_comments"]);

  const replies = rows.filter((r) => r.newReply).length;

  return (
    <>
      <PageHeader title="Sent back" sub={`${rows.length} shot(s) waiting on the creator${replies ? ` · ${replies} with a new comment` : ""}`} />
      <Msg error={loadError} />
      {loading ? <TableSkeleton /> : !rows.length ? <Empty tone="success" hint="Shots the reviewer sends back appear here.">Nothing is waiting on a creator</Empty> : (
        <div className="stagger space-y-3">
          {rows.map((r) => (
            <a key={r.id} href={`/shots/${r.id}`} target="_blank" rel="noopener noreferrer" className="block">
              <Card className="flex items-center gap-4 transition hover:border-maroon-300">
                <R2Image objectKey={r.rejected.assets?.object_key} className="h-20 w-20 shrink-0 rounded border border-red-200" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-base">{r.skus.sku_code}</b>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">{r.shot_type}</span>
                    {r.newReply && <span className="rounded-full bg-maroon-700 px-2 py-0.5 text-xs font-medium text-white">New comment</span>}
                    <span className="text-stone-500">{batchLabel(r.skus.batches)} · {r.creator?.full_name || r.creator?.email}</span>
                  </div>
                  <p className="mt-1 text-red-700">
                    Rejected v{r.rejected.version_no} · {reasonLabel(r.rejected.reject_reason)}{r.rejected.reject_comment ? `: ${r.rejected.reject_comment}` : ""}
                  </p>
                  {r.lastComment && (
                    <p className="mt-1 truncate text-stone-600">
                      <MessageSquare size={13} className="mr-1 inline -translate-y-px" /><b>{r.lastComment.author?.full_name || r.lastComment.author?.email}</b> · {ago(r.lastComment.created_at)}: {r.lastComment.body}
                    </p>
                  )}
                </div>
                <span className="text-sm text-maroon-700">Open <ArrowUpRight size={14} className="inline" /></span>
              </Card>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

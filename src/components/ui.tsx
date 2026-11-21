"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { presignGet, proxyUrl } from "@/lib/api";

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-maroon-700 px-4 py-2 text-[0.875rem] font-medium text-white shadow-[0_1px_2px_rgba(74,17,26,0.25)] hover:bg-maroon-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-black/[0.06] px-4 py-2 text-[0.875rem] font-medium text-stone-800 hover:bg-black/[0.10] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-red-600 px-4 py-2 text-[0.875rem] font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
export const input =
  "rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[0.9375rem] shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)] placeholder:text-stone-400 transition-shadow duration-150 focus:border-maroon-500 focus:outline-none focus:ring-[3px] focus:ring-maroon-500/20";

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.875rem] font-semibold">{title}</h1>
        {sub && <p className="mt-1.5 max-w-3xl text-[0.9375rem] leading-snug text-stone-500">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-black/[0.06] bg-white p-4 shadow-card ${className}`}>{children}</div>;
}

const tone: Record<string, string> = {
  in_production: "bg-apple-orange/[0.13] text-ink-orange",
  submitted: "bg-apple-blue/[0.11] text-ink-blue",
  in_review: "bg-apple-purple/[0.12] text-ink-purple",
  approved: "bg-apple-green/[0.14] text-ink-green",
  done: "bg-black/[0.06] text-stone-600",
  dropped: "bg-apple-red/[0.11] text-ink-red",
  pending: "bg-apple-orange/[0.13] text-ink-orange",
  rejected: "bg-apple-red/[0.11] text-ink-red",
};
export function Badge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[value] ?? "bg-black/[0.06] text-stone-600"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

/** Shows messages as toasts (call sites unchanged). Same text is de-duplicated, so realtime reloads don't stack them. */
export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  useEffect(() => { if (error) toast.error(error, { id: `e:${error}`, duration: 7000 }); }, [error]);
  useEffect(() => { if (ok) toast.success(ok, { id: `o:${ok}`, duration: 4000 }); }, [ok]);
  return null;
}

export function Empty({ children, hint, icon: Icon = Inbox }: { children: ReactNode; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/10 bg-white/60 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.05] text-stone-400"><Icon size={20} /></span>
      <p className="text-[0.9375rem] font-medium text-stone-700">{children}</p>
      {hint && <p className="max-w-sm text-sm text-stone-500">{hint}</p>}
    </div>
  );
}

/** Image from private R2: direct presigned URL first; if the network blocks it, the same image via this site. Fades in when loaded. */
export function R2Image({ objectKey, className = "" }: { objectKey?: string | null; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [viaProxy, setViaProxy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [src]);
  useEffect(() => {
    setSrc(null); setErr(false); setViaProxy(false); setLoaded(false);
    if (!objectKey) return;
    let live = true;
    presignGet(objectKey).then((u) => live && setSrc(u)).catch(() => live && (setViaProxy(true), setSrc(proxyUrl(objectKey))));
    return () => { live = false; };
  }, [objectKey]);
  if (!objectKey || err) return <div className={`flex items-center justify-center bg-stone-100 text-xs text-stone-400 ${className}`}>no image</div>;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src={src} alt=""
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => { if (!viaProxy && objectKey) { setViaProxy(true); setSrc(proxyUrl(objectKey)); } else setErr(true); }} />
      )}
    </div>
  );
}

export const batchLabel = (b?: { batch_no: number; name?: string | null } | null) =>
  b ? `Batch ${b.batch_no}${b.name ? ` · ${b.name}` : ""}` : "—";

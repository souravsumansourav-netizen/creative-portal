"use client";
import { useEffect, useState, type ReactNode } from "react";
import { presignGet } from "@/lib/api";

export const btn =
  "inline-flex items-center justify-center rounded-md bg-maroon-700 px-3.5 py-2 text-sm font-medium tracking-wide text-white shadow-sm transition-colors hover:bg-maroon-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-300 disabled:cursor-not-allowed disabled:opacity-40";
export const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-maroon-200 bg-white px-3.5 py-2 text-sm font-medium text-maroon-800 transition-colors hover:bg-maroon-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-300 disabled:opacity-40";
export const btnDanger =
  "inline-flex items-center justify-center rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40";
export const input =
  "rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm placeholder:text-stone-400 focus:border-maroon-400 focus:outline-none focus:ring-2 focus:ring-maroon-200";

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold leading-tight text-maroon-900">{title}</h1>
        <div className="mt-1.5 h-px w-14 bg-gold-500" />
        {sub && <p className="mt-2 text-sm text-stone-500">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-stone-200/80 bg-white p-4 shadow-card ${className}`}>{children}</div>;
}

const tone: Record<string, string> = {
  in_production: "bg-amber-100 text-amber-800",
  submitted: "bg-sky-100 text-sky-800",
  in_review: "bg-violet-100 text-violet-800",
  approved: "bg-emerald-100 text-emerald-800",
  done: "bg-stone-200 text-stone-700",
  dropped: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-700",
};
export function Badge({ value }: { value: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone[value] ?? "bg-stone-100 text-stone-700"}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function Msg({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (!error && !ok) return null;
  return (
    <div className={`mb-3 rounded-md px-3 py-2 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
      {error ?? ok}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-md border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">{children}</p>
);

/** Image served from private R2 through a short-lived presigned GET. */
export function R2Image({ objectKey, className = "" }: { objectKey?: string | null; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!objectKey) return;
    let live = true;
    presignGet(objectKey).then((u) => live && setSrc(u)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [objectKey]);
  if (!objectKey || err) return <div className={`flex items-center justify-center bg-stone-100 text-xs text-stone-400 ${className}`}>no image</div>;
  if (!src) return <div className={`animate-pulse bg-stone-100 ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`object-contain ${className}`} />;
}

export const batchLabel = (b?: { batch_no: number; name?: string | null } | null) =>
  b ? `Batch ${b.batch_no}${b.name ? ` · ${b.name}` : ""}` : "—";

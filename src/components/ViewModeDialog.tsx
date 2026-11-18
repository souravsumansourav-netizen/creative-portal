"use client";
import { setViewMode, type ViewMode } from "@/lib/viewMode";

const OPTIONS: { mode: ViewMode; title: string; sub: string; detail: string }[] = [
  {
    mode: "reviewer",
    title: "Reviewer",
    sub: "A focused view, so it's always clear what to do next.",
    detail: "Triage · Review · Sent back · Library · Routing · Dashboard",
  },
  {
    mode: "admin",
    title: "Admin",
    sub: "The full portal, exactly as before.",
    detail: "Every screen, plus Production, PDP, Performance, Batches and Users",
  },
];

/** Shown to admins at sign-in (and from "Switch view"): pick which role to browse as. */
export function ViewModeDialog({ current, onClose }: { current: ViewMode | null; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="view-mode-title">
      <div className="w-full max-w-xl rounded-2xl bg-ivory p-7 shadow-2xl">
        <h2 id="view-mode-title" className="font-display text-3xl font-semibold text-maroon-900">How would you like to browse?</h2>
        <div className="mt-2 h-px w-14 bg-gold-500" />
        <p className="mb-5 mt-3 text-sm text-stone-500">Choose a role for this session. You can switch any time from the menu bar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button key={o.mode} title={o.sub}
              onClick={() => { setViewMode(o.mode); onClose?.(); }}
              className={`rounded-xl border bg-white p-4 text-left shadow-card transition hover:border-maroon-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-300 ${current === o.mode ? "border-maroon-600 ring-1 ring-maroon-300" : "border-stone-200"}`}>
              <p className="font-display text-2xl font-semibold text-maroon-800">{o.title}</p>
              <p className="mt-1 text-sm text-stone-600">{o.sub}</p>
              <p className="mt-3 text-xs text-stone-400">{o.detail}</p>
            </button>
          ))}
        </div>
        {current && onClose && (
          <button className="mt-4 text-sm text-stone-500 underline-offset-4 hover:underline" onClick={onClose}>Keep current view</button>
        )}
      </div>
    </div>
  );
}

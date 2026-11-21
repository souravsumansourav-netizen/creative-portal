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
    <div className="scrim anim-fade fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="view-mode-title">
      <div className="sheet anim-pop w-full max-w-xl rounded-3xl p-7">
        <h2 id="view-mode-title" className="text-[1.75rem] font-semibold tracking-[-0.024em]">How would you like to browse?</h2>
        <p className="mb-5 mt-1.5 text-[0.9375rem] text-stone-500">Choose a role for this session. You can switch any time from the menu bar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button key={o.mode} title={o.sub}
              onClick={() => { setViewMode(o.mode); onClose?.(); }}
              className={`rounded-2xl border bg-white p-4 text-left shadow-card transition-[transform,box-shadow,border-color] duration-150 hover:shadow-md active:scale-[0.98] motion-reduce:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-400 ${current === o.mode ? "border-maroon-600 ring-1 ring-maroon-300" : "border-black/[0.06] hover:border-maroon-300"}`}>
              <p className="text-xl font-semibold tracking-[-0.018em] text-maroon-800">{o.title}</p>
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

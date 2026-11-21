"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, CaseUpper, Eye, FileImage, Images, Layers, LayoutDashboard, ListChecks, Megaphone, Route, Undo2, Upload, Users, type LucideIcon } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { NAV, type Role } from "@/lib/constants";
import { REVIEWER_PATHS, setViewMode, useViewMode } from "@/lib/viewMode";
import { ViewModeDialog } from "@/components/ViewModeDialog";

const ICONS: Record<string, LucideIcon> = {
  "/upload": Upload, "/triage": ListChecks, "/review": Eye, "/rework": Undo2, "/library": Images, "/routing": Route,
  "/dashboard": LayoutDashboard, "/production": Camera, "/output/pdp": FileImage, "/output/performance": Megaphone,
  "/admin/batches": Layers, "/admin/rename": CaseUpper, "/admin/users": Users,
};

export function Nav({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const mode = useViewMode();
  const [switching, setSwitching] = useState(false);
  const isAdmin = role === "admin";
  const reviewerView = isAdmin && mode === "reviewer";
  const items = NAV.filter((n) => (isAdmin ? !reviewerView || n.roles.includes("approver") : n.roles.includes(role)));

  // reviewer view: screens outside the reviewer's set are off limits for this session
  useEffect(() => {
    if (reviewerView && !REVIEWER_PATHS.some((p) => path.startsWith(p))) router.replace("/dashboard");
  }, [reviewerView, path, router]);

  return (
    <header className="border-b border-black/[0.08] bg-white/75 text-stone-900 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 py-3">
        <span className="flex items-center gap-2 font-display text-[1.0625rem] font-semibold tracking-[-0.01em] text-stone-900">
          <span className="text-maroon-700" aria-hidden>◆</span> Creative Portal
        </span>
        <nav className="flex flex-wrap gap-1">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.875rem] transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${
                path.startsWith(n.href)
                  ? "bg-maroon-700/10 font-medium text-maroon-800"
                  : "text-stone-600 hover:bg-black/[0.05] hover:text-stone-900"
              }`}
            >
              {(() => { const I = ICONS[n.href]; return I ? <I size={15} strokeWidth={2} className="opacity-80" aria-hidden /> : null; })()}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-stone-500">
          <span>{name} · <b className="font-medium capitalize text-stone-900">{isAdmin && mode ? `${mode} view` : role.replace("_", " ")}</b></span>
          {isAdmin && mode && (
            <button className="rounded-lg bg-black/[0.06] px-2.5 py-1 text-stone-800 transition-[background-color,transform] duration-150 hover:bg-black/[0.10] active:scale-[0.97] motion-reduce:active:scale-100" onClick={() => setSwitching(true)}>
              Switch view
            </button>
          )}
          <button
            className="rounded-lg bg-black/[0.06] px-2.5 py-1 text-stone-700 transition-[background-color,transform] duration-150 hover:bg-black/[0.10] active:scale-[0.97] motion-reduce:active:scale-100"
            onClick={async () => { setViewMode(null); await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); }}
          >
            Sign out
          </button>
        </div>
      </div>
      {isAdmin && (mode === null || switching) && <ViewModeDialog current={mode} onClose={switching ? () => setSwitching(false) : undefined} />}
    </header>
  );
}

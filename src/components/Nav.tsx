"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { NAV, type Role } from "@/lib/constants";
import { REVIEWER_PATHS, setViewMode, useViewMode } from "@/lib/viewMode";
import { ViewModeDialog } from "@/components/ViewModeDialog";

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
    <header className="border-b-2 border-gold-500 bg-maroon-800 text-maroon-100 shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 py-3">
        <span className="flex items-center gap-2 font-display text-xl font-semibold tracking-wide text-white">
          <span className="text-gold-400" aria-hidden>◆</span> Creative Portal
        </span>
        <nav className="flex flex-wrap gap-1">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                path.startsWith(n.href)
                  ? "bg-white/15 font-medium text-white ring-1 ring-gold-400/60"
                  : "text-maroon-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-maroon-200">
          <span>{name} · <b className="font-medium capitalize text-gold-300">{isAdmin && mode ? `${mode} view` : role.replace("_", " ")}</b></span>
          {isAdmin && mode && (
            <button className="rounded-md border border-gold-400/50 px-2.5 py-1 text-gold-300 transition-colors hover:bg-white/10" onClick={() => setSwitching(true)}>
              Switch view
            </button>
          )}
          <button
            className="rounded-md border border-white/25 px-2.5 py-1 text-maroon-100 transition-colors hover:bg-white/10"
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

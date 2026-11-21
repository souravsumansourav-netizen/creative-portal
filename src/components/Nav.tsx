"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Menu as MenuIcon } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { NAV, type Role } from "@/lib/constants";
import { REVIEWER_PATHS, setViewMode, useViewMode } from "@/lib/viewMode";
import { ViewModeDialog } from "@/components/ViewModeDialog";

const PRIMARY = 7; // this many sections sit in the bar; the rest live under "More"

/** A small dropdown that closes on outside click, Escape, or navigation. */
function Popover({ label, trigger, align = "left", children, active = false, plain = false }: {
  label: string; trigger: ReactNode; align?: "left" | "right"; children: (close: () => void) => ReactNode; active?: boolean; plain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${plain ? "h-full" : ""}`}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={plain ? "flex h-full items-center" : `flex items-center rounded-lg transition-[background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${active || open ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"}`}>
        {trigger}
      </button>
      {open && (
        <div role="menu" className={`sheet anim-pop absolute top-full z-50 mt-2 min-w-[12.5rem] rounded-xl p-1 text-[0.875rem] ${align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const menuItem = "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-stone-800 transition-colors hover:bg-maroon-700 hover:text-white";

export function Nav({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const mode = useViewMode();
  const [switching, setSwitching] = useState(false);
  const isAdmin = role === "admin";
  const reviewerView = isAdmin && mode === "reviewer";
  const items = NAV.filter((n) => (isAdmin ? !reviewerView || n.roles.includes("approver") : n.roles.includes(role)));
  const primary = items.slice(0, PRIMARY);
  const more = items.slice(PRIMARY);
  const isActive = (href: string) => path.startsWith(href);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const roleLabel = isAdmin && mode ? `${mode} view` : role.replace("_", " ");

  // reviewer view: screens outside the reviewer's set are off limits for this session
  useEffect(() => {
    if (reviewerView && !REVIEWER_PATHS.some((p) => path.startsWith(p))) router.replace("/dashboard");
  }, [reviewerView, path, router]);

  async function signOut() {
    setViewMode(null);
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const underline = "after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-stone-900";
  const linkCls = (active: boolean) =>
    `relative flex h-full items-center px-3 text-[0.8125rem] transition-colors duration-150 ${
      active ? `font-medium text-stone-900 ${underline}` : "text-stone-500 hover:text-stone-900"
    }`;

  return (
    <>
      {/* one quiet, sticky, frosted row; content scrolls underneath */}
      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/70 text-stone-900 backdrop-blur-xl backdrop-saturate-[1.8]">
        <div className="mx-auto flex h-[52px] max-w-7xl items-center gap-1 px-4">
          <Link href="/" className="mr-4 whitespace-nowrap text-[0.9375rem] font-semibold tracking-[-0.012em] text-stone-900">Tanishq Creative Portal</Link>

          <nav className="hidden h-full items-stretch gap-0.5 md:flex" aria-label="Sections">
            {primary.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={linkCls(isActive(n.href))}>{n.label}</Link>
            ))}
            {more.length > 0 && (
              <Popover label="More sections" plain
                trigger={<span className={`${linkCls(more.some((n) => isActive(n.href)))} gap-1`}>More <ChevronDown size={13} aria-hidden /></span>}>
                {(close) => more.map((n) => (
                  <Link key={n.href} href={n.href} role="menuitem" onClick={close} className={`${menuItem} ${isActive(n.href) ? "font-medium" : ""}`}>{n.label}</Link>
                ))}
              </Popover>
            )}
          </nav>

          <span className="flex-1" />

          {/* small screens: every section in one menu */}
          <div className="md:hidden">
            <Popover label="Menu" align="right" trigger={<span className="p-2 text-stone-700"><MenuIcon size={18} aria-hidden /></span>}>
              {(close) => items.map((n) => (
                <Link key={n.href} href={n.href} role="menuitem" onClick={close} className={`${menuItem} ${isActive(n.href) ? "font-medium" : ""}`}>{n.label}</Link>
              ))}
            </Popover>
          </div>

          <Popover label="Account" align="right"
            trigger={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.07] text-[0.75rem] font-semibold text-stone-800">{initials}</span>}>
            {(close) => (
              <>
                <div className="px-3 pb-2 pt-1.5">
                  <p className="truncate text-[0.875rem] font-semibold text-stone-900">{name}</p>
                  <p className="text-xs capitalize text-stone-500">{roleLabel}</p>
                </div>
                <div className="my-1 h-px bg-black/[0.07]" />
                {isAdmin && (
                  <button role="menuitem" className={menuItem} onClick={() => { close(); setSwitching(true); }}>Switch view</button>
                )}
                <button role="menuitem" className={menuItem} onClick={() => { close(); signOut(); }}>Sign out</button>
              </>
            )}
          </Popover>
        </div>
      </header>

      {/* outside the header: a frosted bar would otherwise become this dialog's frame of reference */}
      {isAdmin && (mode === null || switching) && <ViewModeDialog current={mode} onClose={switching ? () => setSwitching(false) : undefined} />}
    </>
  );
}

"use client";
import { usePathname } from "next/navigation";

/** Each navigation settles in with a short rise + fade (cross-fade only with Reduce motion). */
// Simple pages read better in a narrower column; wide tables (Triage, Library, Routing…) keep the full width.
const NARROW = ["/upload", "/rework", "/admin/users", "/admin/batches", "/admin/rename"];

export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const narrow = NARROW.some((p) => path.startsWith(p));
  return <div key={path} className={`page-enter ${narrow ? "mx-auto max-w-[68rem]" : ""}`}>{children}</div>;
}

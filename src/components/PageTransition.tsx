"use client";
import { usePathname } from "next/navigation";

/** Each navigation settles in with a short rise + fade (cross-fade only with Reduce motion). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <div key={path} className="page-enter">{children}</div>;
}

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants";

export async function getProfile() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  return profile as { id: string; full_name: string | null; email: string | null; role: Role };
}

/** Server-side gate. Admin passes everywhere; other roles must be listed. */
export async function requireRole(allowed: Role[]) {
  const profile = await getProfile();
  if (profile.role !== "admin" && !allowed.includes(profile.role)) redirect("/");
  return profile;
}

/** Build a route-segment layout.tsx that gates the whole segment by role. */
export function roleLayout(allowed: Role[]) {
  return async function RoleLayout({ children }: { children: ReactNode }) {
    await requireRole(allowed);
    return <>{children}</>;
  };
}

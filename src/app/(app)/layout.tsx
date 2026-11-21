import { getProfile } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { StorageAlert } from "@/components/StorageAlert";
import { PageTransition } from "@/components/PageTransition";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <>
      <Nav role={profile.role} name={profile.full_name || profile.email || "User"} />
      {profile.role === "admin" && <StorageAlert />}
      <main className="mx-auto max-w-7xl px-4 py-6"><PageTransition>{children}</PageTransition></main>
    </>
  );
}

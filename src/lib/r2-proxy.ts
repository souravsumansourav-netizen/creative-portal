import { supabaseServer } from "@/lib/supabase/server";

/** Signed-in user + a way to call the `presign` Edge Function as them (R2 credentials stay in Supabase). */
export async function proxyAuth() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  async function presign(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/presign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session!.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) throw new Error(json.error ?? `presign failed (${res.status})`);
    return json.url as string;
  }
  return { user, presign };
}

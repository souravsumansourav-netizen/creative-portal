"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, btnGhost, input, Msg } from "@/components/ui";

// Admin and approver are deliberately absent: only an existing admin can grant them (the database enforces this).
const SIGNUP_ROLES = [
  { value: "uploader", label: "SKU uploader: uploads the SKU list" },
  { value: "creator", label: "Creator: produces mood / model images" },
  { value: "pdp_uploader", label: "PDP team: receives PDP images" },
  { value: "performance", label: "Performance team: receives campaign images" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "up" && !role) return setError("Please choose your role.");
    setBusy(true); setError(null); setInfo(null);
    const sb = supabaseBrowser();
    const { data, error } = mode === "in"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { data: { full_name: name, requested_role: role } } });
    setBusy(false);
    if (error) return setError(error.message);
    if (mode === "up" && !data.session) return setInfo("Check your email to confirm your account, then sign in.");
    router.replace("/");
    router.refresh();
  }

  async function google() {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="grid min-h-screen md:grid-cols-[1.1fr_1fr]">
      {/* brand panel */}
      <section
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-maroon-100 md:flex"
        style={{
          backgroundColor: "#4A111A",
          backgroundImage:
            "radial-gradient(circle at 20% 15%, rgba(209,178,107,0.18), transparent 45%), radial-gradient(circle at 85% 85%, rgba(139,45,63,0.55), transparent 50%), linear-gradient(160deg, #631822 0%, #4A111A 60%, #340b12 100%)",
        }}
      >
        <div className="flex items-center gap-2 font-display text-2xl tracking-wide text-white">
          <span className="text-gold-400" aria-hidden>◆</span> Creative Portal
        </div>
        <div className="max-w-md">
          <div className="mb-6 h-px w-16 bg-gold-400" />
          <h1 className="font-display text-5xl font-semibold leading-[1.1] !text-white">Every image, approved with care.</h1>
          <p className="mt-5 text-base leading-relaxed text-maroon-200">
            Mood and model shots, from first upload to final approval, in one considered workflow.
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.25em] text-gold-400/80">Creative Approval Portal</p>
        {/* decorative rings */}
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full border border-gold-400/20" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full border border-gold-400/25" />
      </section>

      {/* form panel */}
      <section className="flex items-center justify-center bg-ivory px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <span className="font-display text-2xl font-semibold text-maroon-800"><span className="text-gold-500">◆</span> Creative Portal</span>
          </div>
          <h2 className="font-display text-4xl font-semibold text-maroon-900">{mode === "in" ? "Welcome back" : "Create your account"}</h2>
          <div className="mt-2 h-px w-14 bg-gold-500" />
          <p className="mb-7 mt-3 text-sm text-stone-500">{mode === "in" ? "Sign in to continue to the portal." : "Join the portal to begin."}</p>
          <Msg error={error} ok={info} />
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            {mode === "up" && <input className={`${input} py-2.5`} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />}
            {mode === "up" && (
              <select className={`${input} py-2.5 ${role ? "" : "text-stone-400"}`} required value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="" disabled>Select your role…</option>
                {SIGNUP_ROLES.map((r) => <option key={r.value} value={r.value} className="text-stone-900">{r.label}</option>)}
              </select>
            )}
            <input className={`${input} py-2.5`} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={`${input} py-2.5`} type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className={`${btn} mt-1 py-2.5 text-[0.95rem]`} disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-stone-400">
            <span className="h-px flex-1 bg-stone-200" />or<span className="h-px flex-1 bg-stone-200" />
          </div>
          <button className={`${btnGhost} w-full py-2.5`} onClick={google}>Continue with Google</button>
          <button className="mt-6 text-sm text-maroon-700 underline-offset-4 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </section>
    </main>
  );
}

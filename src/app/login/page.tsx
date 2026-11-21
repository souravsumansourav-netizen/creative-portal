"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, btnGhost, input, Msg } from "@/components/ui";
import { Select } from "@/components/controls";
import { Camera, Eye, Gem, Megaphone, Upload } from "lucide-react";

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
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ivory">
      {/* ambient background: soft pools of accent light behind the glass card */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "radial-gradient(55% 45% at 50% -5%, rgba(155,28,49,0.13), transparent 70%), radial-gradient(40% 40% at 95% 95%, rgba(155,28,49,0.07), transparent 70%), radial-gradient(35% 35% at 0% 85%, rgba(0,122,255,0.05), transparent 70%)" }} />

      <section className="relative flex flex-1 items-center justify-center px-6 py-12">
        <div className="stagger w-full max-w-[23rem]">
          <div className="mx-auto mb-6 flex h-[68px] w-[68px] items-center justify-center rounded-[20px] bg-gradient-to-b from-maroon-500 to-maroon-800 text-white shadow-[0_10px_30px_-8px_rgba(155,28,49,0.6),inset_0_1px_0_rgba(255,255,255,0.35)]">
            <Gem size={32} strokeWidth={1.6} />
          </div>

          <div>
            <h1 className="text-center text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.032em]">{mode === "in" ? "Sign in" : "Create account"}</h1>
            <p className="mb-7 mt-3 text-center text-[1.0625rem] text-stone-500">
              {mode === "in" ? "Every image, approved with care." : "Choose how you’ll use the portal."}
            </p>
          </div>

          <div>
            <Msg error={error} ok={info} />
            <form onSubmit={submit} className="glass-card rounded-3xl p-5">
              <div className="flex flex-col gap-3">
                {mode === "up" && <input className={`${input} py-3`} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />}
                {mode === "up" && (
                  <Select className={`${input} w-full py-3`} value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="" disabled>Select your role…</option>
                    {SIGNUP_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </Select>
                )}
                <input className={`${input} py-3`} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className={`${input} py-3`} type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className={`${btn} mt-1 w-full py-3 text-[1rem]`} disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</button>
              </div>
            </form>
            <button className={`${btnGhost} mt-3 w-full py-3`} onClick={google}>Continue with Google</button>
            <p className="mt-6 text-center text-sm text-stone-500">
              {mode === "in" ? "New here? " : "Already have an account? "}
              <button className="font-medium text-maroon-700 underline-offset-4 hover:underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); setInfo(null); }}>
                {mode === "in" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>

          {/* the whole journey at a glance */}
          <div className="mt-10 flex items-start justify-between gap-2 px-1">
            {[[Upload, "Upload"], [Camera, "Produce"], [Eye, "Review"], [Megaphone, "Publish"]].map(([Icon, label], i, arr) => {
              const I = Icon as typeof Upload;
              return (
                <div key={label as string} className="flex flex-1 items-start">
                  <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-stone-600 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.05)]"><I size={17} /></span>
                    <span className="text-xs font-medium text-stone-500">{label as string}</span>
                  </div>
                  {i < arr.length - 1 && <span aria-hidden className="mt-5 h-px w-4 shrink-0 bg-black/15" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="relative pb-6 text-center text-xs text-stone-400">Creative Approval Portal</footer>
    </main>
  );
}

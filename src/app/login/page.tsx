"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Gem } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Msg } from "@/components/ui";
import { Select } from "@/components/controls";

// Admin and approver are deliberately absent: only an existing admin can grant them (the database enforces this).
const SIGNUP_ROLES = [
  { value: "uploader", label: "SKU uploader: uploads the SKU list" },
  { value: "creator", label: "Creator: produces mood / model images" },
  { value: "pdp_uploader", label: "PDP team: receives PDP images" },
  { value: "performance", label: "Performance team: receives campaign images" },
];

// soft, borderless pill fields; the accent only shows on focus
const pill =
  "h-11 w-full rounded-full bg-[#F2F2F4] px-5 text-[0.9375rem] text-stone-900 placeholder:text-stone-400 outline-none transition-[background-color,box-shadow] duration-150 focus:bg-white focus:shadow-[inset_0_0_0_1.5px_rgba(155,28,49,0.55),0_0_0_4px_rgba(155,28,49,0.12)]";

const GoogleG = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-900 p-4 sm:p-8">
      {/* the same photograph, blurred and dimmed, fills the window behind the card */}
      <div aria-hidden className="absolute inset-0 scale-110 bg-cover bg-center blur-[30px] saturate-[1.2]" style={{ backgroundImage: "url(/login-hero.jpg)" }} />
      <div aria-hidden className="absolute inset-0 bg-black/25" />

      <section className="anim-pop relative grid w-full max-w-[62rem] overflow-hidden rounded-[2rem] bg-white p-3 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.65)] md:grid-cols-[1fr_1.05fr]">
        {/* form */}
        <div className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="stagger w-full max-w-[19.5rem] text-center">
            <p className="flex items-center justify-center gap-1.5 text-[1.0625rem] font-semibold tracking-[-0.01em] text-maroon-700">
              <Gem size={17} strokeWidth={2} aria-hidden /> Tanishq Creative Portal
            </p>

            <h1 className="mt-5 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.034em]">
              {mode === "in" ? "Welcome back" : "Create your account"}
            </h1>

            <div className="mt-7">
              <button type="button" onClick={google}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-white text-[0.9375rem] font-medium text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.07)] transition-[background-color,transform] duration-150 hover:bg-stone-50 active:scale-[0.98] motion-reduce:active:scale-100">
                <GoogleG /> Continue with Google
              </button>
              <p className="my-4 text-xs text-stone-400">or</p>
            </div>

            <div>
              <Msg error={error} ok={info} />
              <form onSubmit={submit} className="flex flex-col gap-3 text-left">
                {mode === "up" && <input className={pill} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />}
                {mode === "up" && (
                  <Select className={pill} value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="" disabled>Select your role…</option>
                    {SIGNUP_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </Select>
                )}
                <input className={pill} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <div className="relative">
                  <input className={`${pill} pr-12`} type={showPw ? "text" : "password"} required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 transition-colors hover:text-stone-700">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button disabled={busy}
                  className="mt-2 h-12 w-full rounded-full bg-maroon-700 text-[1rem] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(155,28,49,0.7)] transition-[background-color,transform] duration-150 hover:bg-maroon-600 active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100">
                  {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}
                </button>
              </form>
            </div>

            <p className="pt-3 text-sm text-stone-500">
              {mode === "in" ? "New here? " : "Already have an account? "}
              <button className="font-semibold text-stone-900 underline-offset-4 hover:underline"
                onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); setInfo(null); }}>
                {mode === "in" ? "Create an account" : "Log in"}
              </button>
            </p>
          </div>
        </div>

        {/* photograph with floating glass labels (hidden on small screens) */}
        <div className="relative hidden min-h-[36rem] overflow-hidden rounded-[1.5rem] md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/login-hero.jpg" alt="Tanishq rose-gold necklace and earrings" fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover object-[50%_46%]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />

          {/* label 1: pinned to the chain, resting on the empty blue inside the necklace */}
          <div aria-hidden className="absolute left-[27%] top-[25%] h-[5rem] w-px bg-white/70" />
          <span aria-hidden className="absolute left-[27%] top-[25%] h-2 w-2 -translate-x-[3.5px] -translate-y-1 rounded-full bg-white shadow ring-4 ring-white/30" />
          <div className="absolute left-[27%] top-[25%] mt-[5rem] flex -translate-x-6 items-center gap-3 rounded-full bg-black/30 py-1.5 pl-1.5 pr-5 text-white ring-1 ring-white/25 backdrop-blur-md">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Gem size={16} /></span>
            <span className="leading-tight">
              <span className="block text-[0.6875rem] text-white/75">Mood shot</span>
              <span className="block text-[0.9375rem] font-semibold">O5PL2CU</span>
            </span>
          </div>

          {/* label 2: pinned to a lower pendant, resting on the empty blue below */}
          <div aria-hidden className="absolute left-[44%] top-[69%] h-[3.2rem] w-px bg-white/70" />
          <span aria-hidden className="absolute left-[44%] top-[69%] h-2 w-2 -translate-x-[3.5px] -translate-y-1 rounded-full bg-white shadow ring-4 ring-white/30" />
          <div className="absolute left-[44%] top-[69%] mt-[3.2rem] -translate-x-8 rounded-2xl bg-white/20 px-4 py-2.5 text-white ring-1 ring-white/30 backdrop-blur-md">
            <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold"><span className="h-2 w-2 rounded-full bg-apple-green" /> Approved</p>
            <p className="text-[0.75rem] text-white/80">Ready for PDP</p>
          </div>
        </div>
      </section>
    </main>
  );
}

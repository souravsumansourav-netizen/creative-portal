import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// OAuth (Google) code exchange
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}/`);
}

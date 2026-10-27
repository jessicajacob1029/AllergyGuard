import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

// Only sign-up confirmation links are handled here.
const ALLOWED_TYPES: readonly EmailOtpType[] = ["email", "signup"];

// Target of the "Confirm your email" link. Accepts both link styles:
// - ?token_hash=...&type=email&next=/onboarding (custom template, see docs/PROGRESS.md).
//   Works on any device.
// - ?code=... (Supabase's default template, after its /verify step). Only works in
//   the browser that signed up, because the code needs that browser's PKCE cookie.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  } else if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/signup?error=confirmation_failed");
}

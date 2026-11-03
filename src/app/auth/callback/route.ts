import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { afterOAuthPath } from "@/lib/auth/oauth";
import { safeNextPath } from "@/lib/auth/redirect";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

// Where Google (via Supabase) sends the browser back after "Continue with Google".
// - ?code=...: exchange it for a session (PKCE: the verifier is the cookie set
//   when the button was pressed, so this only works in the same browser).
// - ?error=... (cancelled, denied) or a failed exchange: back to Log in with a
//   friendly message.
// New users (or anyone mid-onboarding) go to /onboarding; everyone else to a
// safe `next` (default home). If the Google email matches an existing account,
// Supabase has already linked it, so the user lands in their existing profile.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/");
  const failed = `/login?error=google${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`;

  const code = searchParams.get("code");
  if (searchParams.get("error") || !code) redirect(failed);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Google sign-in: code exchange failed", error.message);
    redirect(failed);
  }

  // The page we land on checks onboarding again, so a failed lookup here is safe.
  let target = next;
  try {
    target = afterOAuthPath((await loadOwnProfile(supabase))?.profile ?? null, next);
  } catch (lookupError) {
    console.error("Google sign-in: profile lookup failed", lookupError);
  }
  redirect(target);
}

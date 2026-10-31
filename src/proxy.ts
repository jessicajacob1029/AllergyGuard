import { NextResponse, type NextRequest } from "next/server";
import { oauthReturnForward } from "@/lib/auth/oauth";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Safety net: a sign-in return (?code=...) that Supabase sent to the wrong page
  // (e.g. the Site URL "/") is forwarded to /auth/callback so it still completes.
  const forward = oauthReturnForward(request.nextUrl);
  if (forward) return NextResponse.redirect(new URL(forward, request.url));
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static files, image optimisation, the service worker, and public assets.
    "/((?!_next/static|_next/image|serwist/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};

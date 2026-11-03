import { NextResponse, type NextRequest } from "next/server";
import { oauthReturnForward } from "@/lib/auth/oauth";
import { buildCsp, createNonce, CSP_MODE, cspHeaderName, isStaticPage } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Safety net: a sign-in return (?code=...) that Supabase sent to the wrong page
  // (e.g. the Site URL "/") is forwarded to /auth/callback so it still completes.
  const forward = oauthReturnForward(request.nextUrl);
  if (forward) return NextResponse.redirect(new URL(forward, request.url));

  // Content-Security-Policy (see src/lib/security/csp.ts). Next.js reads the
  // nonce from this request header and stamps it on its own scripts.
  const nonce = isStaticPage(request.nextUrl.pathname) ? null : createNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  const header = cspHeaderName(CSP_MODE);
  if (nonce) request.headers.set(header, csp);

  const response = await updateSession(request);
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static files, image optimisation, the service worker, public assets and
    // the OCR files (their own policy is in next.config.ts; no session needed).
    "/((?!_next/static|_next/image|serwist/|tesseract/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};

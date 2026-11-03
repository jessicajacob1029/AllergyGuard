// Google sign-in helpers. Pure, no network.
import { NAME_MAX_LENGTH } from "@/lib/profile/validation";
import { safeNextPath } from "./redirect";

/** Shown on Log in when Google sign-in was cancelled or failed. */
export const GOOGLE_LOGIN_FAILED = "Google sign-in didn't finish. Try again, or log in with your email.";

/** Where the browser comes back to after Google: our callback, carrying a safe `next`. */
export function oauthRedirectTo(origin: string, next: string | null | undefined): string {
  const path = safeNextPath(next, "/");
  return `${origin}/auth/callback${path === "/" ? "" : `?next=${encodeURIComponent(path)}`}`;
}

/**
 * Where to go once the session exists: onboarding until it is finished,
 * otherwise the (already checked) `next` path.
 */
export function afterOAuthPath(profile: { onboarding_completed_at: string | null } | null, next: string): string {
  if (!profile || profile.onboarding_completed_at === null) return "/onboarding";
  return next;
}

/** A name to start onboarding with, from the Google account (full_name or name). Empty if none. */
export function nameFromMetadata(metadata: unknown): string {
  if (typeof metadata !== "object" || metadata === null) return "";
  const m = metadata as Record<string, unknown>;
  const raw = typeof m.full_name === "string" ? m.full_name : typeof m.name === "string" ? m.name : "";
  return raw.trim().replace(/\s+/g, " ").slice(0, NAME_MAX_LENGTH);
}

/** Routes that handle `?code=` themselves (Google return, email confirmation). */
const CODE_ROUTES = ["/auth/callback", "/auth/confirm"];

/**
 * Safety net for a Supabase sign-in return that landed on the wrong page.
 * If the Redirect URL isn't allowed, Supabase falls back to the Site URL (for
 * example "/?code=..."), and nothing would exchange the code. Returns where to
 * forward the browser (the same code to /auth/callback, with the page it
 * landed on as a safe `next`), or null when there is nothing to do.
 * A Supabase error return (`error` + `error_description`) is forwarded too,
 * so the person sees the friendly message on Log in.
 */
export function oauthReturnForward(url: URL): string | null {
  if (CODE_ROUTES.some((route) => url.pathname === route)) return null;
  const params = new URLSearchParams(url.search);
  const code = params.get("code");
  const isAuthError = params.has("error") && params.has("error_description");
  if (!code && !isAuthError) return null;

  for (const key of ["code", "error", "error_code", "error_description", "state"]) params.delete(key);
  const rest = params.toString();
  const next = safeNextPath(`${url.pathname}${rest ? `?${rest}` : ""}`, "/");
  const forward = new URLSearchParams();
  if (code) forward.set("code", code);
  else forward.set("error", url.searchParams.get("error") ?? "access_denied");
  if (next !== "/") forward.set("next", next);
  return `/auth/callback?${forward.toString()}`;
}

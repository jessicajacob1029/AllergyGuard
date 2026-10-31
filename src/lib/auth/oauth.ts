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

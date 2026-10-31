"use client";

import { useState } from "react";
import { oauthRedirectTo } from "@/lib/auth/oauth";
import { createClient } from "@/lib/supabase/client";

/** Google's official "G" mark (colours and shape unchanged, per Google's branding rules). */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google". White with Google's grey outline and the official G;
 * the text is DM Sans like the rest of the app. Supabase sends the browser to
 * Google and back to /auth/callback, carrying a safe `next`.
 */
export function GoogleButton({ next = "/" }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    if (!navigator.onLine) {
      setError("You're offline. Connect to the internet to continue with Google.");
      return;
    }
    setBusy(true);
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: oauthRedirectTo(window.location.origin, next) },
      });
      // On success the browser is already on its way to Google.
      if (oauthError) throw oauthError;
    } catch {
      setError("We couldn't open Google sign-in. Try again, or use your email below.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex min-h-[50px] w-full items-center justify-center gap-3 rounded-button border border-[#747775] bg-white px-4 text-[15px] font-semibold text-[#1f1f1f] transition-transform duration-150 active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <GoogleG />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-unsafe-ink">
          {error}
        </p>
      )}
    </div>
  );
}

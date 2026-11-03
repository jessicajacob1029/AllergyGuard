# Security rules

Rules for all new code in AllergyGuard. They add to the "Non-negotiable rules" in `CLAUDE.md` (RLS on every
table, secrets only in environment variables, only the Supabase URL and anon key in the browser, ask before adding
a dependency). Adapted from vibe-check's `AGENTS.md` (https://github.com/benavlabs/vibe-check, MIT), keeping only
what applies to our stack. Background and findings: `docs/SECURITY-REVIEW.md`.

## Headers and Content-Security-Policy

- Every response gets the headers in `src/lib/security/csp.ts` (`SECURITY_HEADERS`, set in `next.config.ts`, so
  static files get them too):
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security`
- No `X-Powered-By` (`poweredByHeader: false`).
- Every page gets the CSP from `buildCsp()`, added by `src/proxy.ts`.
  - Pages rendered per request use a fresh nonce with `'strict-dynamic'`.
  - Never add `'unsafe-inline'`, `'unsafe-eval'`, `*`, `data:`, `http:` or bare `https:` to `script-src` on those
    pages.
  - `'unsafe-inline'` is allowed in `style-src` only.
  - `default-src`, `object-src 'none'`, `base-uri`, `form-action` and `frame-ancestors 'none'` must stay declared.
- A new page that is prerendered (static) has no nonce. Add it to `STATIC_PAGES`, or render it per request (for
  example `await connection()`, as `not-found.tsx` does).
- A new external origin (an API, a CDN, fonts) must be added to the right directive on purpose. Try a change as
  `CSP_MODE = "report-only"` first if you aren't sure, and check the console on every page.
- Label photo OCR (Tesseract.js) runs in a worker loaded from `/tesseract/`. A worker follows the policy sent with
  its own script, so `/tesseract/*` skips the proxy and gets `OCR_WORKER_CSP` (`next.config.ts`): `default-src 'none';
  script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'`. That is the only place `'wasm-unsafe-eval'` is allowed;
  pages need nothing extra and no `blob:` workers (`workerBlobURL: false`). Checked enforced in Chromium and WebKit.

## Requests and input

- **No state changes on GET.** Changes happen in Server Actions, POST route handlers or Supabase calls. A link that
  changes something (such as unsubscribe) opens a page with a button. `SameSite=Lax` cookies are still sent on
  top-level GET navigations.
- **Validate on the server.** Server Actions and Edge Functions check every input again, even when the form already
  did. Client-side checks are only for the user's convenience.
- **Never build SQL or PostgREST filters from strings.** Use supabase-js methods and SQL function parameters; no
  `.or(\`…${input}\`)` and no dynamic SQL.
- **No raw HTML from user input** (`dangerouslySetInnerHTML`, `innerHTML`). HTML emails escape every user value.

## Fetching URLs (SSRF)

- The server only fetches fixed hosts (Open Food Facts, Resend, Supabase).
- A URL that comes from a user or browser is only used when it's on an allowlist. Push addresses must be on a known
  push service: `isKnownPushEndpoint()` in `supabase/functions/_shared/push-endpoint.ts` and
  `is_known_push_endpoint()` in the database. Keep the two in sync.
- Be a polite client of Open Food Facts:
  - send `USER_AGENT` from `src/lib/products/open-food-facts.ts` (app, version, site and contact);
  - make background requests one at a time with a pause between them (the weekly job uses 1.5 s);
  - stop on a 429.

## Cookies and CORS

- Auth cookies come from `@supabase/ssr`: `SameSite=Lax`. They can't be HttpOnly, because Supabase's browser client
  reads them, which is one more reason the CSP matters. Don't add other auth cookies without `HttpOnly`, `Secure`
  and `SameSite`.
- Never reflect the `Origin` header, and never combine `*` with credentials. A new endpoint that other origins call
  lists its allowed origins and methods. `send-test-push` uses `*` only because it needs a bearer token and no
  cookies are sent.

## Errors and what the site serves

- Users see generic messages. Details go to server logs only. No stack traces, SQL errors or file paths in
  responses.
- No public source maps: `productionBrowserSourceMaps` stays off, and the service worker is built with
  `sourcemap: false` (`src/app/serwist/[path]/route.ts`, H7).
- No debug or API-docs endpoints in production.

## Dependencies

- Ask before adding a dependency (CLAUDE.md). Check the package on npm first: real project, steady download
  history, not just published, name spelled right.
- Commit `package-lock.json`. Pin versions that matter for security, such as `next`.
- Run `npm audit` before each merge to `main`. Fix with `npm audit fix` (never `--force` without checking what it
  changes; for ESLint it suggests downgrades).
- Edge Functions pin their `npm:` imports to an exact version.

## Checking

- Database changes: run `scripts/rls-two-user.mjs` (two temporary users; it deletes them at the end).
- Header, CSP or hosting changes: re-run the vibe-check scanner against our own site only. Changes to the service
  worker, Dexie or `/emergency` also need the offline test (CLAUDE.md).

# AllergyGuard security review

Date: 1 November 2026. Code reviewed: the fork's `main` at `2bcd39f` (Phases 1–7, redesign v2, Google login).
Live site: https://allergy-guard-nine.vercel.app. Supabase project: `allergyguard` (`vwnwevrwoitvnsspudqe`).

**Report only.** No app code, config or database was changed for this review.

Sources:
1. `/security-review`: AI review of the code changes (section 1).
2. vibe-check live scanner against the live site (section 2).
3. vibe-check AI audit, all 17 categories, done by reading our code (section 3).
4. Supabase Security and Performance Advisors (section 4).
5. `npm audit` for production and dev dependencies, plus `gitleaks` on the git history (section 5).

Severity is for **our app**. Where a tool rated something differently, both ratings are given.
Effort: small (under an hour), medium (a few hours), large (a day or more).

---

## Summary

| ID | Severity | Finding | Where | Real? | Suggested fix | Effort |
|---|---|---|---|---|---|---|
| D1 | **High** (npm: critical) | Next.js 16.3.6 has 10 published advisories, including RCE and Server Actions DoS | `package.json` (`next`) | Real: the deployed version is in range. Several advisories need features we don't use (see 5.1) | Upgrade `next` and `eslint-config-next` to 16.4.3 (any version from 16.4.1 fixes them), then run the tests, build and offline check | Small |
| H1 | **Medium** | No Content-Security-Policy | Every page (live headers) | Real. It matters more because the Supabase session cookie can be read by scripts (A2) | Add a CSP in `next.config.ts` `headers()`. Start as Report-Only, allow the Supabase URL, use nonces for Next's inline scripts | Medium |
| H2 | **Medium** | No clickjacking protection (no X-Frame-Options, no `frame-ancestors`) | Every page | Real. Pages have one-tap actions (delete reaction, log out, turn off reminders) | `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'` | Small |
| A1 | **Low** | Push addresses are user-supplied URLs that the Edge Functions POST to (limited SSRF) | `push_subscriptions.endpoint`, `send-test-push`, `medication-reminders` | Real but limited: `https` only, encrypted body, response body never returned | Allow only known push services (FCM, Mozilla, Apple, Windows) in `save_push_subscription()` | Small |
| A2 | **Low** | Supabase session cookie isn't HttpOnly and has no `Secure` flag | `sb-…-auth-token` cookie (`@supabase/ssr` defaults) | Real by design: Supabase's browser client must read it. HSTS and the HTTPS redirect cover `Secure` in practice | Set `cookieOptions: { secure: true }` in the Supabase clients. Rely on the CSP (H1) against script theft | Small |
| H3 | **Low** | `X-Content-Type-Options: nosniff` missing | Pages and `/_next/static` files | Real | Add it to the same `headers()` block | Small |
| H4 | **Low** | Static files lack HSTS and `nosniff` | `/_next/static/…` | Real, low impact: pages already send strong HSTS | Apply the `headers()` rule to `/:path*` | Small |
| H5 | **Low** | `X-Powered-By: Next.js` header | Every response | Real, low impact | `poweredByHeader: false` in `next.config.ts` | Small |
| S1 | **Low** | Leaked password protection is off | Supabase Auth | Real. Email and password sign-up doesn't check HaveIBeenPwned | Turn on Auth → Passwords → leaked password protection (may need a paid plan) | Small |
| D2 | **Low** (npm: high) | `sharp` < 0.35.5 (librsvg) | `node_modules/sharp`, optional dependency of `next` | Mostly not reachable: no `next/image`, and Vercel optimises images itself. The icon route uses `next/og`, not sharp | Comes with the Next upgrade, or `npm audit fix` | Small |
| D3 | **Low** (npm: high) | `@serwist/turbopack` chain (zod, browserslist, glob, minimatch): memory and DoS issues | Build-time service worker tooling | Build time only, never at runtime, and inputs are our own files | No fix available yet. Update Serwist when one ships | Small |
| D4 | **Low** (npm: high) | `source-map-js` DoS | Build tooling | Build time only | `npm audit fix` | Small |
| D5 | **Low** (npm: high/moderate) | Dev-only tools: `vite` 8.3.1 (dev-server issues), `undici`, `vitest`/`@vitest/mocker` | Dev dependencies | Only on a dev machine running the test server | `npm audit fix` (no major upgrades needed) | Small |
| H6 | **Info** | `Referrer-Policy` not set explicitly | Every page | Browsers default to `strict-origin-when-cross-origin`, which is what we'd set | Add it with the other headers | Small |
| H7 | **Low** | The service worker's source map is public (`/serwist/sw.js.map`) | Live site | Real, low: it holds Serwist's code plus our `sw.ts` and push helpers, no secrets. The scanner doesn't flag it because it only checks scripts linked from the page. Found while fixing | Turn off Serwist's `sourcemap` (esbuild option in `createSerwistRoute`) | Small |
| A3 | **Info** | Signed-out role keeps Supabase's default table permissions on 6 older tables | `profiles`, `profile_allergens`, `emergency_contacts`, `medications`, `scans`, `reactions` | Not exploitable: RLS on, no signed-out policies, so 0 rows (tested) | Defence in depth: `revoke all … from anon` on those tables, as the Phase 7 tables already do | Small |
| A4 | **Info** | No app-level rate limits (scan lookups, test notification) | `checkBarcode`, `send-test-push` | Login, sign-up and reset are rate-limited by Supabase Auth. The rest only affects the caller's own account | Check the Supabase Auth rate limits in the dashboard. Optional per-user limit later | Medium |
| D6 | **Info** | Dependencies use `^` ranges | `package.json` | `package-lock.json` is committed, so installs are reproducible | Optional: pin exact versions | Small |
| S2 | **Info / false positive** | Advisor: SECURITY DEFINER functions callable by signed-out or signed-in users | `unsubscribe_email`, `save_push_subscription` | On purpose, and covered by the two-user test (53/53) | None. Documented in 4.1 | – |
| G1 | **False positive** | gitleaks "generic-api-key" | `src/app/api/unsubscribe/route.test.ts:10` | A made-up test token (`"0123456789abcdef".repeat(4)`) | None (optionally a `.gitleaksignore` entry) | – |
| V1 | **Info (operational)** | Vercel Security Checkpoint now challenges every request from our network (`x-vercel-mitigated: challenge`, HTTP 403 "Failed to verify your browser") | Live site, since the scan | Not a vulnerability. Probably Vercel's bot protection reacting to the scan's 78 requests. Real browsers pass the JavaScript challenge | Check Vercel → Firewall. Make sure no challenge mode is left on by mistake, and that the PWA and Home Screen app still load | Small |

**No critical or high findings in our own code.** The one high item is the Next.js version (D1).

---

## Fixes (branch `security-fixes`, 1 November 2026; merged to the fork's `main` on 3 November)

Chosen by Jessica. **Skipped for now:** A2 (Supabase cookie flags) and S1 (leaked password protection).

| ID | Status | What changed |
|---|---|---|
| D1 | **Fixed** | `next` 16.3.6 → **16.4.3**, and `eslint-config-next` 16.4.3, both pinned exactly. `sharp` 0.35.4 → **0.35.5**. Checked after the upgrade on a local production build: the service worker is built and active (push listeners included), the offline `/emergency` card works at 1440 and 390 with the network fully cut, Google sign-in reaches Google with PKCE and failed returns go to Log in, and the scanner's camera opens (Chromium fake camera, 640px video) and a typed barcode gives a verdict |
| H2 | **Fixed** | `X-Frame-Options: DENY` and an enforced `frame-ancestors 'none'` on every response |
| H3, H4 | **Fixed** | `X-Content-Type-Options: nosniff` and `Strict-Transport-Security: max-age=63072000; includeSubDomains` on every response, static files included (`next.config.ts` `headers()`, values in `src/lib/security/csp.ts`) |
| H5 | **Fixed** | `poweredByHeader: false` |
| H6 | **Fixed** | `Referrer-Policy: strict-origin-when-cross-origin` |
| H1 | **Fixed (enforced)** | Content-Security-Policy added by `src/proxy.ts` (see "CSP" below). Run as Report-Only first; the one problem found (the 404 page) was fixed; then switched to enforcing, with no violations |
| A1 | **Fixed, live** | Only real push services are accepted: `isKnownPushEndpoint()` (`supabase/functions/_shared/push-endpoint.ts`, 17 tests). Both Edge Functions delete and never contact a device whose address isn't on a known push service (redeployed 3 November: `send-test-push` v21, `medication-reminders` v22). Database: `is_known_push_endpoint()`, a check constraint on `push_subscriptions` and a clear error in `save_push_subscription()` (`20261101020000_push_endpoint_allowlist.sql`, run 3 November; both saved devices pass the constraint) |
| A3 | **Fixed, live** | `20261101030000_revoke_anon_old_tables.sql` (run 3 November) revokes the signed-out role's permissions on `profiles`, `profile_allergens`, `emergency_contacts`, `medications`, `scans` and `reactions`. Signed-in access is unchanged. Nothing in the app reads these tables signed out |
| D2, D4, D5 | **Fixed** | `npm audit fix` (no `--force`): `sharp` 0.35.5, `source-map-js` 1.2.2, `undici` 7.30.1, `vite` 8.3.5, `vitest` 4.1.12 |
| D3 | **Not fixable yet** | See "npm audit after the fixes" |
| V1 | **Cleared by itself** | The Vercel checkpoint was temporary. The live site answered 200 again later on 1 November, with no challenge header |
| H7 | New, **not fixed** | Found while checking the rules. Suggested fix above |
| H8 | New, **accepted** | Found by the live scan after the merge: Vercel serves JavaScript chunks outside our headers. Negligible risk; see "vibe-check scanner after the fixes" |

### CSP

- **Pages rendered per request:**
  - `default-src 'self'`;
  - `script-src 'self' 'nonce-<random per request>' 'strict-dynamic'`;
  - `style-src 'self' 'unsafe-inline'`;
  - `font-src 'self'`;
  - `img-src 'self' data: blob:`;
  - `media-src 'self' blob:`;
  - `connect-src 'self' https://vwnwevrwoitvnsspudqe.supabase.co`;
  - `worker-src 'self'`, `manifest-src 'self'`;
  - `frame-src 'none'`, `object-src 'none'`;
  - `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
- Next.js reads the nonce from the request header and stamps it on every script. All 16 scripts on `/login` and
  all 13 on the 404 page carry it.
- **`/emergency` and `/~offline`** are prerendered and cached by the service worker for offline use, so they can't
  have a per-request nonce. They use `script-src 'self' 'unsafe-inline'`. Neither page shows user-supplied text.
- **The 404 page** was prerendered too, and Report-Only showed its 9 chunk scripts and 3 inline scripts would be
  blocked. It's now rendered per request (`await connection()` in `src/app/not-found.tsx`), so it gets a nonce.
- **Report-Only check, then enforcing.** A local production build, signed out and as the QA account, Chromium.
  - Pages checked:
    - signed out: `/`, `/login`, `/signup`, `/privacy`, `/terms`, `/unsubscribe` (valid and bad link),
      `/emergency`, `/~offline`, a 404;
    - Continue with Google, up to Google's sign-in page;
    - signed in: Home, `/scan` with the camera open and a typed barcode, the scan result, `/scans`, `/diary`,
      `/diary/new`, `/profile`, `/onboarding`, `/emergency`;
    - service worker registration.
  - After the 404 fix: **0 CSP reports**. Switched to enforcing and checked again: **0 violations**, and the
    offline `/emergency` card still works at 1440 and 390.
  - Not visited: the reaction detail and edit pages, because the QA account has no reactions. They are built the
    same way as the other signed-in pages.
  - Remaining console messages: the 404 page's own 404, ZXing seeing no barcode in the fake camera video, and the
    scan page being left mid-request.
- **Previews:** with the CSP enforced, Vercel's preview toolbar script (`vercel.live`) is blocked on preview
  deployments. Production doesn't load it.
- **Phase 5 (Tesseract.js OCR, WebAssembly) will need `'wasm-unsafe-eval'` in `script-src`**, and probably
  `worker-src blob:`, when it's merged. This is noted in `src/lib/security/csp.ts` and `docs/SECURITY-RULES.md`.

### vibe-check scanner after the fixes

- **Before** (live site, `main`): 3 fail, 3 warn, 9 pass, 1 info.
- **After** (local production build of `security-fixes`, `http://localhost:3100`): **0 fail, 0 warn, 18 pass,
  2 info.** It now passes every CSP check (`default-src`, `script-src`, `object-src`, `base-uri`, `form-action`,
  `frame-ancestors`, fetch directives), X-Frame-Options, nosniff, Referrer-Policy, static-file headers and "no
  version headers".
  - The two info items are expected for a local scan: no cookies on the landing page, and HSTS skipped.
  - The preview couldn't be scanned because Vercel Deployment Protection is back on, which sends the scanner to
    Vercel's login. The live site keeps the old headers until the merge.
- **Live site after the merge** (3 November, one scan of https://allergy-guard-nine.vercel.app): **0 fail,
  1 warn, 19 pass, 1 info** (before: 3 fail, 3 warn). HSTS is now confirmed on the live pages. The info item is the
  usual "no cookies on the landing page".
- **The warning (H8, accepted):** one script, `/_next/static/immutable/chunks/…js`, has no `nosniff` and no HSTS
  header.
  - **Why:** Next 16.3+ on Vercel serves JavaScript chunks as "immutable static assets". They live in one store
    shared by all deployments, outside each deployment's routing, so the headers from `next.config.ts` don't
    reach them. Locally they're served from `/_next/static/chunks/`, which is why the local scan passed.
  - **Risk: negligible.** HSTS applies to the whole host: the browser learns it from any page (every page sends
    it) and then uses HTTPS for these files too. `nosniff` matters for files that could be read as the wrong type;
    these are our own build output, served with a JavaScript content type.
  - **If we ever want the warning gone:** set `supportsImmutableAssets: false` in `next.config.ts`. Chunks then go
    back to `/_next/static/chunks/?dpl=…` and get our headers. The cost is that browsers download every script
    again after each deploy. The change also affects the service worker's cached files, so it needs the offline
    test before merging.
  - Source: https://nextjs.org/docs/app/api-reference/adapters/immutable-static-assets
- After the scan, Vercel's Security Checkpoint challenged our IP again (V1), as it did after the first scan. It
  cleared by itself last time.

### npm audit after the fixes

- **Production:** 9 issues (1 critical, 6 high, 2 moderate) → **5 (0 critical, 3 high, 2 moderate)**.
- **All dependencies:** 28 → **20 (0 critical, 3 high, 17 moderate)**.
- What's left, and why:
  - **`@serwist/turbopack`, `@serwist/build` and `zod` < 4.6.6 (high), and `glob` and `minimatch` (moderate).**
    These are only used at build time to build the service worker, with our own files as input. Serwist 9.5.12 pins
    the vulnerable `zod`, so there's no fix until Serwist releases one. Check again when it updates.
  - **ESLint chain (17 moderate: `eslint`, `eslint-config-next`, `typescript-eslint`, the plugins).** All come
    through `minimatch` < 11.0.1, run only in the linter on our own files. npm's suggested "fix" is a **downgrade**
    to `eslint@4` and `eslint-config-next@0.2.4`, which would break linting, so it wasn't applied. Wait for
    upstream updates.

### Rollout (3 November 2026)

1. **Migrations.** Jessica ran both in the SQL Editor (A1, then A3). Checked read-only afterwards:
   - the function, the constraint (validated) and the new `save_push_subscription()` are in place, with the
     takeover guard kept;
   - signed-out users can't call it; signed-in users can;
   - FCM and Apple addresses pass; `evil.example` and `fcm.googleapis.com.evil.example` don't;
   - 0 saved devices break the rule;
   - the signed-out role has no permissions on the 6 tables, and signed-in users still do.

   Both are recorded in the migration history (`20261101020000`, `20261101030000`).
2. **Two-user RLS test: 62/62 passed** on the live project, and both test users were deleted afterwards. New this
   time:
   - signed-out reads of the 6 older tables are refused (401);
   - B can't save a device on `evil.example`, `169.254.169.254` or `fcm.googleapis.com.evil.example`
     (400, "Unsupported push service").

   (The first run stopped at check 34 on a bug in the script itself: a variable named `URL` hid the built-in
   `URL`. Fixed in `694c66a`.)
3. **Merged** `security-fixes` into the fork's `main` (`843e160`) after tests (722), lint and build passed.
4. **Edge Functions redeployed** with the allowlist. Checked:
   - `medication-reminders` still answers 403 without the cron secret;
   - a dry run for the QA account through the schedule's own call returned 200 and sent nothing;
   - `send-test-push` still answers 401 without a sign-in.
5. **Live scan:** 0 fail, 1 warn (H8, accepted). See "vibe-check scanner after the fixes".
6. **Still to do:** the phone check (send a push test notification, open the offline card). Not reported yet.

---

## What we already do well

For the project write-up.

- **Row Level Security on every table** (9 of 9). Policies are scoped to the owner through `profiles.owner_id = auth.uid()`, none use `USING (true)`, and signed-out visitors get nothing.
- **Two-user RLS tests on the live project**: Phase 1 (38/38), Phase 6 (23/23), Phase 7 (53/53) and the security fixes (62/62). The script is in the repo (`scripts/rls-two-user.mjs`) and deletes its test users afterwards.
- **Fixing what the tests find.** The Phase 7 test found a device-takeover path in `save_push_subscription()`, which was fixed the same day (`20261101010000_push_takeover_guard`).
- **SECURITY DEFINER functions are locked down:**
  - each one has `set search_path = ''`;
  - each one is only callable by the roles that need it;
  - the job's functions are service-role only.
- **Column-level grants** stop users from setting fields they shouldn't, such as their own unsubscribe token or another user's `owner_id`.
- **Sign-in:**
  - PKCE through `@supabase/ssr` for email links and Google;
  - `getClaims()`, which verifies the JWT signature, rather than trusting the cookie;
  - `safeNextPath()` on every redirect target, so there are no open redirects.
- **Every signed-in page and Server Action checks the session**, re-validates input on the server and relies on RLS for ownership. Another user's id gives a 404.
- **No secrets in the repo or its history.** gitleaks scanned 162 commits clean, apart from the made-up test token.
  - `.env*` is git-ignored.
  - The browser only gets the Supabase URL and anon key.
  - Service-role keys live only in Supabase secrets and a local git-ignored file.
- **Cron-only Edge Function** rejects every request without the secret (constant-time comparison) before doing anything else.
- **Unsubscribe tokens** are 32 random bytes. The link needs a button press (no change on GET), Gmail's one-click unsubscribe is supported, and nobody but the owner can read the token.
- **No raw HTML from user input.** React escapes everything, and the reminder email escapes the medication name and dose.
- **Strong HSTS, an HTTPS redirect (308), no public source maps, no exposed files or directory listings, no debug endpoints, and error pages that don't leak internals.** All confirmed by the live scan.
- **The offline emergency card** is a static page whose data stays on the device, and it's cleared on log-out. Push is turned off on that device at log-out too.
- **Privacy and Terms pages** describe what's stored, who processes it (Supabase, Resend, Open Food Facts, push services) and how to delete it.

---

## 1. `/security-review` (AI review of the code changes)

Run on 1 November 2026 against all code changes on the fork's `main` (Phases 1–7, redesign v2, Google login).
Rules: report only findings with confidence of 8/10 or more that could really be exploited, and skip denial of
service, rate limiting and secrets stored on disk.

**Result: no high-confidence vulnerabilities found.**

Areas reviewed:

- **Database migrations (`supabase/migrations/`)**
  - RLS is on for every new table (`scans`, `reactions`, `reminder_settings`, `push_subscriptions`,
    `medication_reminders`), and every policy checks ownership through `profiles.owner_id = auth.uid()`.
  - The `reactions` policies stop a user from linking another user's scan.
  - Column grants mean users can't set their own `unsubscribe_token`, which is always 32 random bytes generated by
    the database. Users can't write `medication_reminders` at all.
  - All SECURITY DEFINER functions use `set search_path = ''`.
  - `due_medication_reminders` and `claim_medication_reminder` can only be run by the service role.
  - `save_push_subscription` requires a signed-in user. The takeover guard means another account can only take a
    device over if it also has that browser's encryption keys.
  - `unsubscribe_email` (allowed for signed-out callers) only changes `email_enabled`, only for a matching
    64-character hex token, and returns only true or false.
- **Edge Functions**
  - `medication-reminders` has Supabase's JWT check off. Instead, it checks the cron secret before anything else,
    with a comparison that doesn't stop at the first difference. Callers without the secret can't reach the test
    options.
  - `send-test-push` validates the caller's JWT and queries with the caller's own token, so RLS applies. CORS `*`
    is harmless here because requests need a bearer token and no cookies are sent automatically.
- **Reminder email:** user-controlled text (medication name and dose) and the URLs are HTML-escaped, and the
  token is URL-encoded.
- **Auth:**
  - `safeNextPath` blocks anything that isn't a local path (`//`, backslashes and control characters are all
    rejected);
  - forwarded sign-in codes only go to this site's own `/auth/callback`, and a code only works in the browser that
    started the sign-in (PKCE).
- **Unsubscribe:** the token's format is checked on the server. Opening the link (GET) only redirects to the
  confirm page; turning email off needs a POST.
- **Push and service worker:** tapping a notification can only open a page on this site. The service worker never
  caches pages or API responses that could hold user data.
- **Server Actions (diary, scan, sign-out):** each checks the session, validates input again on the server and
  relies on RLS. The barcode lookup only calls a fixed Open Food Facts host.
- **General:**
  - no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function`;
  - no hardcoded secrets in the diff, and `.env*` files are git-ignored;
  - the service role key is only used by the Edge Function and the test script.

---

## 2. vibe-check live scanner

Tool: https://github.com/benavlabs/vibe-check (MIT), commit `3afad99`, cloned to `~/tmp/vibe-check`, outside the
project. It was not added to this repo or to `package.json`.

**What the scanner does (checked before running it).**
- `skills/vibe-check/scripts/check.py` is a single Python file that uses only the standard library and makes
  HTTP requests with `urllib`.
- It fetches the page and the scripts and stylesheets it links to on the same host.
- It then probes about 20 well-known sensitive paths (`.env*`, `.git/config`, dumps, keys), 12 folders for
  directory listings, source maps, about 20 debug and API-docs paths, and two random 404 paths.
- From those it checks cookie flags, the security headers (CSP directive by directive, HSTS, X-Frame-Options,
  nosniff, Referrer-Policy), the HTTP-to-HTTPS redirect and CORS (by sending a fake `Origin`).
- **Every request is read-only:** GET by default, one HEAD for a static asset, and OPTIONS only for `--api`
  targets (not used here).
- It never reads our source files, never runs other programs and never sends data anywhere except the URL it's
  given.
- `SKILL.md` only describes how to run it and how to read the results.

Command, run from outside both repos in Python's isolated mode:
`python3 -I ~/tmp/vibe-check/skills/vibe-check/scripts/check.py https://allergy-guard-nine.vercel.app --json`.
Only our own site was scanned; Supabase and other hosts were not.

**Result: 3 fail, 3 warn, 9 pass, 1 info (78 requests).**

| Scanner result | Check | Our ID | Real? |
|---|---|---|---|
| FAIL | Content-Security-Policy is missing | H1 | Real: there's no `headers()` in `next.config.ts` and no `vercel.json` |
| FAIL | No clickjacking protection | H2 | Real |
| FAIL | X-Content-Type-Options is not `nosniff` | H3 | Real |
| WARN | Referrer-Policy missing | H6 | Real but harmless (the browser default is the recommended value) |
| WARN | Static files are missing nosniff and HSTS (`/_next/static/immutable/chunks/…js`) | H4 | Real, low |
| WARN | `X-Powered-By: Next.js` | H5 | Real, low |
| INFO | No cookies on the landing page | A2 | Checked separately: the session cookie only appears after login (see 3.7) |
| PASS | No sensitive files served; no directory listing; no public source maps; strong HSTS; HTTP→HTTPS 308; page and static asset refuse foreign origins (CORS); error pages don't leak internals; no debug or API-docs endpoints | – | – |

**Side effect (V1).** After the scan, Vercel started challenging every request from our network
(`x-vercel-mitigated: challenge`, a 403 page titled "Vercel Security Checkpoint"), including plain `curl` and
headless browsers. Because of that, the post-login cookie check in 3.7 was done by reading the `@supabase/ssr`
defaults instead of the live response.

---

## 3. vibe-check AI audit (all 17 categories)

Done by reading our code on `main` with vibe-check's `AI-CHECKLIST.md` as the guide. The skill was not
installed. The checklist's "implement fixes" steps were skipped because this is a report-only review.

| # | Category | Result | Findings |
|---|---|---|---|
| 1 | SECRETS_EXPOSURE | PASS | G1 (false positive) |
| 2 | DATABASE_ACCESS | PASS | A3 (info) |
| 3 | AUTH_MIDDLEWARE | PASS | – |
| 4 | ACCESS_CONTROL | PASS | – |
| 5 | FRONTEND_SECRETS | PASS | – |
| 6 | SSRF | LOW | A1 |
| 7 | CSRF | PASS (with a note) | A2 |
| 8 | SECURITY_HEADERS | MEDIUM | H1–H6 |
| 9 | CORS | PASS | – |
| 10 | RATE_LIMITING | INFO | A4 |
| 11 | SQL_INJECTION | PASS | – |
| 12 | XSS | PASS | – |
| 13 | PAYMENT_WEBHOOKS | N/A | No payments |
| 14 | FILE_UPLOADS | N/A | No uploads. Phase 5 label photos are read on the phone and never uploaded |
| 15 | ERROR_HANDLING | LOW | H5 |
| 16 | PASSWORD_HASHING | N/A | Supabase Auth hashes passwords. See S1 for leaked password protection |
| 17 | DEPENDENCIES | HIGH | D1–D6 |

### 3.1 SECRETS_EXPOSURE: PASS
- `git ls-files` tracks only `.env.example`, and it holds placeholders.
- `.env*` is git-ignored except `!.env.example`.
- Searching tracked files for `sk_live_`, `AKIA`, `re_…`, JWTs and private keys found nothing.
- `gitleaks git .` checked all 162 commits: 1 hit, G1, a made-up test token.
- The only public variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which are meant
  to be public.
- No `"use client"` file reads `process.env`.
- The live site doesn't serve `.env`, `.git`, dumps or listings (scanner).

### 3.2 DATABASE_ACCESS: PASS
- 9 of 9 tables in `public` have RLS enabled. Every policy is for `authenticated` only, scoped to
  `auth.uid()` through `profiles.owner_id` or `owner_id`, and none use `USING (true)`.
- There are no storage buckets.
- The two-user tests show signed-out requests and another user get 0 rows or 401/403.
- A3: the 6 older tables keep Supabase's default `anon` permissions. With no signed-out policy they return
  nothing, but revoking them would match how the Phase 7 tables were set up.

### 3.3 AUTH_MIDDLEWARE: PASS
- `src/proxy.ts` only refreshes the session; it never grants access.
- Every signed-in page checks `getClaims()` itself, either directly or through `requireDiaryProfile()`, before
  loading data:
  - `/` (shows the dashboard only when signed in);
  - `/profile`, `/scan`, `/scans`, `/scans/[id]`, `/onboarding`;
  - `/diary`, `/diary/new`, `/diary/[id]`, `/diary/[id]/edit`.
- Public on purpose:
  - `/login`, `/signup`, `/privacy`, `/terms`, `/unsubscribe`, `/emergency` (static; its data is on the device),
    `/~offline`;
  - `/auth/callback`, `/auth/confirm`, `/api/unsubscribe`, `/pwa-icon/[size]`, `/serwist/*`.
- Server Actions:
  - `saveReaction` and `deleteReaction` go through `requireDiaryProfile()`;
  - `checkBarcode` calls `getClaims()`;
  - `signOut` only ends the session.
- Edge Functions: `send-test-push` needs a valid JWT; `medication-reminders` needs the cron secret.
- There are no admin routes.

### 3.4 ACCESS_CONTROL: PASS
- Routes that take ids (`/scans/[id]`, `/diary/[id]`, `/diary/[id]/edit`, `?scan=`) check the uuid format, then
  query with the user's own session, so RLS returns nothing for other users' rows and the page shows a 404.
- Updates and deletes (`saveReaction`, `deleteReaction`, profile sections) run as the user, so RLS filters them
  too.
- Ownership is checked in the database, separately from authentication, and the two-user tests confirm it.

### 3.5 FRONTEND_SECRETS: PASS
- There are no secret keys in client code.
- The VAPID public key is read on the server and passed down as a prop.
- Resend and push sending happen only in Edge Functions.
- The live scan found no public source maps.

### 3.6 SSRF: LOW (A1)
- Open Food Facts is fetched from a fixed host (`world.openfoodfacts.org`) with the barcode URL-encoded, so that
  call is safe.
- Push addresses, though, are supplied by the browser and stored with only a `^https://` check. Both Edge
  Functions then POST an encrypted body to them.
- So a signed-in user can make our Edge Function send an HTTPS POST to a host of their choice.
- `send-test-push` reports back whether it was delivered or removed, which lets them probe which hosts respond.
- **What limits it:** HTTPS only, an encrypted body, no response body returned, and it runs on Supabase's edge
  network, not inside our database.
- **Fix:** accept only the known push services in `save_push_subscription()`: `fcm.googleapis.com`,
  `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`, `*.push.apple.com`. This is a
  small migration plus a test.

### 3.7 CSRF: PASS (note A2)
- State changes happen in Server Actions (Next.js checks the `Origin` header against the host), with Supabase
  bearer tokens, or with POST.
- `GET /api/unsubscribe` only redirects. `GET /auth/confirm` and `GET /auth/callback` are the standard one-time
  sign-in links.
- The session cookie (`@supabase/ssr` 0.12.7 defaults) is `SameSite=Lax`, `Path=/`, kept for 400 days,
  **not HttpOnly** (Supabase's browser client needs to read it) and **not marked Secure**.
- **A2:** HSTS and the 308 redirect mean browsers never send it over plain HTTP, so `secure: true` is cheap
  hardening. HttpOnly can't be turned on without breaking the browser client, so the CSP (H1) is the real
  protection against script theft.
- The live post-login check was blocked by V1. To check by hand: DevTools → Application → Cookies after logging
  in.

### 3.8 SECURITY_HEADERS: MEDIUM (H1–H6)
- `next.config.ts` has no `headers()`, and there's no `vercel.json`.
- The live site sends strong HSTS (from Vercel) and nothing else.
- **Suggested header set:**
  - `Content-Security-Policy`, first as Report-Only:
    - `default-src 'self'`;
    - `script-src 'self' 'nonce-…' 'strict-dynamic'`;
    - `connect-src 'self' https://vwnwevrwoitvnsspudqe.supabase.co`;
    - `img-src 'self' data: blob:` (we show no Open Food Facts images);
    - `style-src 'self' 'unsafe-inline'`;
    - `font-src 'self'`;
    - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `poweredByHeader: false`
- Notes for the fix:
  - Next's inline scripts need a nonce, set in `src/proxy.ts`.
  - The camera scanner needs `blob:` media.
  - Google sign-in sends the browser to Supabase and Google, so check `form-action` and redirects carefully.
  - `/emergency` must keep working offline from the service worker.

### 3.9 CORS: PASS
- The live page and static files refuse foreign origins.
- Our code sets no CORS except `send-test-push` (`Access-Control-Allow-Origin: *`). That's acceptable because it
  needs a bearer token and no cookies are involved. It could still be narrowed to our own domains.

### 3.10 RATE_LIMITING: INFO (A4)
- Login, sign-up, password reset and OTP go straight to Supabase Auth, which has its own per-IP and per-email
  limits. The current values are in the dashboard under Auth → Rate Limits.
- App-level actions (`checkBarcode`, `send-test-push`) have no limits, but they only cost the caller's own quota.
  Under the review's rules this is information only.

### 3.11 SQL_INJECTION: PASS
- There's no raw SQL in the app; all queries go through supabase-js.
- No `.or()`, `.filter()` or `.not()` is built from strings.
- SQL functions only use their parameters, with no dynamic SQL.

### 3.12 XSS: PASS
- No `dangerouslySetInnerHTML`, `innerHTML` or `eval`.
- Verdict highlighting returns text segments that React renders, not HTML.
- The reminder email escapes user-controlled text.
- Notification taps can only open paths on our own site (`safeAppPath`).

### 3.13 PAYMENT_WEBHOOKS: N/A. 3.14 FILE_UPLOADS: N/A.

### 3.15 ERROR_HANDLING: LOW (H5)
- Next.js production error pages are generic. The scanner found no stack traces and no debug endpoints.
- `medication-reminders` returns the internal error message in a 500 response, but only to callers that already
  have the cron secret, so that's acceptable.
- H5: remove `X-Powered-By`.

### 3.16 PASSWORD_HASHING: N/A
Supabase Auth hashes passwords with bcrypt. S1 is about checking for leaked passwords, not hashing.

### 3.17 DEPENDENCIES: HIGH (D1)
- All packages are well-known (Next.js, Supabase, Serwist, Dexie, ZXing, React).
- The lock file is committed.
- The Edge Functions pin `npm:web-push@3.6.7` and `npm:@supabase/supabase-js@2.117.1`.
- See section 5 for `npm audit`.

### 3.18 vibe-check `AGENTS.md` rules vs our `CLAUDE.md`

Not copied over our `CLAUDE.md`. Rules we **already have**:
- RLS on every table;
- secrets only in environment variables, never committed;
- only the Supabase URL and anon key in the browser;
- ask before adding a dependency.

Rules we **don't have yet**, and whether to merge them:

| vibe-check rule | Merge? | Why |
|---|---|---|
| Security headers and CSP baseline (and mirror them for static files) | **Yes** | Our biggest gap (H1–H5) |
| No state changes on GET | **Yes** | We follow it (unsubscribe), but it isn't written down |
| Validate all input on the server; client checks are for UX only | **Yes** | We do it (diary and scan actions), but it isn't a rule |
| Generic error messages; no stack traces; no public source maps | **Yes** | We meet it today; worth keeping that way |
| SSRF: allowlist user-supplied URLs | **Yes, narrowed** to "only known push services" | Matches A1 |
| Cookie flags (HttpOnly, Secure, SameSite) | **Yes, adapted** | Supabase needs HttpOnly off; keep `Secure` and `SameSite=Lax` |
| Never reflect CORS origins or use `*` with credentials | **Yes**, short | Cheap to state |
| Verify packages on the registry; commit lock files | **Yes** (lock files we already do) | Fits our "ask before adding a dependency" |
| Pin exact versions | Optional | The lock file already pins them |
| Rate-limit login, sign-up and reset | No (covered) | Supabase Auth does it |
| Stripe webhooks, file uploads, password hashing, Firebase, pickle, Express/helmet, admin roles | No | We don't use them |

Recommendation: keep `CLAUDE.md` short and add a `docs/SECURITY-RULES.md` with the "Yes" rows, linked from one
line in `CLAUDE.md`.

---

## 4. Supabase advisors (read-only, 1 November 2026)

### 4.1 Security Advisor: 4 warnings

| Warning | Severity | Real? | Fix |
|---|---|---|---|
| `anon_security_definer_function_executable`: `public.unsubscribe_email(p_token text)` | Info (S2) | **False positive (intended).** The email unsubscribe link must work without logging in. It only changes `email_enabled` for a matching 64-character token, returns only true or false, and two-user tests showed guessed or malformed tokens change nothing | None. Keep it documented here |
| `authenticated_security_definer_function_executable`: `public.save_push_subscription(…)` | Info (S2) | **Intended.** Users can't insert into `push_subscriptions` directly. The function checks `auth.uid()` and the takeover guard, and is tested | None (A1 adds a push-service allowlist inside it) |
| `authenticated_security_definer_function_executable`: `public.unsubscribe_email(p_token text)` | Info (S2) | Same as the first row | None |
| `auth_leaked_password_protection`: Leaked Password Protection Disabled | Low (S1) | **Real.** Email and password sign-ups can use passwords known to be leaked | Supabase → Auth → Passwords → enable leaked password protection (check plan availability). Optionally require at least 10 characters |

### 4.2 Performance Advisor

**No warnings.**

---

## 5. Dependencies

### 5.1 `npm audit --omit=dev` (production)

9 issues: 1 critical, 6 high, 2 moderate, across 629 dependencies.

| Package | npm severity | Path | Our severity | Fix available? | Notes |
|---|---|---|---|---|---|
| `next` 16.3.6 | **Critical** | direct | **High (D1)** | **Yes:** `next@16.4.3`, not a major version (16.4.1 and later fix everything listed) | See the advisory table below |
| `sharp` 0.35.4 | High | `next` → `sharp` (optional) | Low (D2) | Yes (0.35.5, via `npm audit fix` or the Next upgrade) | librsvg CVE. We don't use `next/image`, Vercel optimises images itself, and `/pwa-icon` uses `next/og` |
| `@serwist/turbopack` | High | direct (build tool) | Low (D3) | **No** | Through `zod` < 4.6.6, `browserslist` ≤ 4.28.6 and `@serwist/build` → `glob` and `minimatch`. All memory or DoS issues in build-time tooling, with our own files as input |
| `@serwist/build` | High | `@serwist/turbopack` → | Low (D3) | Yes (transitive) | As above |
| `zod` < 4.6.6 | High | `@serwist/*` → `zod` | Low (D3) | No (needs Serwist to update) | Memory use on oversized input. Build time only |
| `browserslist` ≤ 4.28.6 | High | `@serwist/turbopack` → | Low (D3) | No | Build time only |
| `source-map-js` 1.2.1 | High | build tooling | Low (D4) | Yes | DoS on crafted source maps. Build time only |
| `glob`, `minimatch` | Moderate | `@serwist/build` → | Low (D3) | Yes | Build time only |

**`next` 16.3.6 advisories, and whether they apply to us:**

| Advisory | Applies? |
|---|---|
| GHSA-673q-mjm6-r5xr: unauthenticated RCE in `use cache` functions returning typed arrays (≤ 16.4.0) | **No.** We don't use `use cache` |
| GHSA-2464-fhr4-w9xw: unauthenticated RCE in the Image Optimization API with SVG files (≤ 16.4.0) | **Unlikely.** We don't use `next/image` and Vercel serves `/_next/image` itself, but the route exists, so upgrade |
| GHSA-p3m5-59mp-jv5r: DoS in App Router Server Actions (≤ 16.4.0) | **Yes.** We use Server Actions (diary, scan, sign-out) |
| GHSA-cjq9-62q9-8jv4: SSRF in Image Optimization (< 16.3.8) | Unlikely (see the SVG row) |
| GHSA-mcj8-r9mp-w47p, GHSA-4jqv-mc3x-m676: SSG/ISR cache poisoning (< 16.3.8) | Low. Our signed-in pages are dynamic, and one advisory is for self-hosted apps only |
| GHSA-f87g-xv8r-7p7x: metadata image route `dynamicParams` bypass (< 16.3.8) | Low. We have `apple-icon` and `/pwa-icon/[size]`, with no private data |
| GHSA-39w2-rjm5-chcv: dev-server MCP endpoint information disclosure (< 16.3.8) | Dev only |
| GHSA-3w37-wq28-93x7, GHSA-h694-7cp9-m8p3: `use cache` and Draft Mode leaks | **No** |

**Fix (D1, small):**
1. `npm install next@16.4.3 eslint-config-next@16.4.3`. 16.4.3 was released on 23 October, so it's 9 days old;
   use 16.4.2 if you'd rather have something older, since it also fixes all of these.
2. Run the tests, lint and build, the 390px and desktop checks, and the offline `/emergency` test, because the
   service worker is rebuilt.
3. Then check on a preview before merging.

### 5.2 `npm audit` (production and dev)

28 issues: 1 critical, 8 high, 19 moderate. That's everything above plus these dev-only packages:

| Package | npm severity | Path | Our severity | Fix available? | Notes |
|---|---|---|---|---|---|
| `undici` 7.29.1 | High | dev tooling | Low (D5) | Yes (7.30.1, `npm audit fix`) | DoS, SRI bypass, TLS option issues. Only in local tools and tests |
| `vite` 8.3.1 (with `launch-editor`) | High | `vitest` → `vite` | Low (D5) | Yes (`npm audit fix`) | Dev-server file access and cross-origin script issues. Only while `vitest` or a dev server runs locally |
| `vitest`, `@vitest/mocker` ≤ 4.1.11 | Moderate | direct dev dependency | Low (D5) | Yes (4.1.12) | Code injection through mock registration on a local dev server |
| `eslint`, `eslint-config-next`, `typescript-eslint` and related plugins | Moderate | dev (lint) | Info | npm suggests `eslint@4` and `eslint-config-next@12`, which **are downgrades: don't apply them** | All through `minimatch` < 11.0.1 (ReDoS on our own glob patterns). Wait for upstream updates |

No high or critical issue in dev-only packages runs in production.

### 5.3 gitleaks (git history)

`gitleaks git . --redact` (v8.30.1) scanned 162 commits, about 1.6 MB: **1 finding, G1, a false positive.**
`src/app/api/unsubscribe/route.test.ts:10`, `const TOKEN = "0123456789abcdef".repeat(4)`, is a made-up 64-hex
test token. No real keys were found.

semgrep isn't installed, so it wasn't run. Install it with `brew install semgrep` if you'd like a pattern scan.

---

## Suggested order for fixes (your choice)

1. **D1** Next.js upgrade (small, removes the only high).
2. **H2, H3, H5, H6** simple headers in `next.config.ts` (small, one change).
3. **H1** CSP: Report-Only first, then enforce (medium).
4. **S1** leaked password protection (small, dashboard).
5. **A1** push-service allowlist (small migration and test).
6. **A2** `secure: true` on the Supabase cookies (small).
7. **D2–D5** `npm audit fix` without `--force` (small), then re-run `npm audit`.
8. **A3** revoke the unused anon permissions (small migration).
9. **V1** check Vercel Firewall settings after the scan.
10. Add `docs/SECURITY-RULES.md` with the recommended vibe-check rules (3.18).

After fixes, re-run the vibe-check scanner and `npm audit` and add before/after counts here.

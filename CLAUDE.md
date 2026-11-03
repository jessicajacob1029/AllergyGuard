# AllergyGuard

Read AGENTS.md for Next.js 16 specific guidance.

A web app (installable PWA) that checks food products against one persistent allergy profile.
Group coursework project with 3 contributors. Each person works on a feature branch and opens a PR to main.

The full build plan lives in `docs/PLAN.md`. Only work on the phase you are asked to work on.

## Stack

- Next.js (App Router), TypeScript (strict), Tailwind CSS
- Supabase: Postgres, Auth, Storage, Edge Functions, pg_cron
- Serwist (service worker) + Dexie (IndexedDB) for offline support
- @zxing/browser for barcode scanning, Tesseract.js for label OCR
- Open Food Facts API for product and ingredient data
- Vitest for tests
- Deployed on Vercel

## Commands

- `npm run dev` start local dev server
- `npm run build` production build (run before every PR)
- `npm run lint` lint
- `npm run test` Vitest

## Structure

- `src/app/` routes and pages
- `src/components/` UI components
- `src/lib/allergen/` allergen matching logic (pure functions, no UI, no network)
- `src/lib/offline/` Dexie database and offline helpers
- `src/lib/supabase/` Supabase clients (browser and server)
- `supabase/migrations/` SQL migrations (every schema change goes here)
- `docs/` plan and notes

## Non-negotiable rules

### Verdicts
- There is exactly ONE matching function: `checkAllergens()` in `src/lib/allergen/`. Barcode and OCR both call it. No input-specific matching logic anywhere else.
- **Unsafe**: any ingredient matches one of the user's recorded allergens, including known synonyms (e.g. whey, casein, ghee = milk). Unsafe is NEVER downgraded to Caution.
- **Caution**: "may contain", "traces of", or shared-facility warnings for a user allergen; OR ingredient data is missing, incomplete, or OCR confidence is low.
- **Safe**: only when ingredient text was actually obtained AND nothing matched. Missing data is never Safe.
- Every verdict shows: a plain-language explanation, which ingredient(s) triggered it, and the raw scanned or extracted text so the user can verify.

### Offline emergency access
- `/emergency` shows allergies, medications, and an emergency contact call button.
- It must be reachable in 3 taps or fewer from any screen (a persistent emergency button in the nav).
- It reads ONLY from IndexedDB (Dexie), never from the network.
- Every profile, medication, or contact save writes to Supabase AND Dexie.
- The call button is a plain `tel:` link.
- Any change touching the service worker, Dexie, or `/emergency` must be tested with DevTools set to Offline before merging.

### Data and security
- Allergy data belongs to a `profiles` row (a person), not directly to an auth user. Each profile has an `owner_id`. This keeps family/caregiver profiles possible later.
- Row Level Security is enabled on every table. Users can only access profiles they own.
- Secrets live only in environment variables. Never commit `.env*` files. The browser only uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The UI shows a short disclaimer during onboarding: AllergyGuard is an aid, not medical advice; always read the label.
- Follow `docs/SECURITY-RULES.md` for headers, CSP, input, URLs, errors and dependencies.

## Working style

- One phase at a time. Do not start the next phase unless asked.
- For any change touching more than 3 files, show a plan first and wait for approval.
- Small commits with clear messages.
- Every function in `src/lib/allergen/` has Vitest tests.
- Ask before adding a new dependency, and say why it is needed.
- Mobile-first layouts; the app is mostly used on phones in shops.
- Keep this file short. Put detailed notes in `docs/`.

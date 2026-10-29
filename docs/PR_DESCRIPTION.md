## AllergyGuard: Phases 1 to 8

Builds the rest of PLAN.md on `feature/full-build`, on top of US-01 (#5). Each phase has its own section below, added as the phase is finished.

---

## Phase 1: Login, onboarding and profile editing (US-02, US-07, US-03, US-09)

A user can log in and out, set up a profile in a resumable onboarding wizard, and edit it later from `/profile`.

### What's included

- **US-02 Log in / log out:** `/login` page and a `signOut` Server Action. Login errors never reveal whether an email is registered.
- **US-07 AllergenPicker:** reusable picker for the 10 listed allergens plus custom ones, each with an optional severity. A test keeps the codes in sync with the database enum.
- **US-03 Onboarding wizard:** disclaimer, name, allergens (at least one), emergency contact (can be skipped with "Add later"), then medications. It resumes at the first unfinished step. Home shows a reminder until a contact is added.
- **US-09 Edit profile:** `/profile` with separately saved sections for name, allergies, contacts (add, edit, delete, make primary) and medications. The contact and medication editors are shared with onboarding.

### Database (2 new migrations, already applied to the shared project; don't re-run them)

- `20260925000000_onboarding_progress`: `disclaimer_accepted_at`, `onboarding_step` (0–6) and `onboarding_completed_at` on `profiles`.
- `20260925010000_contact_functions`:
  - `set_primary_contact(contact_id)` switches the primary contact in one transaction.
  - `delete_contact(contact_id)` deletes a contact. If it was the primary, it promotes the oldest remaining contact and returns its id, otherwise null.
  - Both run as `security invoker` with an empty `search_path`, so RLS applies.
  - Both can be executed only by `authenticated`.
  - Both lock the profile row, so simultaneous changes run in order.

After pulling, `npx supabase migration list` should show both migrations as applied on the remote.

### New dev dependencies

`@testing-library/react`, `@testing-library/user-event` and `jsdom`, for component tests.

### Testing

- Lint clean, 174 Vitest tests passing (unit and component), production build succeeds.
- **Run by hand in a local Postgres (not in `npm run test`):** switching the primary, repeating a switch, deleting a non-primary, deleting the primary with others left, deleting the last contact, another user's contact, a missing id, and `anon` access.
- **Remote:** `anon` can't execute either function, and calling the RPC with only the public key returns 401.
- **End to end against the Supabase project at phone width:**
  - Login, the full onboarding flow, and resuming after a page reload.
  - Contact add, edit and make primary; deleting the primary (with promotion) and the last contact.
  - Profile edits, banner navigation and logout.
  - No console errors, and test users were removed afterwards.
- **Remote two-user RLS test (2026-10-03):** two real users signed in through Supabase Auth and used the REST API, like the app does. User B got 0 rows when listing or reading user A's profile, allergens, contacts and medications by id. B's inserts into A's profile, and a profile with `owner_id` set to A, were rejected by RLS. B's updates and deletes affected 0 rows, and both contact functions returned "contact not found". Signed-out requests saw nothing and couldn't call `delete_contact`. A's data was unchanged afterwards. 38 of 38 checks passed. A real user's profile was in the database during the test and was never visible to B or to signed-out requests. Test users were deleted afterwards.
- **Real signup (2026-10-03):** a new account signed up at `/signup`, confirmed through the emailed link, and finished onboarding. Verified with SQL: email confirmed, one profile at onboarding step 6 with the disclaimer recorded, one allergen (custom), one primary contact, one medication.

### Phase 1 "Done when"

- [x] New user can sign up (with real email confirmation) and create a profile with allergens
- [x] A second user cannot read the first user's data (verified on the remote project)

---

## Phase 2: Offline emergency card

`/emergency` shows the user's allergies, medications and emergency contacts with no network at all, including after the page is reloaded offline. The app can be installed to the home screen.

### What's included

- **`/emergency`** is a static page. Its data comes only from IndexedDB (Dexie), never from the network.
  - Allergies are listed severe first, and expired medications are flagged.
  - A large `tel:` button calls the primary contact; the other contacts are listed below it.
  - "Last updated" shows when the card was last synced, and a link leads back to home.
- **Emergency button** in the header of every page, signed in or not. It's a plain `<a>` (a full page load), so the service worker can answer it offline.
- **Dexie mirror** (`src/lib/offline/`): one snapshot per profile, replaced whole on every sync.
  - Every successful save in `save.ts` re-reads the profile from Supabase and writes the snapshot. The write happens in the shared `attempt()` wrapper, so no save path can skip it.
  - Signed-in pages also sync once per page load, which covers accounts created before Phase 2.
  - A failed sync never turns a save into an error.
  - Cards belonging to another user are dropped on the next sync.
- **Clearing:** only an explicit **Log out** clears the card. An expired session, a failed token refresh or being offline leaves it in place.
- **Service worker** (Serwist, `@serwist/turbopack`):
  - Precaches `/emergency`, `/~offline` and the build's static files.
  - Every other page is network-only, falling back to `/~offline` (one tap to the card).
  - Signed-in HTML and RSC payloads are never cached, so there is no cached user content to clear on sign-out.
  - Off in `npm run dev`.
- **Storage protection:** `navigator.storage.persist()` is requested after the first card is written.
  - On iPhone/iPad a dismissible "Add to Home Screen" hint is shown. Safari can delete storage for sites unused for about a week, and Home Screen apps are exempt.
- **Installable:** `manifest.ts` (standalone, with an "Emergency card" shortcut), 192/512 icons and a 180px Apple icon generated with `next/og`, and `appleWebApp` metadata.

### Structure change

- All pages with the header moved into `src/app/(main)/`. URLs are unchanged.
- The root layout no longer reads auth cookies, so `/emergency` can be built as a static page.

### New dependencies

- `serwist`, `@serwist/turbopack`, `dexie`; dev: `esbuild`, `fake-indexeddb`.
- `npm audit`: `@serwist/turbopack` pins `browserslist` 4.28.6, which has two advisories. It runs only at build time (bundling `sw.js`) on our own config. The other 5 high findings were already there, in the `eslint-config-next` chain.

### Phone numbers must include a country code (migration `20261004000000_phone_country_code`, already applied; don't re-run it)

- A phone must start with `+` and a country code (not starting with 0), then digits, spaces, dots or hyphens, with 7–15 digits.
- Brackets are rejected: "+44 (0)20 …" would dial +44020…, which doesn't connect.
- Same rule in `validatePhone()` and the database check. The migration re-validated existing rows; one old contact without a country code was fixed by hand before it was applied.
- Empty phone fields in onboarding and `/profile` start with `+91 `, with a hint under the field.
- Every call link (emergency card and `/profile`) uses `telHref()`, which keeps only `+` and digits. The displayed number keeps its spaces.

### Testing

- Lint clean, 213 Vitest tests passing, production build succeeds. New tests cover:
  - Dexie sync: full replace, other-user cleanup, no session or no network keeps the card, persist request.
  - The save → mirror hook.
  - `tel:` links (only `+` and digits) and allergy order on the card.
  - The country-code phone rule and the `+91 ` prefill in onboarding and `/profile`.
  - The iOS hint rules.
  - The `/emergency` view with a Dexie test double.
- **Offline, `next start` + Chromium at 390px:**
  - The service worker precaches `/emergency` and `/~offline` only (no page or RSC caches).
  - With the network off, reloading `/emergency` shows the card from IndexedDB with working `tel:` links.
  - `/` and `/profile` fall back to `/~offline`, and its button opens the card.
- **Chrome installability check** (`Page.getInstallabilityErrors`): no errors.
- **Real iPhone** (installed to the Home Screen through a `cloudflared` tunnel): see "Done when" below.

### Phase 2 "Done when"

- [x] With the network offline, reloading `/emergency` still shows all data. Note: Chrome's *hard* reload (Shift+Reload / Ctrl+Shift+R) skips the service worker for that request by design, so test with a normal reload, or by closing and reopening the tab.
- [x] Emergency page is 1 tap from every screen
- [x] App installs to the home screen on **iPhone** (2026-10-04, via a `cloudflared` tunnel). Also passed on the iPhone: the offline card in Airplane mode, the call button opening the dialer with the right number, an edit syncing to the card with an updated "Last updated", and Log out clearing the card.
- [ ] App installs to the home screen on **Android: untested** (no Android phone available). Chrome's desktop installability check passes, but install and offline use haven't been tried on an Android device.

## Phase 3: Allergen matching engine

`checkAllergens(text, allergens, options?)` in `src/lib/allergen/check.ts` is the one matching function. Barcode (Phase 4) and OCR (Phase 5) will both call it. It is pure: no UI, no network.

### What's included

- **Result:** `{ verdict, explanation, matches, warnings, rawText }`.
  - Each match gives the user's allergen, the matched term and the exact original text, so the UI can highlight it.
  - `rawText` is returned unchanged.
- **Unsafe:** any ingredient matching a user allergen or one of its synonyms (`synonyms.ts`, e.g. milk: whey, casein, ghee, paneer).
  - Nothing downgrades it. A may-contain, low OCR confidence or incomplete data is reported next to it, but the verdict stays Unsafe.
- **Caution** when any of these applies:
  - **May contain:** "may contain", "traces of", "not suitable for", or "made/packed in a factory / on equipment / on a line…". Only the words after the phrase, up to the end of the sentence or line, count as may-contain. "Made with milk in a factory that handles nuts" still flags milk as an ingredient.
  - **Ambiguous term with no stated source:** lecithin / E322 / INS 322 / "Emulsifiers (322)" for soy, bare "flour" for wheat, hydrolysed vegetable protein for soy *and* wheat. A stated source settles it either way: "soy lecithin" or "flour (wheat)" is Unsafe, while "sunflower lecithin (E322)" or "rice flour" is not flagged.
  - **Free-from claim:** "dairy-free", "dairy & gluten free", "free from milk, egg and gluten", "no milk", "without nuts", "contains no peanuts", "non-dairy", "eggless". A claim is never proof, and a real ingredient elsewhere still gives Unsafe ("Lactose-free milk", "Non-dairy creamer (… sodium caseinate)").
  - **Doubtful input:** missing or empty text, `incomplete: true`, `ocrConfidence` below `minOcrConfidence` (0–100, default 70; NaN counts as low), or no allergens in the profile.
- **Safe** only when text was obtained and none of the above applies.
- **Custom allergens** are matched as literal text (plurals included, regex characters escaped) and through the synonym list. A custom "whey" or "dairy" catches milk and casein.
- **Indian label terms** (Unsafe):
  - wheat: maida, atta, sooji/suji, rava, dalia. "Rice rava" and "idli rava" are not wheat; besan / gram flour is not wheat;
  - milk: ghee, paneer, khoa/khoya, curd, dahi, malai, chhena;
  - tree nuts: kaju, badam, pista, akhrot;
  - peanut: moongphali.
- **More Caution cases:**
  - bare "nuts" for peanut ("The label says “nuts”; this may include peanuts.");
  - Worcestershire sauce for fish, unless the label shows it's anchovy-free;
  - hing / asafoetida for wheat, unless rice is the stated base.

  A named source settles each one: "cashew nuts" is not flagged for peanut, while "asafoetida (wheat flour)" is Unsafe.
- **False positives avoided** with whole-word matching and exclusion phrases:
  - "eggplant", "nutmeg", "coconut" and "buckwheat" don't match;
  - "cocoa butter", "coconut milk" and "cream of tartar" are not milk;
  - "peanut butter" is peanut, not milk.
- **Text clean-up** (`text.ts`):
  - Open Food Facts' `_milk_` underscores (which hide words from `\b`) become spaces;
  - accents and ligatures are removed;
  - words split across OCR lines with a hyphen are rejoined;
  - a map back to the original text is kept.
- **Picker:** adding a custom synonym such as "dairy" shows "Did you mean Milk?" with **Use Milk instead** (swaps it in place, keeping the severity) or **Keep dairy**.

### New dependencies

None.

### Testing

- `npm run test`: 408 tests. They include `check.test.ts`, which covers every case listed in "Done when" plus claims, ambiguous terms, exclusions, OCR confidence and custom allergens, along with `synonyms.test.ts` and `text.test.ts`.
- `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.

### Phase 3 "Done when"

- [x] Vitest cases cover direct match (Unsafe), synonym match (Unsafe), may-contain (Caution), empty or missing text (Caution), clean text (Safe), and "Unsafe never downgraded" when both a match and a may-contain exist.

## Frontend redesign

Every screen restyled after the Figma prototype (`design/figma-reference/`, style reference only). Features, flows, data and copy are unchanged.

### What's included

- **Design tokens** in `globals.css`: colours, radius, shadows and font, each with a light and a dark value, exposed to Tailwind (`bg-primary`, `text-ink`, …). No `dark:` classes remain. Every text colour pair is at least 4.5:1; several prototype colours failed and were darkened.
- **Nunito** via `next/font/google` (self-hosted at build time, no npm dependency). Serwist's default precache globs left out `woff2`, so `serwist/[path]/route.ts` now adds it. `/emergency` renders in Nunito offline.
- **Shared components** in `src/components/ui/`: app bar, header band, section card, pill, field icons, password show/hide button, bottom tabs and inline SVG icons (no icon library).
- **Emergency button** is a plain `<a href="/emergency">` in the app bar on every screen and a home tile.
- **Unbuilt features** never link anywhere:
  - Scan and Diary tabs, and the Diary and Medication tiles, say "Coming soon";
  - Restaurants and Travel are hidden.
- **Log out** moved from the top bar to the bottom of `/profile`, so a mis-tap next to Emergency can't wipe the offline card.
- **Tap targets** are at least 44px: the `/profile` phone links were 19px tall and are now 44px.
- **PWA icon:** white shield on purple; `theme_color` changed to `#6d3fe0`.

### Testing

- `npm run test`: 423 tests, including new tests for the bottom tabs, app bar, password toggle, pills and the home dashboard. `npm run lint`, `tsc` and `npm run build` pass.
- Every screen checked in Chromium at 390px (and 320px for the profile and picker), in light and dark mode.
- Offline, on a production build: `/emergency` shows the card, `tel:` link and Nunito with the network off; other pages fall back to `/~offline`.
- **Not yet done:** a click-through of the signed-in screens with a real login; they were checked with sample data.

## Phase 4: Barcode scanning

Scan a barcode (or type it), look the product up on Open Food Facts, check it with `checkAllergens()` and show the verdict.

### What's included

- **`/scan`:**
  - rear camera via `@zxing/browser`, loaded only when the camera starts;
  - manual barcode entry;
  - messages for a blocked or missing camera and for being offline;
  - Cancel while the camera starts.

  Barcodes are checked locally (length and check digit) before any lookup, so a misread never reaches OFF.
- **Server Function `checkBarcode`:**
  1. looks the product up on OFF from the server (identifying User-Agent, 8-second timeout);
  2. checks it;
  3. saves a `scans` row;
  4. opens `/scans/[id]`.

  If OFF can't be reached, it shows an error with Try again and saves nothing.
- **Verdict screen** (`src/components/verdict/`, reused in Phase 5):
  - the verdict word and an icon;
  - product card;
  - explanation;
  - "what triggered it" pills;
  - the raw ingredient text with matches highlighted (`<mark>`, solid or dotted underline, so not colour alone);
  - check time, OFF attribution (ODbL) and the disclaimer.
- **Product data:**
  - English ingredient text is preferred;
  - non-English text, unreadable tags or "ingredients to be completed" mark the data incomplete, so it is never Safe;
  - a product that isn't found is Caution.
- **`checkAllergens()` additions, all with tests:**
  - an optional `declared` input for the product's allergen and trace tags: declared allergen → Unsafe, declared trace → Caution;
  - a declared allergen that is missing from the text marks the text incomplete → Caution;
  - matches carry their position for highlighting.
- **Migration `20261026000000_scans.sql`:** `scans` table and `scan_verdict` enum, RLS through `profiles`, with select/insert/delete only (results are never edited). **Already applied** to the shared project as version `20261026000000` (2026-10-27); don't re-run it.
- The Scan tab and the home "Start scanning" button now link to `/scan`.

### New dependencies

`@zxing/browser` 0.2.1 (MIT) and its peer `@zxing/library` 0.23.0 (Apache-2.0). They decode barcodes in JavaScript because iPhone Safari has no BarcodeDetector. The chunk is about 120 KB gzipped and loads only when the camera starts.

### Testing

- `npm run test`: 506 tests, covering:
  - barcode validation;
  - OFF parsing (fixtures from the live API);
  - the scan record and its enum checked against the migration;
  - the declared-allergen rules;
  - highlighting;
  - the verdict screen;
  - manual entry, error and retry in the scanner;
  - the `/auth/confirm` route.
- Live OFF lookups run through the real code: Nutella → Unsafe for milk (from its allergen tags), Caution for peanut and egg.
- Live check against a real profile (kiwi) and a milk + peanut + wheat profile:

  | Product | Kiwi | Milk + peanut + wheat |
  |---|---|---|
  | Nutella | Caution (allergen tags not in the text, so the text is incomplete) | Unsafe |
  | Maggi Masala noodles | Safe | Unsafe (wheat, "Hydrolyzed peanut protein") |
  | Amul butter | Safe | Unsafe |
  | Yippee noodles (no ingredients on OFF) | Caution | Caution |
  | Parle-G (not on OFF) | Caution | Caution |
- `/scan` and the verdict screens checked at 390px with sample data, including the blocked-camera message.
- **On the deployed site** (`allergy-guard-nine.vercel.app`, 2026-10-28):
  - iPhone camera scan of a Nutella jar (`3017624010701`) gave Safe for a kiwi-only profile (its text lists hazelnuts, so the declared "nuts" is accounted for);
  - Nutella (`3017620422003`) and Maggi typed in on the laptop gave Caution and Safe, and reloading `/scans/[id]` showed the same saved result;
  - all three rows were confirmed in the `scans` table.

### Fixes found while deploying

- **Email confirmation:** `/auth/confirm` also accepts Supabase's default `?code=` link. Before this, new users who used it were confirmed but never signed in.
- **Explanation wording:** the same word in different case ("wheat", "Wheat") is named once.
- **Diary tab label** was cut off on the iPhone ("Diarv"): the Soon badge wrapped under the label and covered it. The badge now sits on the icon's corner, and the label never wraps (checked at 390px and 320px, with a test).
- `origin/main` (Jenkins and Docker files) merged in; no conflicts.

### Phase 4 "Done when"

- [x] Scanning a real product on a phone (via the Vercel URL) shows a verdict (iPhone, 2026-10-28)
- [x] A product not found on Open Food Facts shows Caution with a clear message, never Safe (tested in code, on the verdict screen and with live OFF data)

---

## Phase 6: Reaction diary

Log allergic reactions and look back at them: what you ate, when, the symptoms, how bad it was and what you took.

### What's included

- **`/diary`:** your reactions, newest first. Each card has a date pill, severity dots with the word next to them
  (Mild, Moderate, Severe, so not colour alone) and symptom pills. Empty state and **+ Add reaction**.
- **`/diary/new` and `/diary/[id]/edit`:** one form with:
  - date and time (defaults to now in the phone's time zone);
  - food or product;
  - symptom chips: Hives or rash, Itching, Swelling, Lips or throat swelling, Breathing trouble, Vomiting,
    Stomach pain, Dizziness or fainting, Other;
  - severity (Mild, Moderate, Severe);
  - optional treatment: None, Antihistamine, EpiPen (adrenaline), Hospital or ER (can be cleared);
  - optional notes.

  Errors are shown per field and focus moves to the first one. Save is disabled offline.
- **`/diary/[id]`:** everything about one reaction, with Edit and Delete. Delete asks in the page first
  ("Delete this reaction? This can't be undone." / Yes, delete it / Keep it).
- **From a scan:** the scan result has **Log a reaction to this**, which opens the form with the product name and
  a link to the scan. The reaction page links back to the scan.
- The Diary tab and the Home Diary tile are now live. Medication stays "Coming soon".
- The diary is online only. The service worker, Dexie and `/emergency` are unchanged.

### Rules (`src/lib/diary/`, pure functions with tests)

- `validateReaction()` runs in the form for instant feedback and again in the Server Actions.
- `validateOccurredAt()`: up to 10 minutes in the future is allowed for phone clock drift; later is
  "That time is in the future."; before 1900 is "Please enter a date from 1900 onwards."
- The time is converted to a full ISO timestamp on the phone, and dates are drawn on the phone, because the
  server runs in UTC (in India a reaction at 01:30 would otherwise show on the day before).

### Database (1 new migration, already applied to the shared project; don't re-run it)

- `20261029000000_reactions`: `reactions` table with `reaction_symptom` and `reaction_treatment` enums; severity
  reuses `allergen_severity`. `scan_id` is optional and set to null if the scan is deleted.
- RLS through `profiles` for select, insert, update and delete. Insert and update also require a linked scan to
  belong to the same profile, so another user's scan id can't be attached.
- Checks: at least one symptom, food 1–200 characters, notes up to 2000, no date before 1900.

### Also fixed

- The scan result's "Checked against your allergies on …" time was formatted on the server (UTC), so it was
  5½ hours behind in India. It is now drawn on the phone (`LocalTime`).

### Testing

- `npm run test`: 546 tests, including the diary rules, enums checked against the migration, the card, the form
  (validation, saving, editing, from a scan, clearing the treatment) and the delete confirm.
- QA on a production build against the shared project at 390px, in India time: add, errors, a future time,
  edit, from a scan, another user's ids (404), offline, links, delete confirm, light and dark mode.
- Phone test on the preview: logged a reaction from a camera scan, times in IST, edit and delete work.

### Phase 6 "Done when"

- [x] A user can log, view, edit, and delete reactions
- [ ] RLS enforced: the policies are in place, and ids that aren't yours give "Page not found" (a foreign scan id
  in `?scan=` is ignored), but a two-user test like Phase 1's hasn't been run yet

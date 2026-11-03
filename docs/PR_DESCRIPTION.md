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

## Phase 5: Ingredient label photo

Take (or choose) a photo of an ingredients list. Tesseract.js reads it **on the phone**, the user checks and edits the text, then the same `checkAllergens()` and `VerdictView` as barcodes give the verdict.

### What's included

- **`/scan/label`**: capture tips (good light, label flat, fill the frame, hold still, English only), **Take photo** (opens the rear camera: `capture="environment"`) and **Choose from photos**. The `/scan` page links to it ("No barcode?").
- **Review step, always shown**: the photo preview, the extracted text in an editable box, **Retake photo**, **Check ingredients**. Wrapped lines are rejoined first with `joinOcrLines()` (written by Jessica): it joins only lines that clearly continue, so a wrapped "May contain traces of⏎peanuts" is Caution, while "May contain nuts⏎milk" stays Unsafe for milk.
- **Low confidence**: the confidence passed to `checkAllergens()` is the **lowest line confidence**, not the page average (one unreadable line can hide an allergen). Below 70: a plain message ("Parts of this label weren't read clearly… Your result will be Caution, not Safe.") with the unclear lines listed. The confidence still counts after the user edits the text (decision: editing can't turn a doubtful read into Safe).
- **Hindi**: English OCR only. With the English model, Devanagari comes out as nonsense Latin letters with very low line confidence (17–29 in tests), so a bilingual or Hindi label is always Caution and the message names Hindi. Hindi typed into the box counts as incomplete (Caution). An allergen printed only in Hindi can't be detected; the "always read the label" disclaimer covers it.
- **Privacy**: the photo is decoded, shrunk (longest side 2000 px, greyscale) and read in the browser. It is never uploaded or stored; the Server Action accepts only `{ text, ocrText, ocrConfidence }` and rejects anything else (tested). Saved with the scan: the checked text, the OCR text and the confidence.
- **Self-hosted OCR files**: `scripts/copy-tesseract.mjs` (runs before `dev` and `build`) copies the worker, the WASM engine and the English data from `node_modules` to `public/tesseract/` (git-ignored). They are left out of the service-worker precache (`globIgnores`), so installing the app doesn't download ~15 MB. Tesseract caches the language data in IndexedDB after the first photo.
- **Result page**: photo scans show "Text read from your photo", no product card or Open Food Facts credit, and the text as first read when the user edited it. Rows are still snapshots.
- **Migration `20261028000000_label_scans.sql`**: `input` allows `'photo'`; `barcode` nullable; `ocr_text` and `ocr_confidence` columns; a check that barcode rows have a barcode and no OCR fields and photo rows the reverse. RLS unchanged.
- **Fix (Phase 3 text clean-up)**: "Milk-⏎free" split across lines was rejoined to "milkfree" and missed as a free-from claim (Safe instead of Caution). The hyphen before "free" is now kept, in `normalizeIngredientText()` and `joinOcrLines()`.

### New dependencies

- `tesseract.js` 7.0.0 (Apache-2.0): OCR in the browser (WebAssembly in a Web Worker).
- `@tesseract.js-data/eng` 1.0.0: the English model (`best_int`), so it can be served from our own site instead of the jsdelivr CDN.
- First photo downloads about 4.4 MB (worker 32 KB, engine 1.4 MB, English data 2.9 MB, gzipped); later photos almost nothing.

### Testing

- `joinOcrLines()`: join/keep rules, plus **every Unsafe call the Phase 3 and 4 test suites make to `checkAllergens()`** (94 cases, recorded by wrapping the function during a test run) and the Phase 4 Open Food Facts products run through it: none gets weaker.
- **Same verdict via barcode and photo**: real Tesseract output (fixtures) for labels printed with the exact Open Food Facts text of Maggi, Amul and Nutella, checked against the barcode path for six profiles.
- `summarizeOcr()` and `checkLabelText()` with real line confidences (clear, blurred, bilingual, Hindi-only); input validation (no image, no extra fields, confidence 0–100, length).
- `LabelCapture` component tests (tips, offline, joined text, edits, low-confidence message, only text sent, Retake, Cancel, errors).
- In Chromium (production build): OCR from the self-hosted files works (about 1.2 s a photo), **no requests to other sites and no uploads**; the language file is fetched once. Service worker precache: 57 entries, none from `public/tesseract/`. Offline: `/emergency` still loads, `/scan/label` shows "You're offline". Layout at 390px (start and review screens), no horizontal scroll.

### Second round after the first iPhone test

The first test read the whole photo: the ingredients came out well, but the rest of the pack added junk lines, so
results were always Caution. Added: a **crop step** (full-size crop, shrink only above 4000 px / 8 MP, enlarged
re-read under 20 px lines), **sharpen** before OCR, an opt-in **Boost** (adaptive threshold) for faded or shiny
labels, **`|` tidying** before `joinOcrLines()`, **Paste text instead** (judged on the text alone; migration
`20261028010000_paste_scans.sql`), and an EXIF rotation safeguard. Choices were measured with
`scripts/measure-ocr.mjs` (table in `docs/PROGRESS.md`). A preview-only debug panel is still in and is removed
before this merges.

### Phase 5 "Done when"

- [x] The same ingredients give the same verdict via barcode and via photo (tests on real OCR output)
- [x] Raw extracted text is always shown (review box, and on the result page)
- [ ] Label photo checked on the iPhone (Vercel preview of `phase-5`)

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
- After merging, a read-only check on `allergy-guard-nine.vercel.app` at 390px: list, reaction page, edit,
  validation messages, logging from a scan, another user's id (404), scan time in IST.
- **Remote two-user RLS test (2026-10-29):** two temporary users signed in through Supabase Auth and used the
  REST API, like the app does. User B saw only its own reaction and got 0 rows when reading user A's reaction by
  id, by A's profile or by A's scan, or reading A's scan. B's edits and deletes of A's reactions affected 0 rows.
  Adding a reaction to A's profile, linking B's reaction to A's scan (on insert and on update) and moving B's
  reaction into A's profile were rejected by RLS. Signed-out requests saw nothing and changed nothing. A's
  reaction was unchanged afterwards. 23 of 23 checks passed. The test users were deleted afterwards, and the row
  counts matched those from before the test.
- iPhone test on `allergy-guard-nine.vercel.app`: deleted both QA reactions ("Yes, delete it"), logged a reaction
  from a camera scan (product filled in, saved, time in IST), then deleted it. The diary was empty afterwards.

### Phase 6 "Done when" (closed 2026-10-29)

- [x] A user can log, view, edit, and delete reactions
- [x] RLS enforced (two-user test, 23 of 23 checks passed)

---

## Redesign v2, Google login and desktop layout

A new look across the app, sign-in with Google, and a proper laptop layout. Features, data and allergen rules are unchanged.

### What's included

- **Redesign v2:** style taken from our Figma Make file (reference in `design/figma-reference-v2/`, notes in `STYLE-v2.md`):
  - DM Sans and Space Mono, self-hosted through `next/font` and precached for offline use;
  - glass cards, soft peach, lilac and mint gradients, dark primary buttons, a floating bottom tab bar;
  - light only for now (dark mode is a later task).

  The Emergency button behaves exactly as before: a plain link to `/emergency`, top right, solid red.
- **Scan history (`/scans`):** every scan, newest first, filtered by All, Safe, Caution or Unsafe. Home shows the latest three. Rows are named by `scanLabel()` (`src/lib/products/scan-label.ts`, with tests).
- **Continue with Google** on Log in and Sign up, above the email form:
  - `/auth/callback` exchanges the code for a session (PKCE);
  - new users go to onboarding, and the name step starts with their Google name;
  - a cancelled or failed sign-in returns to Log in with a short message;
  - if a sign-in code lands on any other page, the proxy forwards it to `/auth/callback`.

  A Google sign-in with the same email as an existing account joins that account and keeps its profile.
- **Desktop layout from 900px:**
  - the header shows Home, Scan, Diary and Profile in the middle, and the bottom bar is phones only;
  - each page has one column width: 1120px for Home and Profile, 760px for lists (the Diary is 2 columns), 640px for forms, details and `/emergency`;
  - Home is a grid: the scan card beside Your allergies, Latest scans below;
  - Profile is two columns, with emergency contacts on the right.

  The phone layout is unchanged.

### Setup

- No new dependencies and no database changes.
- Supabase Auth (done in the dashboard): Google provider on, and redirect URLs for production, Vercel previews and `localhost:3000`. The Site URL should be the production URL.

### Testing

- `npm run test`: 591 tests, including Google login (callback route, redirect helpers, button, proxy forwarding), scan history and `scanLabel()`.
- `npm run lint` and `npm run build` pass.
- Layout checked at 1440, 1280, 1024, 960, 900, 899, 768, 390 and 320px: no sideways scrolling, and the nav switches exactly at 900px.
- axe-core (WCAG 2.2 AA): 0 violations on every screen checked.
- `/emergency` checked with the network fully cut (service worker included), on laptop and phone widths.
- **Production check after the merge** (`allergy-guard-nine.vercel.app`, test account), all passed:
  - landing page;
  - Continue with Google up to Google's sign-in page, returning to our `/auth/callback`;
  - email login;
  - Home on laptop and phone;
  - a typed barcode scan;
  - Diary and Profile;
  - the offline emergency card.

### Still to test

- [ ] A full Google sign-in on iPhone Safari and from the Home Screen app.

---

## Privacy and Terms pages

Two short public pages in plain English, styled like the rest of the app.

### What's included

- **`/privacy`:**
  - what we store (name, email, allergies, emergency contacts, medications, scans, reactions);
  - it's stored in Supabase, and no other user can see it;
  - what Google sign-in shares and what we use (name and email only);
  - barcodes are looked up on Open Food Facts from our server, so Open Food Facts never sees who you are;
  - label photos, marked **coming soon** until Phase 5 is merged;
  - the emergency card stays on your device until you log out;
  - how to delete your account (by email for now).
- **`/terms`:**
  - the app is an aid, not medical advice: always read the label;
  - product data can be wrong, and the app shows Caution when unsure;
  - in an emergency, call 112;
  - your account;
  - no guarantees.
- Both pages are linked from the landing page footer and under **Create account** on Sign up.
- The contact email and the "Last updated" date are set in `src/lib/constants.ts`.

### Testing

- `legal-pages.test.tsx`: each page's sections, the email link, the medical disclaimer, and both links on the landing page and Sign up.
- Checked at 1440, 390 and 320px on a production build and on production: no sideways scrolling, and axe found 0 accessibility problems.

### When Phase 5 is merged

- [ ] Update the "Label photos (coming soon)" section and the "Last updated" date.

---

## Phase 7: Medication expiry reminders

Reminders 30, 7 and 1 days before a medication expires, and on the expiry day, by push notification or email.
They're sent every morning at 08:00 IST.

### What's included

- **When:** 8–30 days left → the 30-day reminder; 2–7 → 7-day; 1 → 1-day; 0 → "expires today". Days are counted
  on India (IST) calendar dates, not UTC.
  - A medication added late still gets one reminder.
  - Medications without an expiry date are skipped.
  - `reminderStage()` in `supabase/functions/_shared/reminder-stage.ts` decides which reminder is due (written by Jessica).
- **Never twice, but retried if nothing arrived:**
  - A reminder counts as sent only when push or email actually delivered it.
  - If every channel failed, the error is recorded and the next day's run tries again while that reminder's window lasts.
  - Claiming a reminder is one atomic database statement, so two runs can't both send it.
- **Push:** Profile → Reminders → **Turn on notifications**. Permission is only asked after that tap, never on
  page load.
  - There's a **Send a test notification** button.
  - Push subscriptions the push service reports as gone (404/410) are deleted.
  - Logging out turns push off on that device.
  - "Turn on notifications" gives up after 15 seconds with "Notifications aren't available here right now. Email reminders still work."
  - On iPhone, push only works in the Home Screen app (iOS 16.4+); in Safari the card explains how to install it.
- **Email (Resend):** sent when push is off or didn't reach any device.
  - Content: the medication, its dose and expiry date, a link to update it, and the "aid, not medical advice" line.
  - Every email has a **Turn off email reminders** link. It opens `/unsubscribe`, which needs no login and has a confirm button.
  - Gmail's own one-click Unsubscribe button works too (`/api/unsubscribe`).
  - Email reminders are on by default.
- **Home:** a red banner when a medication has expired, amber when it expires within 30 days. The Medication
  shortcut now opens the medications in Profile.
- **Privacy page:** a new "Medication reminders" section.

### Database (3 migrations, already applied to the shared project; don't re-run them)

- `20261031173904_medication_reminders`: three new tables, all with RLS:
  - `reminder_settings`: per account; email on and push off by default; a 64-character random unsubscribe token.
  - `push_subscriptions`: one row per browser.
  - `medication_reminders`: one row per medication, expiry date and reminder, so a reminder can't be sent twice.

  Also switches on `pg_cron` and `pg_net`.
- `20261101000000_reminder_retry`: adds delivery status (sending / delivered / failed) and attempts, and
  `claim_medication_reminder()`.
- `20261101010000_push_takeover_guard`: another account can only take over a device's push subscription if it
  also has that browser's encryption keys (found by the two-user test).
- Functions:
  - `due_medication_reminders()` and `claim_medication_reminder()` can only be run by the service role.
  - `unsubscribe_email(token)` is open to anonymous visitors and only switches email off.
  - `save_push_subscription()` is for signed-in users.

### Edge Functions and the daily job

- `medication-reminders` rejects every request without the cron secret (403). Its logic is in
  `supabase/functions/_shared/` and tested with Vitest. `npm run typecheck:functions` typechecks it.
- `send-test-push` needs a signed-in user and only reaches that user's own devices.
- pg_cron job `medication-reminders`: `30 2 * * *` (02:30 GMT = 08:00 IST). It reads the cron secret from Vault.
- **Setup and secrets:** `docs/PHASE-7-SETUP.md` covers the VAPID keys, the Resend API key, the cron secret and the
  Vault secret. None of them are in the repo.

### New dependencies

- None in the app. The Edge Functions import `npm:web-push@3.6.7` (for push encryption and signing) and
  `npm:@supabase/supabase-js@2.117.1` through Deno. Resend is called with plain `fetch`.

### Testing

- `npm run test`: 693 tests. These cover:
  - IST dates around midnight;
  - every reminder window;
  - the retry rules (email fails with push off → retried; push succeeds → not retried; both work → sent once);
  - deleting devices on 404/410;
  - the cron secret check;
  - the email and its unsubscribe headers;
  - the Reminders card, the Home banner and unsubscribe.
- Deployed function:
  - the self-check passed (push encryption and signing work on Supabase);
  - requests without the secret got 403;
  - a dry run and a real run worked;
  - a second run sent nothing.
- **End to end:**
  - **Email:** a reminder sent to Jessica's own account arrived, with correct content and working links.
  - **Push:** the test notification arrived in Chrome on a laptop, and on an iPhone in the Home Screen app
    (production).
- The offline emergency card still works with the network fully cut, because the service worker change only adds the push listeners.
- **Two-user RLS test (`scripts/rls-two-user.mjs`, 2026-11-01), 53 of 53 checks passed:**
  - two temporary users on the live project, using the REST API with the anon key like the app;
  - user B couldn't read, edit, delete or insert user A's rows in `reactions`, `reminder_settings`,
    `push_subscriptions` or `medication_reminders`;
  - nobody else could read A's unsubscribe token; a guessed token changed nothing;
  - users can't write sent-reminder records or choose their own token;
  - signed-out requests saw and changed nothing, and A's data was unchanged afterwards;
  - the script deletes both test users at the end (also after a failure); confirmed gone.
  - Run it with `node scripts/rls-two-user.mjs`. It needs `SUPABASE_SERVICE_ROLE_KEY` in the git-ignored
    `.env.rls.local`, only to create and delete the test users.
- **Known:** the test email landed in spam because of Resend's test sender.

### Before real users

- [ ] Verify a sending domain in Resend and change `REMINDER_FROM`. The test sender only reaches the Resend
      account's own address, and its emails go to spam.
- [x] iPhone push from the Home Screen app (test notification arrived on production, 2026-11-01).
- [x] Two-user RLS test for the three new tables (53 of 53 checks passed, 2026-11-01).

### Phase 7 "Done when"

- [x] A medication set to expire in 7 days triggers a notification in testing (email on 2026-11-01; push test
      notification on a laptop and on an iPhone from the Home Screen app)
- [x] Settings let the user turn notifications on or off (Profile → Reminders: email switch, push on/off per device)

## Phase 8: Ingredient change alerts

Every Sunday at 08:30 IST, products you scanned in the last 6 months are checked again on Open Food Facts. If one
has become less safe for you, you get a push notification or an email, and a banner in Scan history.

### What's included

- **Watched products:** one per product per profile, created by a database trigger when a barcode scan finds the
  product. The snapshot is what you saw last.
  - **Stop watching / Watch for changes** on the scan result.
  - Deleting your last scan of a product removes its watch.
- **The check:** both the snapshot and the new data go through the one `checkAllergens()`, with your **current**
  allergens. Changing your own profile never shows up as a product change.
  - **Alert** when the verdict gets worse (Safe → Caution/Unsafe, Caution → Unsafe), or when a new allergen of
    yours appears.
  - **No alert** for:
    - formatting-only changes;
    - improvements, which update the snapshot quietly;
    - missing or incomplete data, which only adds a note on the result.
  - Each change alerts once (`unique (watch, change_key)`).
- **Open Food Facts:**
  - a User-Agent with the app, version, site and contact;
  - one request per product per run, 1.5 s apart;
  - at most 60 products per call;
  - stops on 429, or after 3 failures in a row;
  - failed requests never change anything.
- **Safety brake:** if more than 20% of products (and at least 5) would alert in one run, nothing is sent, the run
  is logged and the owner gets an email.
- **Channels:** Phase 7's push and email, with the same delivered/failed logic.
  - Failed alerts are retried daily for 7 days.
  - In Scan history: a banner, a "Changed since" badge and a change page (`/scans/changes/[id]`). Opening the page
    marks the alert seen with a POST.
- **Settings:** a "Product change alerts" switch in Profile → Reminders, on by default. The email's unsubscribe link
  turns off product alerts only.
- **Privacy page:** a new "Product change alerts" section.
- **Results checked before an allergen was added:** Scan history, Home and the result page show the **current**
  verdict. It is worked out by running `checkAllergens()` again on the saved ingredients, with no new lookup and
  nothing saved. The saved one appears underneath as "At the time of scanning" ("Was Safe when scanned" in lists).
  Label photos and pasted text can't be checked again, so they show "Re-check needed", listed under Caution.
  Filters use the current verdict.
- **Security (H7):** the service worker no longer has a public source map.
- **Allergen imports** in `src/lib/allergen/` now end in `.ts` (`allowImportingTsExtensions`), so the Edge Function
  uses the same `checkAllergens()`. No logic change.

### Database

- `20261103000000_product_alerts`: `watched_products`, `product_alerts`, `product_check_runs` (owner only),
  `reminder_settings.product_alerts_enabled`, scan triggers, the job's functions (service role only) and
  `unsubscribe_product_alerts(token)`. RLS on every table; users can only change `watching` and `seen_at`.
  **Already applied to the shared project; don't re-run it.**

### Schedules (already set up; don't re-run)

- `product-alerts`: `*/15 3 * * 0`, Sunday 08:30 to 09:15 IST, up to 60 products per call.
- `product-alerts-retry`: `5 3 * * *`, daily at 08:35 IST, retries failed alerts only.
- To stop either: `select cron.unschedule('product-alerts');` / `select cron.unschedule('product-alerts-retry');`.

### Testing

- 797 tests, lint and the production build pass. They cover:
  - the change rule, with real `checkAllergens()`;
  - the run with fakes: polite spacing, 429, failures, never twice, the brake, retries, dry run;
  - the wording, the UI and the unsubscribe kinds;
  - current verdicts for results checked before an allergen was added.
- The migration was tested on a local Postgres first. Two-user RLS test: **103/103**.
- **Live tests passed** (steps in `docs/PHASE-8-SETUP.md`):
  - push on the iPhone Home Screen app and laptop Chrome;
  - email with push off;
  - a second run sent nothing ("never twice");
  - an improvement sent nothing.
- **After the merge, on the live site:**
  - the function self-check passed, and it returns 403 without the cron secret;
  - QA account at 390 and 1440 px: the watch box, the settings switch and the privacy section are there, with no page errors;
  - offline `/emergency` with the network fully cut: the card and the `tel:` link work.
- **Before real users:** a Resend sending domain (same as Phase 7).


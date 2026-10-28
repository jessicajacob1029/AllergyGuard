# AllergyGuard build progress

Branch: `feature/full-build`, one commit per story/phase, pushed once at the end (no PR until then).
PR text lives in `docs/PR_DESCRIPTION.md`; add each phase's section to it when the phase is finished.
Scope: rest of Phase 1, then Phases 2–8 from `docs/PLAN.md`. Phases 9–10 skipped for now.

To resume in a fresh session: run `/clear`, then say "continue from docs/PROGRESS.md".

## Checklist

### Phase 1: Auth and allergy profile
- [x] US-01 Sign up with email and password (merged in PR #5)
- [x] US-02 Log in and log out
- [x] US-07 Allergen selection: reusable `AllergenPicker` (severity + custom allergens)
- [x] US-03 Onboarding wizard: disclaimer, profile name, allergens, primary emergency contact, medications, resumable
- [x] US-09 Edit profile, incl. `set_primary_contact(contact_id)` Postgres function (single transaction)

### Later phases
- [x] Phase 2: Offline emergency card (Serwist, Dexie, `/emergency`, nav button, manifest). Closed 2026-10-04;
  verified on iPhone. **Android is untested** (no Android phone available).
- [x] Phase 3: Allergen matching engine (`checkAllergens()`). Closed 2026-10-04.
- [ ] Frontend redesign (before Phase 4): see the "Frontend redesign" section below
- [x] Phase 4: Barcode scanning (@zxing/browser, Open Food Facts, `scans` table). Closed 2026-10-28;
  camera scan verified on the user's iPhone (see "Phase 4" below).
- [ ] Phase 5: Ingredient label photo (Tesseract.js OCR). Built 2026-10-28 on branch `phase-5`; waiting for the
  migration and the iPhone test (see "Phase 5" below). `main` stays the live demo until it passes.
- [ ] Phase 6: Reaction diary
- [ ] Phase 7: Medication expiry reminders (Web Push + Resend, pg_cron)
- [ ] Phase 8: Ingredient change alerts (weekly cron)

## Now
**Phase 5 is built on branch `phase-5`** (2026-10-28). Before the phone test: apply migration
`20261028000000_label_scans.sql` (needs the user's go-ahead) and push `phase-5` to the fork (not `main`).
Then the user tests on the branch's Vercel preview. Next session: run `/clear`, then say
"continue from docs/PROGRESS.md".

## Phase 5: Ingredient label photo
Built 2026-10-28 on branch `phase-5` (from `feature/full-build`). Plan approved with these decisions:
- **A. Self-hosted OCR files** (not the jsdelivr CDN): `scripts/copy-tesseract.mjs` copies them to `public/tesseract/`
  before `dev`/`build`; git-ignored, lint-ignored and left out of the service-worker precache (`globIgnores`).
- **B. Low confidence is sticky**: the photo's confidence counts even after the user edits the text.
- **C. Phone test on the Vercel preview of `phase-5`** on the fork (`jessicajacob1029/AllergyGuard`), no Vercel CLI.
- **`joinOcrLines()` was written by Jessica.** Rules: join after a comma (only when the next line starts lowercase,
  decided after review: OCR misreads full stops as commas), a letter-hyphen (repaired, except before "free"), or an
  open bracket; join a lowercase line only after a connector word; never across a blank line.
- **Confidence = lowest line confidence**, not the page average (my choice, from real OCR runs): Hindi read with the
  English model gives nonsense lines at 17–29, real lines 74–96 even when blurred. A blurred Maggi label scored 82
  overall while Tesseract silently **dropped the first line**: page confidence can't catch that, which is why the
  review step and "read the label" matter.
- **Hindi typed into the box** counts as incomplete (Caution).
- **Fixed (Phase 3 code, approved):** "Milk-⏎free" split across lines was rejoined to "milkfree", so the free-from
  claim was missed (Safe instead of Caution). Affected barcode text too.
- **Unsafe corpus:** `src/lib/ocr/__fixtures__/unsafe-check-calls.json` holds every Unsafe `checkAllergens()` call
  made by the Phase 3/4 suites (recorded 2026-10-28 with a temporary Vitest setup file that wrapped the function).
  Re-record it if new Unsafe cases are added there.
- **OCR fixtures** (`ocr-samples.json`) are real Tesseract.js 7 output on labels rendered with the exact Open Food
  Facts text (Python/PIL, Arial; Devanagari MT for Hindi).

Checked: 695 tests; lint; build; real OCR in Chromium from the self-hosted files (no requests to other sites, no
uploads, language file fetched once); precache has no Tesseract files; `/emergency` offline still works and
`/scan/label` offline shows "You're offline"; start and review screens at 390px.

**Not done yet:**
- [ ] Migration `20261028000000_label_scans.sql` on Supabase. It only adds: existing rows (3 barcode scans) pass
  the new check, and `main`'s barcode code keeps working. Claude's attempt was blocked by the permission check
  (production database), so it needs the user's go-ahead. After applying, set its version to `20261028000000` as
  in Phase 4.
- [ ] iPhone test on the `phase-5` preview (steps in "Manual steps for me").

## Phase 4: Barcode scanning
Built 2026-10-26 (commits `969106d`..`e355dbd`). Decisions made with the user:
- **Dependencies:** `@zxing/browser` 0.2.1 + `@zxing/library` 0.23.0 (iPhone Safari has no BarcodeDetector).
  Loaded only when the camera starts (about 120 KB gzipped); it is in the service-worker precache like all app JS.
- **Open Food Facts tags:** `checkAllergens()` takes an optional `declared: { contains, mayContain }`, matched
  with the same synonyms and ambiguous-term rules as the text. A declared allergen is Unsafe, a declared
  trace is Caution. Found live: Nutella's OFF text is "sugar, palm oil" while its tags list milk, nuts and soy.
- **Extra rule (my addition, flag it to the user):** if the product declares an allergen the text never
  mentions, the text is provably incomplete, which gives Caution, never Safe (Nutella for an egg allergy).
- **OFF unreachable:** error with Try again; nothing saved, no verdict.
- Non-English ingredient text or tags, and "ingredients to be completed", mark the data incomplete.
- Results are saved snapshots (`scans`, no update policy) shown at `/scans/[id]`; reloading never re-scans.
- Match positions (`start`/`end`) were added to matches for highlighting.

Checked: unit and component tests; live OFF lookups through the real code (Nutella: Unsafe for milk,
Caution for peanut and egg); `/scan` and the verdict screens at 390px with sample data; blocked camera
message.

**2026-10-27 (close-out session):**
- **Supabase** Active. `20261026000000_scans.sql` applied through the Supabase connector (the Supabase CLI
  isn't installed, so not `db push`); its version was set to `20261026000000` so `list_migrations` matches the
  files: `20260924000000` phase1_profiles, `20260925000000` onboarding_progress, `20260925010000`
  contact_functions, `20261004000000` phone_country_code, `20261026000000` scans. RLS on, 3 policies.
- **The user kept the extra rule** (declared allergen missing from the text → Caution, never Safe).
- **Live verdicts** (real OFF data through `fetchProduct` + `checkAllergens`, same as the Server Function):

  | Barcode | Product | User's real profile (kiwi) | milk + peanut + wheat |
  |---|---|---|---|
  | 3017620422003 | Nutella | Caution (declared milk/nuts/soy missing from text → incomplete) | Unsafe (declared milk; "nuts" may include peanuts) |
  | 8901058851298 | Maggi Masala noodles | Safe | Unsafe (wheat, gluten, "Hydrolyzed peanut protein") |
  | 8901262010016 | Amul butter | Safe | Unsafe (milk: "Butter") |
  | 8901725181222 | Yippee noodles (on OFF, no ingredients) | Caution | Caution |
  | 8901719110016 | Parle-G (not on OFF) | Caution | Caution |

- **Fixed:** the explanation listed the same word twice in different case ("wheat", "Wheat" on Maggi).
  Every match is still kept for highlighting.
- **Fixed:** `/auth/confirm` only accepted `?token_hash=` links. After the project restore, Supabase sent its
  default link (`/verify` → `?code=`), so new users were confirmed but never signed in and landed on
  `/signup?error=confirmation_failed`. It now accepts `?code=` too (same-browser only), with route tests.
- **Deployed:** the user's fork `jessicajacob1029/AllergyGuard` on Vercel (`allergy-guard-nine.vercel.app`).
  `origin/main` (Jenkins/Docker files from teammates) merged into this branch; fork `main` = this branch.
- Claude's test browser couldn't be signed in, and creating a test user directly in `auth.users` was blocked
  by permissions, so the user ran the signed-in checks.

**2026-10-28 (user's test on `allergy-guard-nine.vercel.app`; rows confirmed with SQL):**
- **iPhone camera scan works:** a Nutella jar, `3017624010701`, gave **Safe** for the kiwi-only profile.
  Correct: this OFF entry's text includes hazelnuts, so the declared "nuts" is in the text and the data
  isn't incomplete.
- **Saved rows** (`scans`, all on the user's profile):

  | Time (UTC) | Barcode | Input | Product | Verdict |
  |---|---|---|---|---|
  | 04:02 | 3017620422003 | manual | Nutella | Caution (declared milk, nuts, soybeans; text incomplete) |
  | 04:03 | 8901058851298 | manual | Maggi Masala | Safe |
  | 04:04 | 3017624010701 | camera | Nutella | Safe |
- **Reloads** of `/scans/[id]` showed the same result (user).
- **Fixed:** on the iPhone the Diary tab label was cut off ("Diarv"). "Diary" and its Soon badge shared one
  line; at phone width the badge wrapped under the label and its background covered the "y". The badge now
  sits on the icon's corner and the label is `whitespace-nowrap`. Checked at 390px and 320px, with a test.
- **Not reported (left blank in the user's note):** an Unsafe scan after adding Milk (the profile still only
  has kiwi and there is no such row), Stop camera, Airplane mode on `/scan`, and a barcode not on OFF
  end to end. The not-found → Caution rule is covered by tests and the live check above.

## Next
**Phase 6: reaction diary**, only after Phase 5 passes the phone test and the user asks.

**Frontend redesign:** the only open item is the signed-in click-through of `/`, `/onboarding` and
`/profile` at 390px (see "Manual steps for me").

## Frontend redesign
Plan approved 2026-10-26. Reference: `design/figma-reference/STYLE.md` and `screens/` (style only).
Decisions: dark mode kept through tokens; Log out moves to the bottom of `/profile` (away from Emergency,
since logging out wipes the offline card); Scan, Diary and Medication show a "Coming soon" label you can't
tap, and Restaurants and Travel stay hidden; the password field gets a working show/hide button.
- [x] Tokens (light + dark, all text pairs at least 4.5:1), Nunito, `woff2` added to the precache globs (the
  default Serwist globs left fonts out), `form-styles.ts`. Offline check: `/emergency` reloaded with the
  network off loads Nunito from the service worker (Chromium, `next start`).
- [x] Shared components in `src/components/ui/` (app bar, header band, section card, pill, field icons +
  password eye, bottom tabs, inline SVG icons), with tests.
- [x] App bar + bottom tabs. Below 400px the app bar shows only the icon so Log in and Emergency fit.
- [x] `/emergency` + `/~offline`. Re-tested offline on a production build: card, `tel:` link and Nunito all
  load with the network off; `/profile` offline falls back to "You're offline".
- [x] `/login` + `/signup`
- [x] `/` (signed-in view is `home-dashboard.tsx`, a pure view with tests)
- [x] `/onboarding` + `AllergenPicker` (each step's band takes its section colour)
- [x] `/profile` (`profile-view.tsx`); phone links raised to 44px
- [x] PWA icons: white shield on purple
- [ ] **Signed-in screens not yet checked against real data:** `/`, `/onboarding` and `/profile` were
  checked at 390px (and 320px) with sample data. Supabase is restored (2026-10-27), but Claude couldn't get
  signed in to its test browser; the user does the click-through (see "Manual steps for me").

Deliberate differences from the prototype screens:
- **Emergency (12):** the Call button stays at the top, not the bottom; the title stays "Emergency"; our
  section names (Allergies, Medications, Other contacts).
- **Home (05):** no bell and no "Last scanned" (no data yet). The scan card has a **Start scanning**
  button to `/scan` and the Scan tab is live (since Phase 4). 2×2 tiles: Diary and Medication are marked Coming soon; Restaurants and Travel are hidden.
- **Login (02):** our copy ("Log in", "Welcome back to AllergyGuard."); no "Forgot password" or Terms of
  Service links (not built).
- **Create profile (03/04):** stays a 6-step wizard, not one long form; step bands take the section
  colour; final buttons are green.
- **Profile (11):** initials avatar instead of a photo; our four sections each keep their own Save button;
  Log out at the bottom.
- **All screens:** darker text colours than the prototype (contrast); app bar with the Emergency button
  on every screen; dark mode.
- **Screenshot workaround:** in this Playwright setup, emulating dark mode breaks screenshots. Dark-mode
  checks injected the page's own `prefers-color-scheme: dark` rules instead.

## Done notes
- **Phase 3 (2026-10-04):** see the Phase 3 section of `docs/PR_DESCRIPTION.md`. Decisions made with the user:
  - **Free-from claims** ("dairy-free", "no milk", "without nuts", "contains no peanuts", "non-dairy", "eggless")
    are not ingredient matches but give Caution on their own. A real ingredient elsewhere still gives Unsafe.
  - **Ambiguous terms** (lecithin/E322/INS 322, bare flour, hydrolysed vegetable protein) give Caution. A stated
    source settles them either way: "soy lecithin" → Unsafe, "sunflower lecithin" → not flagged.
  - **Indian label terms:** maida and atta are wheat; besan / gram flour is not wheat.
  - A may-contain span ends at a full stop, `;`, a line break, "contains" or "ingredients". Erring this way
    gives Unsafe rather than hiding an ingredient as may-contain.
  - No allergens in the profile → Caution, not Safe.
  - **Gaps closed 2026-10-25 (`951dc5b`):** bare "nuts" / "mixed nuts" / "nut pieces" → Caution for peanut
    ("The label says “nuts”; this may include peanuts."); a named nut ("cashew nuts", "mixed nuts (almonds)")
    settles it. Worcestershire sauce → Caution for fish unless the label shows it's anchovy-free; that label
    still gives Caution, through the free-from claim rule. Hing / asafoetida → Caution for wheat unless rice
    is the stated base. Added moongphali, malai, chhena, kaju, badam, pista, akhrot, sooji/suji, rava, dalia.
    "Rice rava" and "idli rava" are not wheat (stated source).
  - "Did you mean" box checked in Chromium at 390px (light) and 320px (dark): no overflow, 44px buttons,
    contrast AA. No changes needed.
- **Phase 2 real-phone check (2026-10-04):** passed on **iPhone**, with the app installed to the Home Screen through a
  `cloudflared` tunnel:
  - installed with the AG icon;
  - the offline card opened in Airplane mode;
  - the call button opened the dialer with the right number (`+91 99400 54631`);
  - an edit in `/profile` synced to the card with an updated "Last updated";
  - Log out cleared the card.

  **Android: untested** (no Android phone available). The manifest passes Chrome's installability check on desktop,
  but install, the offline card and the "Emergency card" shortcut have not been tried on an Android device.
- **Phone country code (2026-10-04, `033e3c8`):** emergency contact phones must start with `+` and a country code
  (not starting with 0), with digits, spaces, dots or hyphens and 7–15 digits. Brackets are rejected
  ("+44 (0)20…" would dial +44020…). Same rule in `validatePhone()` and in migration
  `20261004000000_phone_country_code.sql`, which re-validates existing rows.
  - Empty phone fields in onboarding and `/profile` start with `+91 `, with a hint under the field.
  - `telHref()` lives in `src/lib/profile/phone.ts` and is used by both the card and `/profile`, so every call
    link is `+` and digits while the displayed number keeps its spaces.
  - **Migration applied to the remote project on 2026-10-04.** The first `db push` failed safely (nothing changed;
    the old rule was still in place): one stored contact had no country code (`9940054631`). It was fixed by hand
    to `+91 99400 54631`, the check query returned no rows, and the second push applied it.
    `supabase migration list` shows `20261004000000` on local and remote. Do **not** `db push` it again.
- **Phase 2 (2026-10-03):** see the Phase 2 section of `docs/PR_DESCRIPTION.md` for the full list. Key decisions:
  - Header pages moved to `src/app/(main)/` so `/emergency` can be built as a static page (the root layout no longer reads cookies).
  - The service worker precaches only `/emergency`, `/~offline` and static files. Every other page is network-only, so
    no cache holds user content. Serwist's `defaultCache` and `cacheOnNavigation` are deliberately **not** used: both
    would cache signed-in pages.
  - Dexie card = one full snapshot per profile. It is written after every save (`attempt()` in `save.ts`) and once per
    signed-in page load. It is cleared **only** by explicit Log out (`SignOutButton`).
  - Verified with `next start` + Chromium offline. Not yet tested with a real login against Supabase: the save → Dexie
    path is covered by unit tests, and the real-phone check below covers it end to end.
  - Chrome's *hard* reload (Ctrl+Shift+R) skips the service worker by design, so it can't be used for the offline
    "Done when" check. Use a normal reload or reopen the tab.
- **Phase 1 verification (2026-10-03):** both "Done when" items pass on the remote project.
  - Two-user RLS: real users signed in through Supabase Auth and used the REST API; 38/38 checks passed (B can't
    list, read by id, insert, update, delete or call the contact functions on A's rows; anon sees nothing and can't
    call `delete_contact`; A's data unchanged). Test users deleted; the user's real account was not touched.
  - Real signup: account confirmed through the email link and onboarding finished (verified with SQL: confirmed,
    profile at step 6 with disclaimer, 1 custom allergen, 1 primary contact, 1 medication). The account is kept.
- **US-02:** `/login` (email + password, `next` redirect via `safeNextPath`), `signOut` Server Action,
  `SiteHeader` in the root layout (Log in / Log out), shared form styles in `src/components/form-styles.ts`.
- **US-07:** `src/lib/allergen/codes.ts` (codes, labels, severities; a test checks them against the DB enums),
  `src/lib/profile/allergen-selection.ts` (toggle/add/remove/severity, row mapping, `diffAllergens` for saves),
  and the controlled `src/components/allergen-picker.tsx` (no DB access). Component tests use
  @testing-library/react + user-event + jsdom (`// @vitest-environment jsdom` per file).
  Synonyms such as "dairy" or "whey" are stored as custom text (decision: option a).
- **US-03:** migration `20260925000000_onboarding_progress.sql` (applied with `db push`): `disclaimer_accepted_at`,
  `onboarding_step` (check 0–6), `onboarding_completed_at` (set exactly when step = 6). Wizard at `/onboarding`
  (`wizard.tsx` + `steps/`), resume logic `resumeStep()`, validation mirrors DB constraints, all writes in
  `src/lib/profile/save.ts` (browser client, so Phase 2 can add Dexie there). Home redirects unfinished users to
  onboarding and shows an "Add an emergency contact" banner while there is no primary contact.
  **E2E tested** against the real project at 390px: login, disclaimer, name, reload resumes at step 3,
  "at least one allergen" block, Milk (severe) + custom "whey", phone validation, contact save and update via Back
  (still one row), medication with expiry, finish, `/onboarding` → home, banner with no contact, real logout.
  Test user created via SQL (no emails sent) and deleted afterwards; project left with 0 profiles.
- **US-09:** migration `20260925010000_contact_functions.sql` (applied): `set_primary_contact(contact_id)` and
  `delete_contact(contact_id) returns uuid` (promotes the oldest remaining contact when the primary is deleted),
  both `security invoker`, `search_path = ''`, profile row locked `for update`, execute revoked from
  public/anon and granted to authenticated. Tested locally (switch, no-op, delete non-primary, delete primary
  with others, delete last, other user's contact, missing id, anon) and remotely (anon RPC → 401
  "permission denied"). `/profile` page: name, allergies, contacts (add/edit/delete/make primary via `rpc()`),
  medications; each section saves on its own. Medication list and contact fields extracted to
  `src/components/profile/` and shared with onboarding. Header has a Profile link; home banner links to
  `/profile#contacts`. **E2E tested** on the real project (add, make primary, delete primary → "Ravi Test is now
  your primary contact.", delete last, rename, add allergen, add medication, banner link), test user deleted.
- With the real `.env.local`, `/`, `/login`, `/signup` return 200 and Supabase auth health returns 200 (checked after US-07).

## Required in Phase 3 (decided during US-07)
- [x] `checkAllergens()` must map **custom** allergens through the synonym list, so a custom "dairy" or
  "whey" is matched as milk (Unsafe), not only as literal text.
- [x] Vitest case for this: custom allergen "whey" (and "dairy") + ingredients containing milk
  (or casein/whey) → Unsafe, with the matched ingredient shown.
- [x] Once the synonym list exists, add a "Did you mean Milk?" suggestion to `AllergenPicker` when a custom
  entry is a known synonym of a predefined allergen.

## Required in Phase 2 (decided during US-03)
- [x] Mirror every successful write in `src/lib/profile/save.ts` (profile, allergens, contact, medications) into
  Dexie, per CLAUDE.md. US-03 saves go to Supabase only because Dexie doesn't exist yet.

## Follow-ups (not blocking)
- Login: "Resend confirmation email" button for `email_not_confirmed`.

## Manual steps for me
- [ ] **Phase 5 phone test** on the Vercel preview of `phase-5` (URL in the chat / Vercel dashboard → Deployments).
  If the preview asks for a Vercel login, that's Vercel's Deployment Protection: log in, or turn it off for previews.
  The preview needs the Supabase env vars for the **Preview** environment (Vercel → Settings → Environment Variables).
  1. Log in. Tap **Scan** → **Photo of the ingredients**. Check the tips show.
  2. **Take photo** of a clear English ingredients list (Maggi is ideal), filling the frame. The first time it says it
     is downloading the text reader (about 4 MB). Check the text matches the label; fix a mistake if there is one.
  3. **Check ingredients**: the verdict matches what the barcode gives for the same product (kiwi profile: Safe).
  4. Add Milk to your profile and photograph Amul butter (or edit the text to add "milk"): **Unsafe**, word highlighted.
  5. Take a deliberately blurry or angled photo: the "weren't read clearly" message and **Caution**.
  6. Photograph a label with Hindi on it: the message mentions Hindi, result **Caution**.
  7. **Retake photo** works; **Choose from photos** works with a photo from your library.
  8. Reload the result page: same result. On the result, "You edited this text" shows only if you changed it.
  9. Airplane mode on `/scan/label`: "You're offline", Take photo disabled; Emergency still works.
  10. Note how long reading takes the first time and the second time.
- [x] ~~Phase 4: restore Supabase and apply the scans migration~~ (done 2026-10-27).
- [ ] **Supabase Auth settings** (Dashboard → Authentication):
  - Emails → Confirm signup: link `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
    (the restore seems to have reset it; without it the link only works in the browser that signed up).
  - URL Configuration: Site URL `https://allergy-guard-nine.vercel.app`; Redirect URLs add `https://*.vercel.app/**`
    and `https://*.trycloudflare.com/**`.
  - The built-in email sender allows only a few emails an hour. Add SMTP (e.g. Resend) before others sign up.
- [ ] **Signed-in click-through at 390px** (laptop, Chrome DevTools device mode, or the phone): `/`, `/profile`
  (each section's Save), `/onboarding` (only reachable for a new account), then `/scan`. Report anything broken.
- [x] ~~Real scan saved and reloaded~~ (2026-10-28: Nutella and Maggi typed, rows confirmed with SQL).
- [x] ~~Phase 4: camera scan on the iPhone~~ (2026-10-28, on the Vercel site; see "Phase 4").
- [ ] **Optional Phase 4 extras (not reported yet):** add Milk to your profile and scan Nutella or Amul butter
  (`8901262010016`): Unsafe with the word highlighted. Type `8901719110016` (Parle-G, not on OFF): Caution.
  On the iPhone: Stop camera mid-scan, and Airplane mode on `/scan` ("You're offline", camera disabled).
- Steps kept for re-testing the camera through a cloudflared tunnel (camera needs HTTPS):
  1. Laptop: `brew install cloudflared` (it's no longer installed), then `npm run build && npm start`.
  2. Second terminal: `cloudflared tunnel --url http://localhost:3000`. Copy the `https://….trycloudflare.com` URL.
     It changes every run, so add `https://*.trycloudflare.com/**` to the Supabase Redirect URLs once.
  3. iPhone Safari: open the URL, log in, tap **Scan** (tab) → **Open camera** → **Allow**.
  4. Point at a barcode (Nutella or Maggi): it should open the result by itself. Try a product not on OFF
     (must be Caution, never Safe).
  5. Tap **Stop camera** mid-scan, and try with camera access denied (Settings → Safari → Camera → Deny):
     the blocked-camera message shows and manual entry still works.
  6. Airplane mode on `/scan`: "You're offline" and Open camera is disabled; the Emergency button still works.
  7. A Home Screen app installed from an old tunnel URL points to that old URL; open the new URL in Safari instead.
  Simpler alternative: the Vercel site is already HTTPS. Do steps 3–6 there.
- [ ] **Security:** `npm audit` reports a critical advisory for `next` 16.0.0–16.4.0 (we have 16.3.6).
  Upgrading is a dependency change: decide whether to upgrade.
- [x] **Offline check on the laptop:** done by Claude with `next start` + Chromium (Playwright) on 2026-10-03, using a
  seeded card. The real-login parts (steps 1, 2, 6) are covered by the iPhone check. Steps kept for re-testing:
  1. `npm run build && npm start` (the service worker is off in `npm run dev`), open `http://localhost:3000`, log in.
  2. Open `/emergency` once while online and check your card shows, with "Last updated".
  3. DevTools → Application → Service workers: `/serwist/sw.js` is "activated and running".
     Cache storage should contain only `serwist-precache-…` and `next-static`.
  4. DevTools → Network → **Offline**. Reload `/emergency` with a *normal* reload (⌘R): the card still shows.
  5. Still offline, open `/profile`: you get "You're offline" with an **Open emergency card** button.
  6. Back online, Log out, open `/emergency`: "No emergency info saved on this device."
- [x] **Real phone check, iPhone:** passed 2026-10-04 (see Done notes).
- [ ] **Real phone check, Android: untested.** Run it if anyone gets an Android phone. A service worker needs HTTPS,
  or `localhost` itself; a LAN IP like `http://192.168…` won't register it:
  - **Android (Chrome), no deploy needed:** plug the phone in by USB with USB debugging on. On the laptop open
    `chrome://inspect/#devices` → Port forwarding → `3000` → `localhost:3000`, then run `npm run build && npm start`.
    On the phone open `http://localhost:3000`.
  - **iPhone (Safari) needs HTTPS:** push the branch and use the Vercel preview URL (the preview needs the Supabase
    env vars). Or use an HTTPS tunnel such as `cloudflared tunnel --url http://localhost:3000` (an extra local tool).
  - Then, on each phone:
    1. Log in with your real account and open the home page once (this syncs the card). Open `/emergency` and check
       your allergies, medications, contact and "Last updated".
    2. Install: Android, Chrome menu → **Install app** (or "Add to Home screen"). iPhone, Safari **Share** →
       **Add to Home Screen** (the blue hint on home and `/emergency` says the same). Check the green "AG" icon.
    3. Open the installed app once while online, then turn on **Airplane mode** and fully close the app.
    4. Open the installed app: you see "You're offline" → tap **Open emergency card** → the card shows.
       Android: long-pressing the icon also offers an "Emergency card" shortcut.
    5. Tap **Call …**: the dialer opens with the right number (cancel the call).
    6. Turn Airplane mode off. Edit something in `/profile`, open `/emergency` and check the change and the new
       "Last updated" time.
    7. Log out → `/emergency` says nothing is saved.
- [x] ~~Restore the paused Supabase project~~ (restored 2026-10-03): Supabase Dashboard →
  project `allergyguard` → **Restore project**. It takes a few minutes. Free-plan projects pause after about a
  week without activity, so expect this again after long breaks.
- [x] ~~Real signup test~~ (done 2026-10-03, verified with SQL):
  1. Check the US-01 dashboard settings are still in place: Authentication → URL Configuration
     (Site URL; Redirect URLs include `http://localhost:3000/**`), Emails → Confirm signup template uses
     `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/onboarding`, minimum password length 8,
     and **Confirm email turned on**.
  2. `npm run dev`, open `http://localhost:3000/signup`, and sign up with an email address you can read.
  3. Open the confirmation email and tap the link: you should land on `/onboarding`, step 1.
  4. Finish onboarding with at least one allergen.
  5. Tell me the email you used so I can verify the rows with SQL (then delete the account or keep it).
- [x] ~~Fix contacts without a country code, then apply `20261004000000`~~ (done 2026-10-04).
- [x] ~~Fill in `.env.local`~~: done; values set and the file is git-ignored.
- [x] ~~US-01 migration~~: already applied and registered as version `20260924000000`. Do **not** `db push` it again.
- [x] ~~Link the Supabase CLI~~: linked to `vwnwevrwoitvnsspudqe`; `20260925000000` applied with `db push`.
- [x] ~~Test real login/logout~~: covered by the US-03 end-to-end run.

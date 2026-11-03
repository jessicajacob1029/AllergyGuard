# Phase 8 plan: ingredient change alerts

Status: **approved and built** (2026-11-03) on branch `phase-8` (from the fork's `main`, `3e7bc18`), pushed to
the fork only. Waiting for the migration to be run; testing steps in `docs/PHASE-8-SETUP.md`.

**Decisions (approved 2026-11-03):**
1. User-Agent contact: `jessicajacob1029@gmail.com`, plus the site URL.
2. Missing ingredient data: a note on the result only; no push or email.
3. Stopped watches stay stopped when the product is scanned again.
4. A daily retry for failed alerts.
5. Sunday 08:30 IST.
6. The unsubscribe link turns off product alerts only.
7. **Added: safety brake.** If more than 20% of the products checked in one run, and at least 5, would alert:
   - nothing is sent and the snapshots are kept;
   - the watches are marked `held` and the run is logged in `product_check_runs`;
   - jessicajacob1029@gmail.com gets an email.

   That many changes at once is more likely an Open Food Facts data problem than real recipe changes. The count
   is of products, not people: one product watched by 6 people counts once.

**Added during testing (2026-11-03, asked by Jessica): results checked before an allergen was added.** A saved scan
was checked against the allergies of that moment: her 28 October Amul Butter and Nutella still showed a green Safe
after Milk was added. Now (`src/lib/products/stale-result.ts`, `currentVerdict()`):
- **Barcode scans** checked before an allergen was added are re-checked when they're shown. `checkAllergens()` runs
  on the saved ingredients and allergen tags with the current allergies; there's no Open Food Facts request and
  nothing is saved.
  - **Scan history and Home's "Latest scans":** the pill is the **current** verdict, with "Was Safe when scanned"
    when it differs.
  - **Filters:** Safe / Caution / Unsafe use the current verdict, over the latest 300 scans.
  - **The scan result:** the current verdict is the big header, with "Checked with your current allergies" and "At
    the time of scanning: Safe (date)" underneath. "Show the result from the time of scanning" (`?saved=1`) shows the
    saved result with the warning "Your allergies have changed since this check. This result may be out of date."
- **Label photos and pasted text** can't be re-checked from saved data (their OCR confidence isn't stored here):
  - lists show a grey **Re-check needed** pill, never Safe; under the filters it counts as Caution;
  - the result page's header says "Re-check needed", with the warning and **Scan the label again**.
- **Detection, no migration:** saving a profile inserts rows only for new allergens, so `profile_allergens.created_at`
  is when each was added.
  - Removed allergens and severity changes don't count. A removal can only make an old result more cautious than
    needed; severity never changes a verdict.
  - A barcode Open Food Facts didn't have is Caution whatever the allergies, so it's never flagged.

**Changed while building:**
- A new scan always refreshes the snapshot, even for a stopped watch (`watching` stays as it is). If you turn
  watching back on later, it compares against what you last saw, not an older version.
- `fetchProduct()` now reports a 429 as `rate_limited`, so the job can stop. The scan page shows "busy, try again
  in a minute".
- Deploy: the Supabase CLI (already signed in on this laptop) uploads the app's own files with the function, so
  `checkAllergens()` exists once.

Done when (from PLAN.md, widened as asked):
- Editing a stored snapshot in the database so it differs from Open Food Facts triggers an alert in testing.
- A real alert reaches my own email and phone. Running the job again doesn't send it a second time.
- H7 is fixed: `/serwist/sw.js.map` is no longer public.

One change from PLAN.md: it says "products scanned as **Safe**". This plan watches every product found by a barcode
scan, as you asked. A product that was Unsafe can still gain a new allergen from your profile.

---

## 1. Which products are watched

- **One watch per product per profile** (`watched_products`, unique on profile + barcode), not one per scan.
  Scanning the same product five times gives one watch.
- **Created automatically** by a database trigger when a barcode scan is saved with `product_found = true`.
  A scan of a barcode Open Food Facts doesn't know isn't watched (there's nothing to compare). Label photos and
  pasted text (Phase 5) have no barcode, so they're never watched.
- **Checked only while recent:** the job checks a watch only if the product was scanned in the **last 6 months**.
  Scanning it again restarts the 6 months. Older watches stay in the table but are skipped.
- **The baseline ("snapshot")** is what you last saw: copied from your latest scan of that product. It holds the
  ingredient text, Open Food Facts' allergen and traces tags, and the "incomplete" flag. A new scan of the product
  replaces the snapshot.
- **Existing scans:** the migration creates watches from your scans of the last 6 months. Today that's 6 watches
  across 5 products and 2 profiles.
- **Stop watching:** a scan result page (`/scans/[id]`) shows "Watching for changes · **Stop watching**", or
  "**Watch for changes**" when stopped.
  - **Recommended:** a stopped product stays stopped when scanned again; you turn it back on with the same button.
- **Deleting scans:** if you delete your last scan of a product, its watch and alerts are deleted too. Deleting your
  scan history shouldn't leave the app quietly checking those products.

## 2. The job and when it runs

Same setup as Phase 7: **pg_cron → `net.http_post` → Edge Function `product-alerts`**, with the cron secret read
from Vault (`medication_reminders_cron_secret`, the same secret and the same `CRON_SECRET` variable). Every request
without it gets 403.

**Recommended time: Sunday 08:30 IST (03:00 UTC)**:
- **Morning in India:** alerts arrive when people are awake and before weekend shopping, never at night.
- **30 minutes after the daily medication reminders (08:00):** the two jobs never run at the same moment, and a
  reminder and an alert don't arrive together.
- **Easy on Open Food Facts:** 03:00 UTC is night in Europe, where most of its traffic comes from.

**Schedules:**

| Job | When | What it does |
|---|---|---|
| `product-alerts` | Sunday 08:30, 08:45, 09:00 and 09:15 IST (`*/15 3 * * 0` UTC) | Each call checks up to 60 due products (section 3). With today's 5 products the first call does everything and the other three find nothing due. The extra calls are room to grow (up to 240 products a week) without a single call running too long |
| `product-alerts-retry` | Daily 08:35 IST (`5 3 * * *` UTC), body `{"retryOnly": true}` | Only resends alerts that failed (section 6). No Open Food Facts requests. Without it, a failed alert would wait a week |

A product counts as **due** when it's watched, was scanned in the last 6 months, and wasn't checked in the last
6 days.

## 3. Open Food Facts: being a polite client

- **User-Agent** on every request, from the scan page too: `AllergyGuard/1.0 (https://allergy-guard-nine.vercel.app;
  <contact email>)`. Open Food Facts asks for the app name, its version and a contact. **Decision for you:** which
  email address goes there (see the end).
- **One request per product per run,** shared by every profile watching it.
- **Requests one after another, 1.5 seconds apart:** at most 40 a minute. Open Food Facts allows 100 product
  requests a minute.
- **At most 60 products per call,** about 90 seconds. Edge Functions are stopped after 150 seconds.
- **The same request as the scan page:** the product endpoint (`/api/v2/product/<barcode>?fields=…`) with the same
  field list, read by the same `parseProduct()`. Not used: the search endpoint can fetch many barcodes at once, but
  its limit is 10 requests a minute and its index can lag behind recent edits.
- **When Open Food Facts can't be reached:**

| Response | What the job does | Alert? |
|---|---|---|
| Timeout, network error or 5xx | Skip the product; check it again next run | No |
| 429 (too many requests) | **Stop the whole run.** The remaining products wait for the next call | No |
| 3 failures in a row | Stop the run (Open Food Facts is probably down) | No |
| 404 / product not found | Keep the snapshot. Show "Open Food Facts no longer has this product" on the scan result | No |
| Found, but no ingredient list (or newly marked "to be completed") | Keep the snapshot. Show "Open Food Facts has no full ingredient list for this right now" on the scan result | **No push or email** (see 4) |

A watch never changes because of a failed request. Only a successful answer is compared.

## 4. What counts as a change, and when to alert

**Step 1: has the product data changed?** A pure function makes a key from:
- the ingredient text, normalised: Unicode NFKC, lower case, punctuation removed, spaces collapsed;
- the allergen tags and the traces tags, each sorted and deduplicated.

If the key equals the snapshot's key, nothing changed (spacing, capitals or punctuation only). The job records
"checked" and moves on. No alert, and no new result.

**Step 2: has the verdict got worse for you?** Both versions go through **`checkAllergens()`, the same function and
rules as a scan**, with **your current allergens**:

```
before = checkAllergens(snapshot,      current allergens)
after  = checkAllergens(new OFF data,  current allergens)
```

Re-checking the old snapshot with your current allergens matters: if you added Peanuts to your profile last week,
the product isn't blamed for that. Only the product's change counts.

**Alert only when:**
- the verdict got worse (Safe → Caution, Safe → Unsafe, Caution → Unsafe); **or**
- a new allergen from your profile appears, even with the same verdict (Unsafe for milk → Unsafe for milk and
  peanuts, or a new "may contain").

**Recommended:** no push or email when the change comes only from missing data: the new verdict is worse only
because the ingredient list was removed or marked incomplete. Volunteer edits sometimes blank a field for a while;
an alert there would usually be a false alarm. The scan result still shows the note from section 3, so it isn't
hidden.

**Improvements** (Unsafe → Caution, an allergen removed): no alert. The snapshot is updated quietly.

**Never twice:** each alert has a `change_key` (the new data key plus the new verdict). It's unique per watch, and
the snapshot moves to the new data when the alert is created. The same change can't alert again. A later, different
change can.

## 5. What the alert says

| Where | Text (example: Nutella, your profile has Milk) |
|---|---|
| Push title | **Nutella has changed: now Unsafe for you** |
| Push body | Open Food Facts now lists milk (whey). Their data can be wrong or edited: always check the packet. |
| Email subject | Nutella's ingredients changed: now Unsafe for you |
| Email body | What changed, the verdict before → after, the explanation from `checkAllergens()`, the new ingredient text with the trigger word, "Open Food Facts is edited by volunteers and can be wrong. Always check the packet before eating.", **View the new result** (link), and **Turn off product change alerts** (unsubscribe link) |

How "what changed" is worded, from the difference between the before and after matches:
- new "contains" match: "now lists **milk** (whey)";
- new "may contain" match: "now says it **may contain peanuts**";
- a new ambiguous term: "now lists **lecithin**, which may come from soy";
- several changes: "now lists milk and may contain peanuts".

**The new result** is its own page, `/scans/changes/[id]`. It shows what changed, before → after, and the full
verdict view (explanation, highlighted triggers, raw ingredient text, Open Food Facts attribution, the disclaimer).
It reads from the alert row.
- Why not a new row in `scans`: the live database already has Phase 5's changes to the `scans` checks (photo and
  paste inputs) while Phase 5 is unmerged. Phase 8 doesn't touch `scans` at all, so the two can't conflict.

## 6. Channels

Reuses Phase 7's code. Only the message differs.
- **Push first, email only if no push was delivered.** Same rule and same `pushToDevices()`, including the
  push-service allowlist.
- **Same delivered and failed logic:** an alert is claimed atomically (`sending`), then marked `delivered` when any
  channel worked, or `failed` when all failed. A failed alert is retried by the daily retry call for up to 7 days
  (at most 4 attempts). After that it stays failed; the in-app badge still shows it.
- **In the app (Scan history):**
  - a banner at the top: "**1 product you scanned has changed.** View";
  - a "**Changed**" badge on that product's rows;
  - opening the change page marks the alert as seen, and the banner goes away.
- No changes to Home or the emergency card.

## 7. Settings

- **Profile → Reminders** gets a third switch, "**Product change alerts**": "We re-check products you scanned in the
  last 6 months every Sunday and tell you if they become less safe for you." **On by default**, stored in
  `reminder_settings.product_alerts_enabled`. The existing push and email switches stay the channels.
- **The unsubscribe link** in an alert email turns off **product change alerts only**; medication reminder emails
  keep coming. Mail apps' one-click unsubscribe does the same.
  - New `unsubscribe_product_alerts(token)`; the existing page and route take `?kind=product-alerts`.
  - Old medication emails work exactly as before.

## 8. Database (one migration, `20261103000000_product_alerts.sql`, run by you in the SQL Editor)

**`watched_products`**: one per profile and barcode.
- Columns: `profile_id`, `barcode`, `product_name`, `brands`, `watching` (default on), `last_scanned_at`,
  `last_scan_id`.
- The snapshot: ingredient text, allergen tags, traces tags, incomplete flag, key, Open Food Facts last-modified.
- The last check: `last_checked_at`, `last_check_status` (`unchanged`, `improved`, `alerted`, `not_found`,
  `no_ingredients`, `unreachable`).
- RLS: you can read your own rows, and change only `watching` on them (a column grant). Rows are created by the
  scan trigger and updated by the job.

**`product_alerts`**: one per change worth telling you about.
- What changed: `watched_product_id`, `profile_id`, `barcode`, `product_name`, `change_key` (unique per watch),
  `old_verdict`, `new_verdict`, `changes`, `summary`.
- The new result: the full `result`, ingredient text, tags, notes.
- Delivery: `status`, `attempts`, `push_result`, `email_result`.
- `seen_at`.
- RLS: you can read your own rows, and set only `seen_at` on them.

**Other changes:**
- `reminder_settings.product_alerts_enabled` (default on), added to the column grants.
- A trigger on `scans` insert creates or updates the watch, and resets the snapshot (`watching` is left as it is).
  Another on `scans` delete removes the watch when no scan of that product is left.
- Functions for the job (service role only):
  - `due_product_checks(p_limit, p_only_email, p_force)`: due watches, with the snapshot, your allergens, your
    settings and your confirmed email;
  - `record_product_check(...)`: updates the snapshot and the check status;
  - `claim_product_alert(...)`: one atomic statement, like `claim_medication_reminder`;
  - `product_alerts_to_retry()`.
- `unsubscribe_product_alerts(p_token)` for the email link (signed out), same checks as `unsubscribe_email`.
- Backfill from the last 6 months of scans. Revoke from `anon` everywhere.

**Two-user RLS script, new checks.** Signed in as B:
- B can't read A's watches or alerts, by id or by profile;
- B can't stop A's watch, mark A's alert seen, or change any other column of their own rows;
- B can't insert either table;
- B can't call the job's functions;
- B can't turn off A's alerts with a guessed token.

Signed out: nothing is readable.

## 9. Making one `checkAllergens()` work in the Edge Function

The rule is one matching function. Edge Functions run on Deno, and Deno needs file extensions in imports. Our
allergen files import `"./codes"`, not `"./codes.ts"`.

**Recommended:**
1. Add `.ts` to the relative imports in `src/lib/allergen/*.ts` and turn on `allowImportingTsExtensions` in
   `tsconfig.json`. That's import lines only, no logic. `parseProduct()` in `open-food-facts.ts` has no imports at
   all.
2. The Edge Function imports `../../../src/lib/allergen/check.ts` and `../../../src/lib/products/open-food-facts.ts`
   directly. There's one copy of each file in the repo.
3. Deploy uploads the files under their repo paths (`src/lib/allergen/…`, `supabase/functions/…`), so the imports
   resolve. I'll check this works on the first deploy, before anything is scheduled.
   - Fallback: deploy with the Supabase CLI, which bundles relative imports itself. That needs you to sign in to the
     CLI once.
   - Also checked then: Deno's `fetch` and the `cache: "no-store"` option. The job passes its own fetch to
     `fetchProduct()`, so it can drop that option if needed.

Not recommended: running the job on Vercel (a Next.js route called by pg_cron). It would also need the service role
key, the VAPID private key and the Resend key in Vercel, plus the `web-push` package in the app. And Vercel's bot
checkpoint has already challenged automated requests twice this week.

## 10. Testing without waiting a week

1. **Vitest** (pure parts, all with fakes):
   - the data key: formatting-only changes are equal;
   - the change rule: worse, new allergen, improvement, missing data, profile changed;
   - the "what changed" wording;
   - the run: 1.5 s spacing (fake clock), stop on 429 and on 3 failures, one request per barcode, claim / deliver /
     fail / retry, never twice, `retryOnly`;
   - the email and push text;
   - the unsubscribe kind;
   - Stop watching, the banner and the badge, the change page.
2. **Two-user RLS script** on the live project (it deletes its test users).
3. **Self-check and dry run:** `{"selfCheck": true}` proves the function boots and VAPID works. `{"dryRun": true}`
   fetches the real products and lists, for each one, what would happen ("unchanged", "would alert: now lists
   milk"…). It writes nothing and sends nothing.
4. **A pretend change on your account only.** I give you a short SQL snippet to run in the SQL Editor. It sets the
   snapshot of one of your watched products to a version without one of your allergens, so the real Open Food Facts
   data looks like a new allergen.
   - This needs a product you scanned that contains an allergen in your profile (for example Nutella with Milk; we
     can check which first).
   - Then I run `{"onlyEmail": "<your email>", "force": true}` once: a real push on your phone and laptop. Turn
     push off for a second run to get the email.
   - Then the banner, the badge and the change page.
   - Then run again: no second alert.
5. **Improvement:** the opposite snippet (the snapshot has an extra allergen). The run sends nothing and only updates
   the snapshot.
6. **Offline:** the CLAUDE.md offline check (H7 changes the service worker build), on the laptop and on your phone's
   Home Screen app.
7. Then I schedule the two jobs (SQL for you to run, as in Phase 7) and do one live check.

## 11. Privacy, emergency card and H7

- **`/privacy`:** a new "Product change alerts" section, and a new "Last updated" date in `src/lib/constants.ts`
  (with its test). It says:
  - we keep a list of products you scanned in the last 6 months, with the ingredient details you saw;
  - every Sunday our server asks Open Food Facts for each barcode. Only the barcode is sent, from our server, never
    your details;
  - how to stop: the switch, Stop watching, or deleting the scan, which deletes the watch.
- **Offline emergency card:** no change. Nothing new goes into Dexie, and `/emergency` and its data are untouched.
  The push click handler already opens any app link; an alert opens `/scans/changes/[id]`, which needs a connection,
  like the rest of Scan history.
- **H7:** add `esbuildOptions: { sourcemap: false }` to `createSerwistRoute()` in
  `src/app/serwist/[path]/route.ts`.
  - Check after the build: `/serwist/sw.js.map` returns 404 and `/serwist/sw.js` has no `sourceMappingURL` line.
  - Then the offline test.
  - Update `docs/SECURITY-REVIEW.md` (H7 fixed) and the note in `docs/SECURITY-RULES.md`.

## 12. Files (more than 3, so this is the plan to approve)

- **New:**
  - the migration;
  - `supabase/functions/product-alerts/index.ts`;
  - in `supabase/functions/_shared/`: `run-product-alerts.ts`, `product-change.ts` (key and rule),
    `product-alert-message.ts` (push and email text), with tests;
  - `src/app/(main)/scans/changes/[id]/page.tsx`;
  - a "watch" Server Action and button on the scan result;
  - the Scan history banner;
  - `docs/PHASE-8-SETUP.md` (SQL to run, test snippets).
- **Changed:**
  - `src/lib/allergen/*.ts` (import extensions only) and `tsconfig.json`;
  - `open-food-facts.ts` (User-Agent);
  - `/scans`, `/scans/[id]`;
  - Profile → Reminders;
  - the unsubscribe page and route;
  - `/privacy` and `constants.ts`;
  - the Serwist route;
  - `scripts/rls-two-user.mjs`;
  - the docs (`PROGRESS.md`, `PR_DESCRIPTION.md`, `SECURITY-REVIEW.md`, `SECURITY-RULES.md`).
- **No new dependencies.**

**Commits, in order:**
1. H7
2. imports
3. migration and RLS script
4. the job's pure functions and tests
5. the Edge Function
6. the UI
7. privacy
8. docs

## Decisions for you

1. **Contact in the User-Agent:** which email address should Open Food Facts see? (Or only the site URL.)
2. **Missing data** (section 4): no push or email when the verdict gets worse only because data disappeared, just
   the note on the scan result. Recommended. Or alert anyway?
3. **Stopped stays stopped when you scan again** (section 1). Recommended.
4. **The daily retry call** (section 2). Recommended. Or retry only on the weekly run?
5. **Sunday 08:30 IST** (section 2), or another time?
6. **The unsubscribe link turns off product alerts only** (section 7). Recommended.

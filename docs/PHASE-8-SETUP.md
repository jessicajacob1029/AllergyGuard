# Phase 8 setup and testing: ingredient change alerts

What the project owner runs, in order. All SQL goes in **Supabase → SQL Editor**. No new secrets: the job uses the
Phase 7 ones (`CRON_SECRET`, VAPID, Resend, `APP_URL`) and the same Vault cron secret.

Already done in code (branch `phase-8`):
- the migration file `supabase/migrations/20261103000000_product_alerts.sql`, **not run yet**;
- the Edge Function `product-alerts`, deployed and **not scheduled**. Its self-check passed: the app's own
  `checkAllergens()` runs inside it. Every request without the cron secret gets 403;
- H7: the service worker no longer has a public source map.

---

## 1. Run the migration (you)

Open `supabase/migrations/20261103000000_product_alerts.sql`, copy all of it into the SQL Editor and run it. Expect
"Success. No rows returned". It creates:
- `watched_products`, with your scans from the last 6 months filled in;
- `product_alerts`;
- `product_check_runs`;
- the "Product change alerts" switch (on);
- the scan triggers and the job's functions.

Then tell me. I'll check it read-only, record it in the migration history and run the two-user RLS script
(`node scripts/rls-two-user.mjs`, which deletes its test users).

## 2. Dry run (me)

`{"dryRun": true}` asks Open Food Facts about every watched product and reports what would happen to each one. It
writes nothing and sends nothing.

## 3. A real alert on your phone and laptop (push)

Your account's only allergen is kiwi, which isn't in any product you scanned. So for this test:

1. In the app, **Profile → Allergies**: add **Milk** and **Wheat / gluten**. You'll remove them in step 7.
2. Run this. It makes your saved Amul Butter look like an older version without milk:

   ```sql
   update public.watched_products w
      set snap_ingredients_text = 'Common salt',
          snap_declared_allergens = '{}',
          snap_declared_traces = '{}',
          snap_incomplete = false
    where w.barcode = '8901262010016'
      and w.profile_id in (select p.id from public.profiles p
                             join auth.users u on u.id = p.owner_id
                            where u.email = 'jessicajacob1029@gmail.com');
   ```

   Expect "1 row affected".
3. Tell me. I'll run the job for your account only (`{"onlyEmail": "jessicajacob1029@gmail.com", "force": true}`).
   - **Expect:** one notification on your iPhone (Home Screen app) and laptop: "Amul Pasteurized Butter has
     changed: now Unsafe for you", body "Open Food Facts now lists milk…".
   - **No email:** push was delivered.
   - **Only Amul alerts.** The two Nutellas already listed milk, so they don't; Maggi and the ketchup didn't
     change.
4. **The screens.** Until we merge, the notification opens the live site, which doesn't have the change page yet
   (a 404 is expected there). Check them on the `phase-8` preview instead: sign in on the Vercel preview URL I give
   you.
   - **Scan history:** the banner "1 product you scanned has changed", and the "Changed since" badge on Amul.
   - **The change page:** open it from the banner. Check the before and after verdicts, "now lists milk", the
     "always check the packet" line and the new ingredients.
   - **Back in Scan history:** the banner has gone.
   - **Amul's scan result:** "Watching for changes" and **Stop watching**. Tap it, check the result says "Not
     watching this product", then tap **Watch for changes** again.
5. **Never twice:** I run the job again. Nothing is sent.

## 4. A real alert by email

1. Turn push off for your account without removing your devices, and make Maggi look like it had no wheat:

   ```sql
   update public.reminder_settings set push_enabled = false
    where owner_id = (select id from auth.users where email = 'jessicajacob1029@gmail.com');

   update public.watched_products w
      set snap_ingredients_text = 'Noodles: rice flour, palm oil, salt',
          snap_declared_allergens = '{}',
          snap_declared_traces = '{}',
          snap_incomplete = false
    where w.barcode = '8901058851298'
      and w.profile_id in (select p.id from public.profiles p
                             join auth.users u on u.id = p.owner_id
                            where u.email = 'jessicajacob1029@gmail.com');
   ```

2. Tell me. I'll run it again for your account. **Expect an email:** "Maggi Noodles Masala… has changed: now Unsafe
   for you".
   - It shows before and after, what changed, the warning that Open Food Facts can be wrong, **See the new result**
     and **Turn off product change alerts**.
   - It may land in spam: the Resend test sender.
3. Turn push back on:

   ```sql
   update public.reminder_settings set push_enabled = true
    where owner_id = (select id from auth.users where email = 'jessicajacob1029@gmail.com');
   ```

4. **Optional:** on the preview, open the email's **Turn off product change alerts** link with `/unsubscribe…`
   moved to the preview URL. It asks before doing anything, and says medication reminders aren't affected. Turn
   the switch back on in Profile → Reminders afterwards.

## 5. An improvement doesn't alert

```sql
update public.watched_products w
   set snap_declared_allergens = '{milk}'
 where w.barcode = '8901030865237'
   and w.profile_id in (select p.id from public.profiles p
                          join auth.users u on u.id = p.owner_id
                         where u.email = 'jessicajacob1029@gmail.com');
```

That makes the ketchup look like it used to declare milk. When I run the job: nothing is sent, the ketchup's
status becomes `improved`, and its snapshot goes back to the real data.

## 6. What's covered by tests instead

These parts are covered by tests, not live runs:
- **The safety brake** (more than 20% of products, and at least 5, would alert): there aren't enough products to
  trigger it live. It's tested with 10 fake products, and only one notice email goes out, to
  jessicajacob1029@gmail.com.
- Stopping on 429, the 1.5-second spacing, and retries.

## 7. Clean up (you)

- **Profile → Allergies:** remove Milk and Wheat / gluten.
- The two test alerts stay in your Scan history as a record. They'll be marked seen once you've opened them.

## 8. After the merge: schedules (you)

Run once, after we merge to the fork's `main`:

```sql
-- Weekly check: Sunday 08:30, 08:45, 09:00, 09:15 IST (03:00–03:45 UTC). Each call checks up to 60 products;
-- the later calls only find products the earlier ones didn't reach.
select cron.schedule(
  'product-alerts',
  '*/15 3 * * 0',
  $$
  select net.http_post(
    url := 'https://vwnwevrwoitvnsspudqe.supabase.co/functions/v1/product-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'medication_reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Daily retry of failed alerts: 08:35 IST (03:05 UTC). No Open Food Facts requests.
select cron.schedule(
  'product-alerts-retry',
  '5 3 * * *',
  $$
  select net.http_post(
    url := 'https://vwnwevrwoitvnsspudqe.supabase.co/functions/v1/product-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'medication_reminders_cron_secret')
    ),
    body := '{"retryOnly": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

To stop either one: `select cron.unschedule('product-alerts');` or `select cron.unschedule('product-alerts-retry');`.

**When the safety brake holds a run:**
- nothing is sent to users;
- the watches show `held`;
- a row in `product_check_runs` has `held = true`;
- jessicajacob1029@gmail.com gets an email listing the products.

They're checked again the next week. To see recent runs:

```sql
select created_at, mode, checked, would_alert, alerted, held, details
  from public.product_check_runs order by created_at desc limit 10;
```

## 9. Offline check before merging (CLAUDE.md)

H7 changes how the service worker is built. Check the emergency card with the network off, on the laptop (I do it on
a local production build) and on your phone's Home Screen app after the merge.

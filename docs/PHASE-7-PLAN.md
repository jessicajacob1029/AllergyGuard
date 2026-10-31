# Phase 7 plan: medication expiry reminders

Status: **awaiting approval** (2026-10-31). Nothing is built yet. Branch `phase-7` (from the fork's `main`, `cf2cbd4`),
pushed to the fork only.

Done when (from PLAN.md):
- A medication set to expire in 7 days triggers a notification in testing.
- Settings let the user turn notifications on or off.

## 1. When reminders are sent

Every morning at **08:00 IST** the job looks at every medication that has an expiry date and works out
`daysLeft = expiry_date − today (in IST)`.

| Stage | Sent when `daysLeft` is | Message |
|---|---|---|
| `30d` | 8 to 30 | "Your EpiPen expires in 23 days (on 23 Nov)." |
| `7d` | 2 to 7 | "Your EpiPen expires in 7 days…" |
| `1d` | 1 | "Your EpiPen expires tomorrow…" |
| `today` | 0 | "Your EpiPen expires today. Replace it as soon as you can." |

- **Each stage is sent at most once** per medication and expiry date (a unique row in `medication_reminders`; see 5).
  If the date is changed (a new pack), the stages start again for the new date.
- **Windows, not exact days**, so a missed run or a medication added late still gets one reminder: a medication
  added with 5 days left gets the `7d` reminder once and skips `30d`. Only the most urgent stage due is sent,
  so nobody gets two messages on the same day.
- **Already expired before it was added:** no message. The Home banner and the emergency card already
  show "Expired".
- **"Expired today":** the final reminder goes out on the expiry date itself ("expires today"). From the next day the
  medication counts as expired, which matches `isExpired()` and the emergency card.

The stage rule is one small pure function, `reminderStage(daysLeft, alreadySent)`, with tests. Like
`validateOccurredAt()`, I suggest you write it (5 to 10 lines); I'll set up the file, signature and tests.

## 2. Web push

**Subscribing (only after a tap, never on page load):**
1. In Profile → Reminders, the "Notifications on this device" row explains what you'll get, then shows a
   **Turn on notifications** button.
2. The tap calls `Notification.requestPermission()`, then
   `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, using our existing
   Serwist service worker.
3. The subscription (endpoint plus `p256dh` and `auth` keys) is saved to `push_subscriptions` by a Server Action.
   One row per device; turning it off unsubscribes the browser and deletes the row.
4. A **Send a test notification** button proves it works.

**What each device can do:**

| Device | Push | What the user sees |
|---|---|---|
| Android (Chrome, Edge, Samsung), in the browser or installed | Yes | Normal button |
| Desktop Chrome, Edge, Firefox; Safari on macOS 13+ | Yes | Normal button |
| iPhone/iPad, **installed to the Home Screen**, iOS/iPadOS 16.4+ | Yes | Normal button |
| iPhone/iPad in a Safari tab, or iOS below 16.4 | No (no `PushManager`) | "To get notifications on iPhone, add AllergyGuard to your Home Screen (Share → Add to Home Screen) and open it from there. Email reminders work everywhere." |
| Permission was blocked | No | How to allow it again in the browser or iPhone settings |

**VAPID keys:**
- **You generate them on your laptop** with `npx web-push generate-vapid-keys`. Nothing gets installed in the project.
- **The private key** goes only into Supabase Edge Function secrets. It never goes in the repo, never in Vercel, and never in chat.
- **The public key isn't secret**, but CLAUDE.md allows only the two Supabase variables in the browser. So it goes into Vercel as a server-only `VAPID_PUBLIC_KEY`, and the page passes it to the button as a prop. That avoids adding a new `NEXT_PUBLIC_` variable.

**Service worker (`src/app/sw.ts`):**
- add a `push` listener that shows the notification:
  - title "AllergyGuard";
  - the message as the body;
  - the app icon;
  - `tag` = medication + stage, so a repeat replaces the old notification instead of stacking;
- add a `notificationclick` listener that focuses an open app window, or opens `/profile#medications`.

The precache, the network-only rule for pages, and `/emergency` don't change.

## 3. Email fallback (Resend)

**Rule:**
- If push is on, push goes to every device.
- If email reminders are on, an email is sent when push is off, or when no device accepted the push.
- Every reminder therefore reaches you once, by push or by email.

**What you set up:**
1. A Resend account (resend.com, free tier: 100 emails a day).
2. An API key with "Sending access" only. It goes into Supabase Edge Function secrets as `RESEND_API_KEY`.
3. A sender. You have two choices:
   - **For the demo:** Resend's test sender `onboarding@resend.dev`. It can only email the address that owns the Resend account, so set the account up with jessicajacob1029@gmail.com.
   - **For real users:** a domain you own, verified in Resend with the DNS records it gives you. A `vercel.app` address can't be verified.

**Email content:**
- plain text plus a simple HTML version, and no images (they're often blocked);
- subject: "Your EpiPen expires in 7 days";
- body: the medication and dose, the expiry date, and "Replace it before it expires. Allergy medication may not
  work properly after its expiry date.";
- a link to update the date in Profile, and "AllergyGuard is an aid, not medical advice.";
- footer: "You're getting this because email reminders are on." followed by **Turn off email reminders** (the unsubscribe link).
- the email headers will include `List-Unsubscribe` and `List-Unsubscribe-Post`, so Gmail shows its own one-click
  Unsubscribe.

**Unsubscribe link:** `/unsubscribe?token=…`. Each person has a random token, and no sign-in is needed.
- The page has a **Turn off email reminders** button, so it doesn't switch anything off just from being opened. Email scanners open links automatically.
- The button calls a `security definer` function, `unsubscribe_email(token)`. Only that function is allowed to anonymous visitors.

## 4. The daily job: recommendation

**Recommended: Supabase pg_cron → `pg_net` HTTP call → an Edge Function `medication-reminders`.**

Why:
- **It's what PLAN.md and CLAUDE.md already name**, and both extensions are available on the project. They're not switched on yet, so the migration turns them on.
- **Exact timing.** `30 2 * * *` (cron runs in UTC) is **08:00 IST**, every day. On the Hobby plan, Vercel cron runs once a day at some point within the hour.
- **Fewer places for secrets.** The job needs the service role key to read every user's medications. Edge Functions get that key automatically. A Vercel cron would mean putting the service role key into Vercel.
- **The work stays next to the data,** and it doesn't depend on whichever Vercel project is deploying the app.

Trade-offs:
- The Edge Function runs on Deno and is deployed separately (I'd deploy it through the Supabase connector, with your approval).
- Its logs are in Supabase, not Vercel.

**Protecting the function:**
- pg_cron sends a `CRON_SECRET` header. The secret's value lives in Supabase Vault (the cron SQL reads it by name), and the function checks it against its own copy.
- The function rejects any call without the secret.
- **You create the secret yourself in the dashboard**, so it never passes through me.

**The function, step by step:**
1. Calls one SQL function, `due_medication_reminders(today)`, which only the service role can run. It returns each medication with an expiry date that is due, plus its owner's settings and email.
2. Works out the stage.
3. Claims each reminder by inserting its row, using `on conflict do nothing`, and only sends if the insert went through. **This is what makes double sending impossible**, even if the job runs twice.
4. Sends push, then email if needed, and records the result.
5. Deletes push subscriptions that the push service reports as gone (404 or 410).

Delivery is at most once: a send that fails is recorded and not retried the same day. That's better than a
reminder sent twice.

**Time zone:** reminders are worked out on IST dates, because every user is in India for now. Showing the dates on the phone stays as it is (`LocalTime`). Supporting other time zones later would need a time zone saved on each profile.

## 5. Database (migration `20261101000000_medication_reminders.sql`)

- **Switch on extensions:** `pg_cron` and `pg_net`.
- **New enum `reminder_stage`:** `30d`, `7d`, `1d`, `today`.
- **`reminder_settings`**, one row per account (`owner_id` primary key → `auth.users`):
  - `push_enabled` (default false);
  - `email_enabled` (default **true**, see open question 1);
  - `unsubscribe_token` (a random uuid, unique);
  - `updated_at`.
  - RLS: select and update your own row. The row is created on first save (insert own).
- **`push_subscriptions`:**
  - `id`, `owner_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`.
  - RLS: select, insert and delete your own. There's no update; changing a device's subscription means deleting and re-adding it.
- **`medication_reminders`** (what was sent):
  - `id`, `medication_id` (cascade), `profile_id`, `expiry_date`, `stage`, `created_at`, `push_result`, `email_result`;
  - **unique (`medication_id`, `expiry_date`, `stage`)**.
  - RLS: select your own, through `profiles.owner_id`. Users can't insert, update or delete; only the job writes, using the service role.
- **Functions:**
  - `due_medication_reminders(today date)`: `security definer`, empty `search_path`, can be run by `service_role` only.
  - `unsubscribe_email(token uuid)`: `security definer`, can be run by `anon` and `authenticated`, and changes only `email_enabled`.
- **Schedule:** the `cron.schedule('medication-reminders', '30 2 * * *', …)` call isn't in the migration. It's a separate SQL step after you've created the Vault secret, because it needs the function URL and the secret's name.

All three tables are owned through `owner_id` or `profiles`. Reminder settings belong to the account, because the account is who gets the message, and that still works for family profiles later. They get the same two-user RLS test as Phase 6.

## 6. Profile settings

A new **Reminders** card in Profile. On desktop it sits in the right column, under Emergency contacts.
- **Email reminders:** on/off switch, plus the email address they go to.
- **Notifications on this device:** the explanation, the Turn on button, the states from the device table above,
  Send a test notification, and Turn off.
- The line "Reminders are sent 30, 7 and 1 days before, and on the expiry date, at 8 am."
- The medications section links here ("Get reminders"). Today it says "Add an expiry date to get reminders later."

## 7. Home banner

- **Red:** "Your EpiPen expired on 12 Oct. Replace it and update the date." The expiry date is before today.
- **Amber:** "Your EpiPen expires in 5 days (5 Nov)." The expiry date is within 30 days, including today.
- Several medications share one banner with a count ("2 medications need attention") and a link to Profile.
- No banner when nothing is due. It sits at the top of the Home grid on desktop.
- `medicationAlerts(medications, today)` is a pure function with tests. "Today" is the phone's date, like
  `LocalTime`, so the banner is never a day off.

## 8. Testing without waiting 30 days

1. **Unit tests (Vitest):**
   - `reminderStage()`: every boundary (31, 30, 8, 7, 2, 1, 0, −1), plus catch-up and stages already sent;
   - `medicationAlerts()`;
   - the email text, the unsubscribe link and its headers;
   - the push and notification-click handlers;
   - the Reminders card in every state: unsupported, iPhone not installed, permission blocked, on, off.
2. **A test date for the function:** the function accepts `{ "today": "2026-11-01", "dryRun": true }` only alongside the cron secret. With that we can:
   - pretend it's any day;
   - list what would be sent without sending;
   - then do a real send.
3. **QA account only:**
   - set a medication to expire in 7 days and run the function, which sends the `7d` push and email;
   - **run it again: nothing is sent** (the no-repeat check);
   - change the expiry date: the new date gets its own reminders;
   - unsubscribe from the email, then run it: push only.
4. **Two-user RLS test** for the three new tables, using the anon key like the app, like Phase 6.
5. **Offline test**, because `sw.ts` changes. In DevTools Offline mode (and with Playwright's real network cut), `/emergency` must still load the card on laptop and phone widths.
6. **Cron check:** schedule the job a few minutes ahead once, confirm a run in `cron.job_run_details`, then
   set it back to 08:00 IST.

## 9. What needs you

1. **Approve this plan,** and answer the open questions below.
2. **Generate the VAPID keys** (`npx web-push generate-vapid-keys`), then add these secrets:
   - in Supabase → Edge Functions → Secrets:
     - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`;
     - `VAPID_SUBJECT` = `mailto:jessicajacob1029@gmail.com`;
     - `RESEND_API_KEY`;
     - `REMINDER_FROM`;
     - `CRON_SECRET`;
   - in Vercel (Production and Preview, server only): `VAPID_PUBLIC_KEY`;
   - in Supabase → Vault: the same `CRON_SECRET` value, named `medication_reminders_cron_secret`.
3. **Set up a Resend account and API key,** and choose a sender (see 3).
4. **Approve** the migration, the Edge Function deploy and the cron schedule when the prompts come up.
5. **Phone test:**
   - install the app to the Home Screen on your iPhone (iOS 16.4+) and turn on notifications;
   - receive the test notification, and the 7-day reminder from the test run;
   - tap it, and it opens Profile;
   - check that the emergency card still works offline afterwards.

## 10. Dependencies and the emergency card

- **Next.js app: no new dependencies.** The Push API, the Notification API and the service worker are all built into the browser.
- **Edge Function: one new dependency, `npm:web-push@3.6.7`**, imported by Deno and pinned to that version. It isn't in `package.json`.
  - Why: push messages must be encrypted (RFC 8291) and signed (VAPID, RFC 8292), and hand-writing that encryption is a bad idea.
  - If it doesn't run on Supabase's Deno, the fallback is `jsr:@negrel/webpush`, which was written for Deno. I'll check this first and tell you.
- **Resend:** called with a plain `fetch` to its REST API, so no SDK.
- **Lint and typecheck:** `supabase/functions/**` is Deno code, so it's left out of the Next.js `tsconfig` and ESLint.
  The shared pure files (`supabase/functions/_shared/*.ts`) don't use anything Deno-specific, so Vitest still tests them.
- **Emergency card:** its data, Dexie and `/emergency` don't change. `sw.ts` gets two new event listeners, which counts as a service worker change, so the offline test in 8.5 is required before merging.

## 11. Privacy page

The Privacy page must change in the same branch:
- push subscriptions are stored per device;
- reminder emails are sent through Resend, which receives your email address and the medication name;
- how to turn reminders off.

The "Last updated" date changes too.

## Open questions

1. **Email reminders on by default?**
   - **Recommended: on** for anyone who has a medication with an expiry date. It's a safety reminder, and every email has a one-click way to turn it off.
   - Off would mean nobody gets reminders unless they find the setting.
2. **Sender for now:** Resend's test sender, which only emails your own address and is fine for the demo, or a domain you own?
3. **Should you write `reminderStage()`?** Recommended: yes, you write it and I set up the file and tests.

## Commits (planned, about 9)

1. Migration, plus types and RLS test notes.
2. `reminderStage()` and its tests (your part).
3. Edge Function: due reminders, claiming, sending push and email, dry run.
4. Email template, unsubscribe page and function.
5. Service worker push and notification-click handlers.
6. Profile Reminders card: subscribing and the test notification.
7. Home banner and `medicationAlerts()`.
8. Privacy page update.
9. Docs (PROGRESS.md, PR_DESCRIPTION.md).

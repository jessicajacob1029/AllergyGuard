# Phase 7 setup: keys and secrets

What the project owner sets up for medication reminders. **Never paste these values into chat, a commit or a
`.env` file in the repo.** Every value below goes straight into a dashboard.

Already done in code (branch `phase-7`):
- the migration `20261031173904_medication_reminders` (applied 2026-10-31);
- the Edge Functions `medication-reminders` and `send-test-push` (deployed). Without the secrets below, both do
  nothing useful. `medication-reminders` refuses every request without the cron secret (403).

---

## 1. Make the VAPID keys (web push)

On your laptop, in Terminal, in any folder:

```sh
npx web-push@3.6.7 generate-vapid-keys
```

npx downloads web-push into a temporary cache; nothing is added to the project. It prints a **Public Key** and a
**Private Key**. Keep the Terminal window open for steps 4 and 6.

## 2. Make the cron secret

In the same Terminal:

```sh
openssl rand -hex 32
```

This prints 64 random characters. It's used in two places (steps 4 and 5) and must be identical in both.

## 3. Resend account and API key (email)

1. Sign up at https://resend.com.
   - **The test sender (`onboarding@resend.dev`) can only email the address the Resend account belongs to.**
   - To test with the QA account, sign up with `jessicajacob1029+qa@gmail.com`. Its emails arrive in your normal Gmail inbox.
   - If Resend won't accept the `+qa` address, use your main address. Reminder emails to the QA account will then fail with a Resend error, which is recorded in `medication_reminders.email_result`. Push still works.
2. In Resend, go to **API Keys → Create API Key**:
   - Name: `allergyguard-reminders`
   - Permission: **Sending access** (not Full access)
   - Domain: All domains
3. Copy the key, which starts with `re_`. Resend shows it only once.

Later, to email anyone: add a domain you own in Resend → Domains, add the DNS records it gives you, then change
`REMINDER_FROM` (step 4) to an address on that domain.

## 4. Supabase Edge Function secrets

Supabase dashboard → project **allergyguard** → **Edge Functions** → **Secrets** (also under Project Settings →
Edge Functions). Add each one with **Add new secret**:

| Name | Value |
|---|---|
| `CRON_SECRET` | the 64 characters from step 2 |
| `VAPID_PUBLIC_KEY` | Public Key from step 1 |
| `VAPID_PRIVATE_KEY` | Private Key from step 1 |
| `VAPID_SUBJECT` | `mailto:jessicajacob1029@gmail.com` |
| `RESEND_API_KEY` | the `re_…` key from step 3 |
| `REMINDER_FROM` | `AllergyGuard <onboarding@resend.dev>` |
| `APP_URL` | `https://allergy-guard-nine.vercel.app` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are already provided by Supabase. Don't add
them.

## 5. Supabase Vault: the cron secret again

pg_cron reads the secret from Vault, so the cron SQL never contains the value.

Supabase dashboard → **Project Settings → Vault** (or **Integrations → Vault**) → **Add new secret**:
- Name: `medication_reminders_cron_secret` (exactly this)
- Secret: the same 64 characters as `CRON_SECRET`

## 6. Vercel: the public key for the app

Vercel → your AllergyGuard project → **Settings → Environment Variables → Add**:
- Key: `VAPID_PUBLIC_KEY` (no `NEXT_PUBLIC_` prefix: the server reads it and passes it to the page)
- Value: the Public Key from step 1
- Environments: **Production** and **Preview**

Then redeploy the `phase-7` preview: Deployments → the latest `phase-7` deployment → ⋯ → **Redeploy**. Until
then, Profile → Reminders says "Notifications aren't set up yet".

## 7. Tell me it's done

Say "Phase 7 secrets are set". You don't need to send any values. I'll then:
1. redeploy `medication-reminders` with your `reminderStage()`;
2. run its self-check (proves web push encryption works on Supabase) and a dry run. I call it from the database
   with `pg_net`, reading the secret from Vault, so I never see it;
3. on the **QA account only**, do the real 7-day test: its `epipen` expires on 7 Nov 2026, which is 7 days after
   31 Oct. Then run it again to show nothing is sent twice, test unsubscribe, and run the two-user RLS test;
4. schedule the daily job (below) after you approve it.

### The schedule (for reference; I run it after approval)

```sql
select cron.schedule(
  'medication-reminders',
  '30 2 * * *',  -- 02:30 UTC = 08:00 IST (pg_cron runs in UTC)
  $$
  select net.http_post(
    url := 'https://vwnwevrwoitvnsspudqe.supabase.co/functions/v1/medication-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'medication_reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 5;`. Stop it with
`select cron.unschedule('medication-reminders');`.

## 8. Phone test (you)

1. **Before the merge:** test on the `phase-7` preview in Chrome on your laptop (push works there in a normal
   tab). **iPhone:** the Home Screen app is installed from production, so the iPhone test happens after the
   merge. iOS 16.4 or later: open `allergy-guard-nine.vercel.app` in Safari, Share → **Add to Home Screen**,
   and open AllergyGuard from the Home Screen. Push doesn't work in a Safari tab.
2. Log in, then Profile → Reminders → **Turn on notifications** → Allow.
3. **Send a test notification**: it should appear within seconds. Tap it: Profile opens.
4. After my 7-day test run on the QA account, you get "Your epipen expires in 7 days".
5. Settings → Wi-Fi off: the emergency card still opens from the Emergency button.

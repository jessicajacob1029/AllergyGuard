-- Phase 7: medication expiry reminders (web push + email).
--
-- - reminder_settings: one row per account (who receives the reminders):
--   push and email on/off, and a long random token for the email's
--   unsubscribe link (works without logging in).
-- - push_subscriptions: one row per device that turned notifications on.
-- - medication_reminders: one row per reminder sent. The unique key
--   (medication, expiry date, stage) is what stops a reminder from ever being
--   sent twice: the daily job inserts the row first and only sends if the
--   insert went through.
--
-- The daily job (Edge Function medication-reminders, scheduled with pg_cron)
-- uses the service role. The cron schedule itself is NOT in this migration: it
-- needs the Vault secret, which the project owner creates in the dashboard
-- (see docs/PHASE-7-SETUP.md).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create type public.reminder_stage as enum ('30d', '7d', '1d', 'today');

-- ---------------------------------------------------------------------------
-- reminder_settings
-- ---------------------------------------------------------------------------

create table public.reminder_settings (
  owner_id          uuid primary key references auth.users (id) on delete cascade,
  push_enabled      boolean not null default false,
  -- On by default (agreed 2026-10-31): a safety reminder, and every email has
  -- a one-click way to turn it off.
  email_enabled     boolean not null default true,
  -- 32 random bytes as 64 hex characters.
  unsubscribe_token text not null unique
                    default encode(extensions.gen_random_bytes(32), 'hex')
                    check (unsubscribe_token ~ '^[0-9a-f]{64}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger reminder_settings_set_updated_at
  before update on public.reminder_settings
  for each row execute function public.set_updated_at();

alter table public.reminder_settings enable row level security;

create policy "reminder_settings_select_own" on public.reminder_settings
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "reminder_settings_insert_own" on public.reminder_settings
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "reminder_settings_update_own" on public.reminder_settings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Users may only set the two switches; the token is always generated here.
revoke all on public.reminder_settings from anon, authenticated;
grant select on public.reminder_settings to authenticated;
grant insert (owner_id, push_enabled, email_enabled) on public.reminder_settings to authenticated;
grant update (push_enabled, email_enabled) on public.reminder_settings to authenticated;

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  -- The push service URL for one browser. Unique: a browser belongs to whoever
  -- turned notifications on in it last (see save_push_subscription).
  endpoint   text not null unique
             check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  p256dh     text not null check (char_length(p256dh) between 1 and 200),
  auth_key   text not null check (char_length(auth_key) between 1 and 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index push_subscriptions_owner_id_idx on public.push_subscriptions (owner_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Adding or replacing a device goes through save_push_subscription() only.
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- medication_reminders (what was sent)
-- ---------------------------------------------------------------------------

create table public.medication_reminders (
  id            uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  -- The expiry date the reminder was about: a new date starts a new set.
  expiry_date   date not null,
  stage         public.reminder_stage not null,
  push_result   text check (push_result is null or char_length(push_result) <= 300),
  email_result  text check (email_result is null or char_length(email_result) <= 300),
  created_at    timestamptz not null default now(),
  constraint medication_reminders_once unique (medication_id, expiry_date, stage)
);

create index medication_reminders_profile_id_idx on public.medication_reminders (profile_id);

alter table public.medication_reminders enable row level security;

create policy "medication_reminders_select_own" on public.medication_reminders
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())));

-- Written only by the daily job (service role).
revoke all on public.medication_reminders from anon, authenticated;
grant select on public.medication_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Adds this browser's subscription for the signed-in user, or moves it to them
-- if another account used this browser before.
create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (owner_id, endpoint, p256dh, auth_key, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth_key, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set owner_id = excluded.owner_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- The unsubscribe link: turns email reminders off for the token's account.
-- Works without logging in. Returns whether a row was changed.
create function public.unsubscribe_email(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.reminder_settings
       set email_enabled = false
     where unsubscribe_token = p_token
       and p_token ~ '^[0-9a-f]{64}$'
    returning 1
  )
  select exists (select 1 from changed);
$$;

revoke execute on function public.unsubscribe_email(text) from public;
grant execute on function public.unsubscribe_email(text) to anon, authenticated;

-- For the daily job only: every medication with an expiry date from today to
-- 30 days ahead (IST date passed in), with the stages already sent for that
-- date and the owner's settings. Medications without an expiry date are never
-- returned. The email is only given for a confirmed address. Creates default
-- settings rows (email on, push off) for owners who have none yet.
create function public.due_medication_reminders(p_today date)
returns table (
  medication_id     uuid,
  profile_id        uuid,
  owner_id          uuid,
  name              text,
  dose              text,
  expiry_date       date,
  sent_stages       public.reminder_stage[],
  email             text,
  email_enabled     boolean,
  push_enabled      boolean,
  unsubscribe_token text
)
language sql
security definer
set search_path = ''
as $$
  insert into public.reminder_settings (owner_id)
  select distinct p.owner_id
    from public.medications m
    join public.profiles p on p.id = m.profile_id
   where m.expiry_date between p_today and p_today + 30
  on conflict do nothing;

  select m.id,
         m.profile_id,
         p.owner_id,
         m.name,
         m.dose,
         m.expiry_date,
         array(select r.stage
                 from public.medication_reminders r
                where r.medication_id = m.id
                  and r.expiry_date = m.expiry_date),
         case when u.email_confirmed_at is not null then u.email::text end,
         s.email_enabled,
         s.push_enabled,
         s.unsubscribe_token
    from public.medications m
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.owner_id
    join public.reminder_settings s on s.owner_id = p.owner_id
   where m.expiry_date is not null
     and m.expiry_date between p_today and p_today + 30
   order by p.owner_id, m.expiry_date;
$$;

revoke execute on function public.due_medication_reminders(date) from public, anon, authenticated;
grant execute on function public.due_medication_reminders(date) to service_role;

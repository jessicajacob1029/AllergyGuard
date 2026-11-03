-- Phase 8: ingredient change alerts (docs/PHASE-8-PLAN.md).
--
-- - watched_products: one row per profile and barcode, created by a trigger
--   when a barcode scan finds the product. Holds the snapshot the user last
--   saw (ingredient text, Open Food Facts allergen and traces tags, the
--   "incomplete" flag). The weekly job compares Open Food Facts with it.
--   Whether two versions differ is worked out in TypeScript only
--   (supabase/functions/_shared/product-change.ts), never here.
-- - product_alerts: one row per change worth telling the user about. Unique
--   on (watch, change_key), so the same change can never alert twice.
--   Delivery status works like medication_reminders (sending, delivered,
--   failed; failed ones are retried).
-- - product_check_runs: one row per job run (for the owner only; users have
--   no access). Records when the safety brake held a run's alerts.
-- - reminder_settings.product_alerts_enabled: the switch, on by default.
--
-- Does not touch the scans table's columns or checks (Phase 5 changes them).
-- The schedules are NOT in this migration (they need the Vault secret); see
-- docs/PHASE-8-SETUP.md.

-- ---------------------------------------------------------------------------
-- reminder_settings: the switch
-- ---------------------------------------------------------------------------

alter table public.reminder_settings
  add column product_alerts_enabled boolean not null default true;

grant insert (product_alerts_enabled) on public.reminder_settings to authenticated;
grant update (product_alerts_enabled) on public.reminder_settings to authenticated;

-- ---------------------------------------------------------------------------
-- watched_products
-- ---------------------------------------------------------------------------

create table public.watched_products (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles (id) on delete cascade,
  barcode                 text not null check (barcode ~ '^[0-9]{8,14}$'),
  product_name            text check (product_name is null or char_length(product_name) <= 500),
  brands                  text check (brands is null or char_length(brands) <= 500),
  -- The user's "Stop watching" / "Watch for changes" button.
  watching                boolean not null default true,
  -- Only products scanned in the last 6 months are checked.
  last_scanned_at         timestamptz not null,
  last_scan_id            uuid references public.scans (id) on delete set null,
  -- The snapshot: what the user last saw.
  snap_ingredients_text   text check (snap_ingredients_text is null or char_length(snap_ingredients_text) <= 20000),
  snap_declared_allergens text[] not null default '{}',
  snap_declared_traces    text[] not null default '{}',
  snap_incomplete         boolean not null default false,
  snap_off_last_modified  timestamptz,
  snap_updated_at         timestamptz not null default now(),
  -- The last check by the weekly job.
  last_checked_at         timestamptz,
  last_check_status       text check (last_check_status in (
                            'unchanged',      -- same data (formatting changes ignored)
                            'changed',        -- different data, same verdict, nothing new
                            'improved',       -- safer than before
                            'alerted',        -- worse for the user: an alert was made
                            'held',           -- would alert, but the safety brake held the run
                            'not_found',      -- Open Food Facts no longer has the product
                            'no_ingredients', -- found, but no ingredient list
                            'data_incomplete' -- worse only because the data is now incomplete
                          )),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint watched_products_one_per_profile unique (profile_id, barcode)
);

create trigger watched_products_set_updated_at
  before update on public.watched_products
  for each row execute function public.set_updated_at();

alter table public.watched_products enable row level security;

create policy "watched_products_select_own" on public.watched_products
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())));

create policy "watched_products_update_own" on public.watched_products
  for update to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.owner_id = (select auth.uid())));

-- Users may read their watches and only flip `watching`. Rows are created by
-- the scan trigger and updated by the job (service role).
revoke all on public.watched_products from anon, authenticated;
grant select on public.watched_products to authenticated;
grant update (watching) on public.watched_products to authenticated;

-- ---------------------------------------------------------------------------
-- product_alerts
-- ---------------------------------------------------------------------------

create table public.product_alerts (
  id                 uuid primary key default gen_random_uuid(),
  watched_product_id uuid not null references public.watched_products (id) on delete cascade,
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  barcode            text not null check (barcode ~ '^[0-9]{8,14}$'),
  product_name       text check (product_name is null or char_length(product_name) <= 500),
  brands             text check (brands is null or char_length(brands) <= 500),
  -- SHA-256 (hex) of the new data and the new verdict.
  change_key         text not null check (change_key ~ '^[0-9a-f]{64}$'),
  old_verdict        public.scan_verdict not null,
  new_verdict        public.scan_verdict not null,
  -- What changed: [{ allergen, kind, text }].
  changes            jsonb not null default '[]',
  -- "now lists milk (whey)".
  summary            text not null check (char_length(summary) between 1 and 500),
  -- The new result, shown on /scans/changes/[id] (same shape as scans.result).
  result             jsonb not null,
  ingredients_text   text check (ingredients_text is null or char_length(ingredients_text) <= 20000),
  declared_allergens text[] not null default '{}',
  declared_traces    text[] not null default '{}',
  data_notes         text[] not null default '{}',
  off_last_modified  timestamptz,
  status             public.reminder_status not null default 'sending',
  attempts           integer not null default 1 check (attempts >= 1),
  push_result        text check (push_result is null or char_length(push_result) <= 300),
  email_result       text check (email_result is null or char_length(email_result) <= 300),
  -- Set when the user opens the change page (the Scan history banner goes away).
  seen_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint product_alerts_once unique (watched_product_id, change_key)
);

create index product_alerts_profile_created_idx on public.product_alerts (profile_id, created_at desc);

create trigger product_alerts_set_updated_at
  before update on public.product_alerts
  for each row execute function public.set_updated_at();

alter table public.product_alerts enable row level security;

create policy "product_alerts_select_own" on public.product_alerts
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())));

create policy "product_alerts_update_own" on public.product_alerts
  for update to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p
                      where p.id = profile_id and p.owner_id = (select auth.uid())));

-- Users may read their alerts and only mark them seen. Written by the job.
revoke all on public.product_alerts from anon, authenticated;
grant select on public.product_alerts to authenticated;
grant update (seen_at) on public.product_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- product_check_runs (owner only: no user access at all)
-- ---------------------------------------------------------------------------

create table public.product_check_runs (
  id         uuid primary key default gen_random_uuid(),
  mode       text not null check (mode in ('check', 'retry')),
  one_account boolean not null default false,
  checked    integer not null default 0,
  would_alert integer not null default 0,
  alerted    integer not null default 0,
  held       boolean not null default false,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.product_check_runs enable row level security;
revoke all on public.product_check_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scan triggers: a barcode scan that found the product starts (or refreshes)
-- the watch; deleting the last scan of a product deletes its watch.
-- ---------------------------------------------------------------------------

create function public.watch_scanned_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.barcode is null or not new.product_found then
    return new;
  end if;
  -- A new scan replaces the snapshot (it's what the user saw last). `watching`
  -- is left alone: a stopped watch stays stopped.
  insert into public.watched_products as w (
    profile_id, barcode, product_name, brands, last_scanned_at, last_scan_id,
    snap_ingredients_text, snap_declared_allergens, snap_declared_traces,
    snap_incomplete, snap_off_last_modified, snap_updated_at
  ) values (
    new.profile_id, new.barcode, new.product_name, new.brands, new.created_at, new.id,
    new.ingredients_text, new.declared_allergens, new.declared_traces,
    cardinality(new.data_notes) > 0, new.off_last_modified, now()
  )
  on conflict (profile_id, barcode) do update
    set product_name            = excluded.product_name,
        brands                  = excluded.brands,
        last_scanned_at         = excluded.last_scanned_at,
        last_scan_id            = excluded.last_scan_id,
        snap_ingredients_text   = excluded.snap_ingredients_text,
        snap_declared_allergens = excluded.snap_declared_allergens,
        snap_declared_traces    = excluded.snap_declared_traces,
        snap_incomplete         = excluded.snap_incomplete,
        snap_off_last_modified  = excluded.snap_off_last_modified,
        snap_updated_at         = now(),
        last_check_status       = null;
  return new;
end;
$$;

create trigger scans_watch_product
  after insert on public.scans
  for each row execute function public.watch_scanned_product();

create function public.unwatch_deleted_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.barcode is null then
    return old;
  end if;
  if not exists (select 1 from public.scans s
                  where s.profile_id = old.profile_id
                    and s.barcode = old.barcode
                    and s.product_found) then
    delete from public.watched_products w
     where w.profile_id = old.profile_id and w.barcode = old.barcode;
  end if;
  return old;
end;
$$;

create trigger scans_unwatch_product
  after delete on public.scans
  for each row execute function public.unwatch_deleted_product();

revoke execute on function public.watch_scanned_product() from public, anon, authenticated;
revoke execute on function public.unwatch_deleted_product() from public, anon, authenticated;

-- Backfill: one watch per profile and product from the last 6 months of scans,
-- with the latest scan as the snapshot.
insert into public.watched_products (
  profile_id, barcode, product_name, brands, last_scanned_at, last_scan_id,
  snap_ingredients_text, snap_declared_allergens, snap_declared_traces,
  snap_incomplete, snap_off_last_modified
)
select distinct on (s.profile_id, s.barcode)
       s.profile_id, s.barcode, s.product_name, s.brands, s.created_at, s.id,
       s.ingredients_text, s.declared_allergens, s.declared_traces,
       cardinality(s.data_notes) > 0, s.off_last_modified
  from public.scans s
 where s.product_found
   and s.barcode is not null
   and s.created_at > now() - interval '6 months'
 order by s.profile_id, s.barcode, s.created_at desc
on conflict (profile_id, barcode) do nothing;

-- ---------------------------------------------------------------------------
-- Functions for the weekly job (service role only)
-- ---------------------------------------------------------------------------

-- Watches due for a check: watching, scanned in the last 6 months, not checked
-- in the last 6 days (p_force skips that, for testing), owner's alerts on.
-- At most p_limit different barcodes (one Open Food Facts request each).
-- Includes the profile's allergens in checkAllergens() form and the owner's
-- channels. Creates default settings rows for owners who have none yet.
create function public.due_product_checks(
  p_limit integer default 60,
  p_only_email text default null,
  p_force boolean default false
)
returns table (
  watch_id                uuid,
  profile_id              uuid,
  owner_id                uuid,
  barcode                 text,
  product_name            text,
  brands                  text,
  snap_ingredients_text   text,
  snap_declared_allergens text[],
  snap_declared_traces    text[],
  snap_incomplete         boolean,
  allergens               jsonb,
  email                   text,
  email_enabled           boolean,
  push_enabled            boolean,
  unsubscribe_token       text
)
language sql
security definer
set search_path = ''
as $$
  insert into public.reminder_settings (owner_id)
  select distinct p.owner_id
    from public.watched_products w
    join public.profiles p on p.id = w.profile_id
    join auth.users u on u.id = p.owner_id
   where w.watching
     and (p_only_email is null or lower(u.email) = lower(p_only_email))
  on conflict do nothing;

  with due as (
    select w.*, p.owner_id, u.email_confirmed_at, u.email as user_email, s.email_enabled, s.push_enabled, s.unsubscribe_token
      from public.watched_products w
      join public.profiles p on p.id = w.profile_id
      join auth.users u on u.id = p.owner_id
      join public.reminder_settings s on s.owner_id = p.owner_id
     where w.watching
       and w.last_scanned_at > now() - interval '6 months'
       and s.product_alerts_enabled
       and (p_force or w.last_checked_at is null or w.last_checked_at < now() - interval '6 days')
       and (p_only_email is null or lower(u.email) = lower(p_only_email))
  ),
  picked as (
    select d.barcode
      from due d
     group by d.barcode
     order by min(d.last_checked_at) nulls first, d.barcode
     limit greatest(1, least(coalesce(p_limit, 60), 200))
  )
  select d.id,
         d.profile_id,
         d.owner_id,
         d.barcode,
         d.product_name,
         d.brands,
         d.snap_ingredients_text,
         d.snap_declared_allergens,
         d.snap_declared_traces,
         d.snap_incomplete,
         coalesce((select jsonb_agg(case when a.allergen is not null
                                         then jsonb_build_object('kind', 'predefined', 'code', a.allergen)
                                         else jsonb_build_object('kind', 'custom', 'name', a.custom_name) end
                                    order by a.created_at)
                     from public.profile_allergens a
                    where a.profile_id = d.profile_id), '[]'::jsonb),
         case when d.email_confirmed_at is not null then d.user_email::text end,
         d.email_enabled,
         d.push_enabled,
         d.unsubscribe_token
    from due d
   where d.barcode in (select barcode from picked)
   order by d.barcode, d.profile_id;
$$;

revoke execute on function public.due_product_checks(integer, text, boolean) from public, anon, authenticated;
grant execute on function public.due_product_checks(integer, text, boolean) to service_role;

-- Creates an alert, status 'sending'. Returns its id, or null when this
-- change was already alerted for this watch (never twice).
create function public.claim_product_alert(p_alert jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.product_alerts (
    watched_product_id, profile_id, barcode, product_name, brands, change_key,
    old_verdict, new_verdict, changes, summary, result, ingredients_text,
    declared_allergens, declared_traces, data_notes, off_last_modified, status
  )
  select (p_alert->>'watched_product_id')::uuid,
         w.profile_id,
         w.barcode,
         p_alert->>'product_name',
         p_alert->>'brands',
         p_alert->>'change_key',
         (p_alert->>'old_verdict')::public.scan_verdict,
         (p_alert->>'new_verdict')::public.scan_verdict,
         coalesce(p_alert->'changes', '[]'::jsonb),
         p_alert->>'summary',
         p_alert->'result',
         p_alert->>'ingredients_text',
         array(select jsonb_array_elements_text(coalesce(p_alert->'declared_allergens', '[]'::jsonb))),
         array(select jsonb_array_elements_text(coalesce(p_alert->'declared_traces', '[]'::jsonb))),
         array(select jsonb_array_elements_text(coalesce(p_alert->'data_notes', '[]'::jsonb))),
         (p_alert->>'off_last_modified')::timestamptz,
         'sending'
    from public.watched_products w
   where w.id = (p_alert->>'watched_product_id')::uuid
  on conflict (watched_product_id, change_key) do nothing
  returning id;
$$;

revoke execute on function public.claim_product_alert(jsonb) from public, anon, authenticated;
grant execute on function public.claim_product_alert(jsonb) to service_role;

-- Claims a FAILED alert for another attempt. Null when it isn't failed (or is
-- being sent by another run).
create function public.claim_product_alert_retry(p_alert_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.product_alerts
     set status = 'sending',
         attempts = attempts + 1,
         push_result = null,
         email_result = null
   where id = p_alert_id
     and status = 'failed'
  returning id;
$$;

revoke execute on function public.claim_product_alert_retry(uuid) from public, anon, authenticated;
grant execute on function public.claim_product_alert_retry(uuid) to service_role;

-- Failed alerts worth another attempt: less than 7 days old, fewer than 4
-- attempts, alerts still on. With the owner's channels.
create function public.product_alerts_to_retry(p_only_email text default null)
returns table (
  alert_id          uuid,
  owner_id          uuid,
  product_name      text,
  barcode           text,
  old_verdict       public.scan_verdict,
  new_verdict       public.scan_verdict,
  summary           text,
  result            jsonb,
  email             text,
  email_enabled     boolean,
  push_enabled      boolean,
  unsubscribe_token text
)
language sql
security definer
set search_path = ''
as $$
  select a.id,
         p.owner_id,
         a.product_name,
         a.barcode,
         a.old_verdict,
         a.new_verdict,
         a.summary,
         a.result,
         case when u.email_confirmed_at is not null then u.email::text end,
         s.email_enabled,
         s.push_enabled,
         s.unsubscribe_token
    from public.product_alerts a
    join public.profiles p on p.id = a.profile_id
    join auth.users u on u.id = p.owner_id
    join public.reminder_settings s on s.owner_id = p.owner_id
   where a.status = 'failed'
     and a.attempts < 4
     and a.created_at > now() - interval '7 days'
     and s.product_alerts_enabled
     and (p_only_email is null or lower(u.email) = lower(p_only_email))
   order by a.created_at;
$$;

revoke execute on function public.product_alerts_to_retry(text) from public, anon, authenticated;
grant execute on function public.product_alerts_to_retry(text) to service_role;

-- The unsubscribe link in a product alert email: turns product change alerts
-- off for the token's account (medication reminders are unchanged). Works
-- without logging in. Returns whether a row was changed.
create function public.unsubscribe_product_alerts(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.reminder_settings
       set product_alerts_enabled = false
     where unsubscribe_token = p_token
       and p_token ~ '^[0-9a-f]{64}$'
    returning 1
  )
  select exists (select 1 from changed);
$$;

revoke execute on function public.unsubscribe_product_alerts(text) from public;
grant execute on function public.unsubscribe_product_alerts(text) to anon, authenticated;

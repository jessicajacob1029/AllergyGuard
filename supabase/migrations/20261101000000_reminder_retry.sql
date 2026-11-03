-- Phase 7 fix: a reminder only counts as sent when a channel delivered it.
--
-- Each medication_reminders record now has a status:
--   sending   : a run claimed it and is sending it right now
--   delivered : push or email delivered it; never sent again
--   failed    : every channel failed; the next daily run claims it again
--               (while its window lasts: only delivered stages count as sent,
--               so once the window passes, the next stage takes over)
-- Claiming goes through claim_medication_reminder(), one atomic statement, so
-- two runs can never both send the same reminder.

create type public.reminder_status as enum ('sending', 'delivered', 'failed');

alter table public.medication_reminders
  add column status     public.reminder_status not null default 'sending',
  add column attempts   integer not null default 1 check (attempts >= 1),
  add column updated_at timestamptz not null default now();

-- Rows written before this change: delivered if a channel worked, else failed.
update public.medication_reminders
   set status = case
     when email_result = 'sent' or (push_result like 'delivered %' and push_result not like 'delivered 0 %')
       then 'delivered'::public.reminder_status
     else 'failed'::public.reminder_status
   end;

create trigger medication_reminders_set_updated_at
  before update on public.medication_reminders
  for each row execute function public.set_updated_at();

-- Claims a reminder for sending: a new record, or a FAILED one being retried.
-- Returns the record id, or null when it's delivered or another run is sending
-- it. The daily job (service role) only.
create function public.claim_medication_reminder(
  p_medication_id uuid,
  p_profile_id uuid,
  p_expiry_date date,
  p_stage public.reminder_stage
) returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.medication_reminders as r (medication_id, profile_id, expiry_date, stage, status)
  values (p_medication_id, p_profile_id, p_expiry_date, p_stage, 'sending')
  on conflict (medication_id, expiry_date, stage) do update
     set status = 'sending',
         attempts = r.attempts + 1,
         push_result = null,
         email_result = null
   where r.status = 'failed'
  returning r.id;
$$;

revoke execute on function public.claim_medication_reminder(uuid, uuid, date, public.reminder_stage) from public, anon, authenticated;
grant execute on function public.claim_medication_reminder(uuid, uuid, date, public.reminder_stage) to service_role;

-- Same as before, with two changes: sent_stages lists DELIVERED stages only
-- (a failed one stays due), and p_only_email limits a run to one account (for
-- testing; the daily schedule never passes it).
drop function public.due_medication_reminders(date);

create function public.due_medication_reminders(p_today date, p_only_email text default null)
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
    join auth.users u on u.id = p.owner_id
   where m.expiry_date between p_today and p_today + 30
     and (p_only_email is null or lower(u.email) = lower(p_only_email))
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
                  and r.expiry_date = m.expiry_date
                  and r.status = 'delivered'),
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
     and (p_only_email is null or lower(u.email) = lower(p_only_email))
   order by p.owner_id, m.expiry_date;
$$;

revoke execute on function public.due_medication_reminders(date, text) from public, anon, authenticated;
grant execute on function public.due_medication_reminders(date, text) to service_role;

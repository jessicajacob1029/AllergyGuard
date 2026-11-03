-- Phase 6: reaction diary.
--
-- One row per allergic reaction the user logs. Owned through profiles, like
-- every other profile table. A reaction can point at the scan of the product
-- that caused it; deleting that scan keeps the reaction and drops the link.

create type public.reaction_symptom as enum (
  'hives_rash',
  'itching',
  'swelling',
  'lips_throat_swelling',
  'breathing',
  'vomiting',
  'stomach_pain',
  'dizziness',
  'other'
);

create type public.reaction_treatment as enum (
  'none',
  'antihistamine',
  'adrenaline',
  'hospital'
);

create table public.reactions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  -- When it happened. "Not in the future" is checked by the app (allowing a
  -- few minutes of clock drift); the database only rejects nonsense dates.
  occurred_at timestamptz not null check (occurred_at >= '1900-01-01T00:00:00Z'),
  food        text not null check (char_length(btrim(food)) between 1 and 200),
  scan_id     uuid references public.scans (id) on delete set null,
  symptoms    public.reaction_symptom[] not null
              check (cardinality(symptoms) between 1 and 9),
  severity    public.allergen_severity not null,
  -- Null: not recorded. 'none': no treatment was needed.
  treatment   public.reaction_treatment,
  notes       text check (notes is null or char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index reactions_profile_occurred_idx on public.reactions (profile_id, occurred_at desc);
create index reactions_scan_id_idx on public.reactions (scan_id) where scan_id is not null;

create trigger reactions_set_updated_at
  before update on public.reactions
  for each row execute function public.set_updated_at();

alter table public.reactions enable row level security;

-- Owned profile, and a linked scan (if any) must belong to the same profile:
-- otherwise a user could attach someone else's scan id.
create policy "reactions_select_own" on public.reactions
  for select to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())));

create policy "reactions_insert_own" on public.reactions
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = profile_id and p.owner_id = (select auth.uid()))
    and (scan_id is null or exists (select 1 from public.scans s
                                    where s.id = scan_id and s.profile_id = reactions.profile_id))
  );

create policy "reactions_update_own" on public.reactions
  for update to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from public.profiles p
            where p.id = profile_id and p.owner_id = (select auth.uid()))
    and (scan_id is null or exists (select 1 from public.scans s
                                    where s.id = scan_id and s.profile_id = reactions.profile_id))
  );

create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = profile_id and p.owner_id = (select auth.uid())));

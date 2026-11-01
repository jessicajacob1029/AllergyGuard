-- Security fix A3 (docs/SECURITY-REVIEW.md): the signed-out role (anon) still
-- had Supabase's default table permissions on the six older tables. RLS already
-- returned nothing (no anon policies), but nothing in the app reads or writes
-- these tables signed out, so the permissions are removed, the same as the
-- Phase 7 tables. Signed-out requests now get 401 instead of an empty list.
-- authenticated and service_role are unchanged.

revoke all on table
  public.profiles,
  public.profile_allergens,
  public.emergency_contacts,
  public.medications,
  public.scans,
  public.reactions
from anon;

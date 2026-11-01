-- Phase 7 fix (found while extending the two-user RLS test): another account
-- could take over a user's device row by calling save_push_subscription() with
-- that device's push address. Now a different account can only take a device
-- over when it also sends the same encryption keys (p256dh and auth), which
-- only that browser has: the shared-browser case (A's session expired, B logs
-- in on the same browser) still works; knowing the address alone isn't enough.
-- The same account can always refresh its own device (e.g. new keys).

create or replace function public.save_push_subscription(
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
  insert into public.push_subscriptions as s (owner_id, endpoint, p256dh, auth_key, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth_key, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set owner_id = excluded.owner_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        created_at = now()
  where s.owner_id = excluded.owner_id
     or (s.p256dh = excluded.p256dh and s.auth_key = excluded.auth_key)
  returning id into v_id;
  if v_id is null then
    raise exception 'This device is registered to another account' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

-- create or replace keeps the existing grants; restated so this file stands alone.
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

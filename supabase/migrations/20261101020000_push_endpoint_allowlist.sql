-- Security fix A1 (docs/SECURITY-REVIEW.md): push addresses come from the
-- browser and our Edge Functions POST to them, so only the real browser push
-- services are accepted. Same rule as supabase/functions/_shared/push-endpoint.ts;
-- keep the two in sync.
--   fcm.googleapis.com, android.googleapis.com  Chrome, Edge, Opera, Samsung, Android
--   *.push.services.mozilla.com                 Firefox
--   *.push.apple.com (web.push.apple.com)       Safari on macOS and iOS
--   *.notify.windows.com                        Windows (WNS)
-- https only, no port or user name (the host must be followed directly by "/").

create function public.is_known_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/',
    false
  );
$$;

-- Every row, existing and new. (Checked before writing this: the two saved
-- devices are on fcm.googleapis.com and web.push.apple.com.)
alter table public.push_subscriptions
  add constraint push_subscriptions_known_push_service
  check (public.is_known_push_endpoint(endpoint));

-- Same function as 20261101010000_push_takeover_guard.sql, plus a clear error
-- for an unknown push service (the constraint above would also reject it).
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
  if not public.is_known_push_endpoint(p_endpoint) then
    raise exception 'Unsupported push service' using errcode = '22023';
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

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

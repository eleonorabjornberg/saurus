-- Saurus free tier: per-account daily limits for the "gemini" Edge Function.
-- Safe to re-run. Days are UTC.
--
-- Flow: the signed-in extension calls saurus_gemini_ticket() and gets a
-- ten-minute pass. It sends that pass with every Gemini call. The Edge
-- Function (service role) resolves the pass to a user with
-- saurus_usage_check() and records usage with saurus_usage_add().
--
-- To change the limits, edit saurus_limits() below and re-run this file.

create table if not exists public.saurus_gemini_tickets (
  ticket     text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists saurus_gemini_tickets_expiry on public.saurus_gemini_tickets (expires_at);

create table if not exists public.saurus_usage (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  voice_seconds numeric not null default 0,  -- seconds of audio, both directions
  pages         integer not null default 0,  -- page translations started
  calls         integer not null default 0,  -- all text requests (safety cap)
  primary key (user_id, day)
);

-- No policies on purpose: only the functions below touch these tables.
alter table public.saurus_gemini_tickets enable row level security;
alter table public.saurus_usage enable row level security;
revoke all on public.saurus_gemini_tickets, public.saurus_usage from anon, authenticated;

create or replace function public.saurus_limits() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'voice_seconds', 300,  -- 5 minutes of audio a day
    'pages', 30,           -- page translations a day (a re-translation after a level or language change counts)
    'calls', 300)          -- every text request a day
$$;

create or replace function public.saurus_usage_left(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user_id', p_user,
    'voice_left', greatest(0, (lim.l->>'voice_seconds')::numeric - coalesce(u.voice_seconds, 0)),
    'pages_left', greatest(0, (lim.l->>'pages')::integer - coalesce(u.pages, 0)),
    'calls_left', greatest(0, (lim.l->>'calls')::integer - coalesce(u.calls, 0)))
  from (select public.saurus_limits() as l) lim
  left join public.saurus_usage u
    on u.user_id = p_user and u.day = (now() at time zone 'utc')::date
$$;

-- Called by the signed-in user. Returns {ticket, expires_at, voice_left, ...}.
create or replace function public.saurus_gemini_ticket() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t   text;
  exp timestamptz := now() + interval '10 minutes';
begin
  if uid is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  delete from public.saurus_gemini_tickets where expires_at < now();
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.saurus_gemini_tickets (ticket, user_id, expires_at) values (t, uid, exp);
  return public.saurus_usage_left(uid) || jsonb_build_object('ticket', t, 'expires_at', exp);
end $$;

-- Called by the Edge Function. Null when the pass is unknown or expired.
create or replace function public.saurus_usage_check(p_ticket text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.saurus_usage_left(t.user_id)
  from public.saurus_gemini_tickets t
  where t.ticket = p_ticket and t.expires_at > now()
$$;

-- Records usage and returns what is left today, so the function can stop a
-- conversation when the user's other sessions have used the allowance up.
-- (Dropped first: an earlier draft of this file returned void.)
drop function if exists public.saurus_usage_add(uuid, numeric, integer, integer);
create function public.saurus_usage_add(
  p_user uuid, p_voice numeric default 0, p_pages integer default 0, p_calls integer default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into public.saurus_usage (user_id, day, voice_seconds, pages, calls)
  values (p_user, (now() at time zone 'utc')::date, greatest(p_voice, 0), greatest(p_pages, 0), greatest(p_calls, 0))
  on conflict (user_id, day) do update set
    voice_seconds = public.saurus_usage.voice_seconds + excluded.voice_seconds,
    pages = public.saurus_usage.pages + excluded.pages,
    calls = public.saurus_usage.calls + excluded.calls;
  return public.saurus_usage_left(p_user);
end $$;

revoke all on function public.saurus_gemini_ticket() from public, anon;
revoke all on function public.saurus_usage_left(uuid) from public, anon, authenticated;
revoke all on function public.saurus_usage_check(text) from public, anon, authenticated;
revoke all on function public.saurus_usage_add(uuid, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.saurus_gemini_ticket() to authenticated;
grant execute on function public.saurus_usage_left(uuid) to service_role;
grant execute on function public.saurus_usage_check(text) to service_role;
grant execute on function public.saurus_usage_add(uuid, numeric, integer, integer) to service_role;

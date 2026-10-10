-- Session handoff: a short summary of each conversation, per learner and
-- language, so the next session (or the next day) picks up where the last
-- one ended. Run after 20261010190000_saurus_learners.sql. Safe to re-run.

create table if not exists public.saurus_sessions (
  id         bigint generated always as identity primary key,
  learner    text        not null references public.saurus_learners (id) on delete cascade,
  language   text        not null check (language in ('fr', 'de', 'es', 'sv', 'hi')),
  summary    text        not null check (char_length(summary) between 1 and 800),
  created_at timestamptz not null default now()
);
create index if not exists saurus_sessions_recent
  on public.saurus_sessions (learner, language, created_at desc);
alter table public.saurus_sessions enable row level security;
revoke all on public.saurus_sessions from anon, authenticated;

drop trigger if exists saurus_sessions_learner on public.saurus_sessions;
create trigger saurus_sessions_learner before insert on public.saurus_sessions
  for each row execute function public.saurus_touch_learner();

-- Save one summary; keeps the latest 20 per learner and language.
create or replace function public.saurus_save_summary(p_learner text, p_language text, p_summary text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into saurus_sessions (learner, language, summary)
  values (p_learner, p_language, left(btrim(p_summary), 800));
  delete from saurus_sessions
   where learner = p_learner and language = p_language
     and id not in (select id from saurus_sessions
                     where learner = p_learner and language = p_language
                     order by created_at desc, id desc limit 20);
end;
$$;

-- The most recent summary, or null.
create or replace function public.saurus_last_summary(p_learner text, p_language text)
returns text
language sql stable security definer set search_path = public
as $$
  select summary from saurus_sessions
   where learner = p_learner and language = p_language
   order by created_at desc, id desc limit 1;
$$;

grant execute on function public.saurus_save_summary(text, text, text) to anon, authenticated;
grant execute on function public.saurus_last_summary(text, text)       to anon, authenticated;

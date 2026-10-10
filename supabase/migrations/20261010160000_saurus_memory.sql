-- Saurus memory: level per language and the words a learner struggles with.
--
-- Run once per Supabase project: paste into Dashboard > SQL Editor > Run,
-- or `supabase db push` with the Supabase CLI.
--
-- The browser extension uses the public anon/publishable key, so the tables
-- are locked (RLS on, no policies) and the extension can only call the three
-- functions below.

create table if not exists public.saurus_progress (
  learner    text        not null check (char_length(learner) between 1 and 64),
  language   text        not null check (language in ('fr', 'de', 'es', 'sv')),
  level      smallint    not null default 1 check (level between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (learner, language)
);

create table if not exists public.saurus_struggles (
  id         bigint generated always as identity primary key,
  learner    text        not null check (char_length(learner) between 1 and 64),
  language   text        not null check (language in ('fr', 'de', 'es', 'sv')),
  word       text        not null check (char_length(word) between 1 and 80),
  note       text        check (char_length(note) <= 200),
  misses     integer     not null default 1,
  last_seen  timestamptz not null default now()
);
create unique index if not exists saurus_struggles_word
  on public.saurus_struggles (learner, language, lower(word));

alter table public.saurus_progress  enable row level security;
alter table public.saurus_struggles enable row level security;
revoke all on public.saurus_progress, public.saurus_struggles from anon, authenticated;

-- Level and the most-missed words for one learner and language.
create or replace function public.saurus_memory(p_learner text, p_language text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'level', coalesce(
      (select level from saurus_progress where learner = p_learner and language = p_language), 1),
    'struggles', coalesce(
      (select jsonb_agg(jsonb_build_object('word', word, 'note', note, 'misses', misses)
                        order by misses desc, last_seen desc)
         from (select word, note, misses, last_seen from saurus_struggles
                where learner = p_learner and language = p_language
                order by misses desc, last_seen desc limit 10) s),
      '[]'::jsonb)
  );
$$;

create or replace function public.saurus_set_level(p_learner text, p_language text, p_level integer)
returns void
language sql security definer set search_path = public
as $$
  insert into saurus_progress (learner, language, level)
  values (p_learner, p_language, greatest(1, least(4, p_level)))
  on conflict (learner, language)
  do update set level = excluded.level, updated_at = now();
$$;

create or replace function public.saurus_log_struggle(p_learner text, p_language text, p_word text, p_note text default null)
returns void
language sql security definer set search_path = public
as $$
  insert into saurus_struggles (learner, language, word, note)
  values (p_learner, p_language, left(btrim(p_word), 80), left(p_note, 200))
  on conflict (learner, language, lower(word))
  do update set misses    = saurus_struggles.misses + 1,
                note      = coalesce(excluded.note, saurus_struggles.note),
                last_seen = now();
$$;

revoke all on function public.saurus_memory(text, text)                     from public;
revoke all on function public.saurus_set_level(text, text, integer)         from public;
revoke all on function public.saurus_log_struggle(text, text, text, text)   from public;
grant execute on function public.saurus_memory(text, text)                   to anon, authenticated;
grant execute on function public.saurus_set_level(text, text, integer)       to anon, authenticated;
grant execute on function public.saurus_log_struggle(text, text, text, text) to anon, authenticated;

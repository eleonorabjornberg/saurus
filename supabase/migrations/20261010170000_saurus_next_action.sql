-- Saurus decides what to practise next, inside Supabase.
--
-- Mastery +15 right / -10 wrong, "struggling" and "learned" words, recall
-- the most-missed word first, running as database functions so no server
-- is needed.

alter table public.saurus_struggles
  add column if not exists correct integer  not null default 0,
  add column if not exists mastery smallint not null default 0 check (mastery between 0 and 100);

-- What to practise next for one learner and language.
create or replace function public.saurus_next_action(p_learner text, p_language text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with mine as (
    select * from saurus_struggles where learner = p_learner and language = p_language
  ), pick as (
    select word, note from mine
     where misses > 0 and (mastery < 70 or misses >= correct)
     order by (misses - correct) desc, mastery asc, last_seen desc
     limit 1
  )
  select jsonb_build_object(
    'type',       case when exists (select 1 from pick) then 'recall' else 'reading' end,
    'word',       (select word from pick),
    'note',       (select note from pick),
    'learned',    (select count(*) from mine where mastery >= 70 and correct > misses),
    'struggling', (select count(*) from mine where misses > 0 and (mastery < 70 or misses >= correct))
  );
$$;

-- Record a right or wrong answer about a word; returns the next action.
create or replace function public.saurus_log_answer(p_learner text, p_language text, p_word text, p_correct boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  insert into saurus_struggles (learner, language, word, note, misses, correct, mastery)
  values (p_learner, p_language, left(btrim(p_word), 80), left(p_note, 200),
          case when p_correct then 0 else 1 end,
          case when p_correct then 1 else 0 end,
          case when p_correct then 15 else 0 end)
  on conflict (learner, language, lower(word))
  do update set misses    = saurus_struggles.misses  + case when p_correct then 0 else 1 end,
                correct   = saurus_struggles.correct + case when p_correct then 1 else 0 end,
                mastery   = greatest(0, least(100, saurus_struggles.mastery + case when p_correct then 15 else -10 end)),
                note      = coalesce(excluded.note, saurus_struggles.note),
                last_seen = now();
  return saurus_next_action(p_learner, p_language);
end;
$$;

-- A mistake is a wrong answer (kept for the extension's log_struggle tool).
create or replace function public.saurus_log_struggle(p_learner text, p_language text, p_word text, p_note text default null)
returns void
language sql security definer set search_path = public
as $$
  select public.saurus_log_answer(p_learner, p_language, p_word, false, p_note);
$$;

-- Memory now lists only words still being learned, and includes the next action.
create or replace function public.saurus_memory(p_learner text, p_language text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'level', coalesce(
      (select level from saurus_progress where learner = p_learner and language = p_language), 1),
    'struggles', coalesce(
      (select jsonb_agg(jsonb_build_object('word', word, 'note', note, 'misses', misses,
                                           'correct', correct, 'mastery', mastery)
                        order by (misses - correct) desc, mastery asc)
         from (select * from saurus_struggles
                where learner = p_learner and language = p_language
                  and misses > 0 and (mastery < 70 or misses >= correct)
                order by (misses - correct) desc, mastery asc limit 10) s),
      '[]'::jsonb),
    'next', saurus_next_action(p_learner, p_language)
  );
$$;

revoke all on function public.saurus_next_action(text, text)                      from public;
revoke all on function public.saurus_log_answer(text, text, text, boolean, text)  from public;
grant execute on function public.saurus_next_action(text, text)                    to anon, authenticated;
grant execute on function public.saurus_log_answer(text, text, text, boolean, text) to anon, authenticated;

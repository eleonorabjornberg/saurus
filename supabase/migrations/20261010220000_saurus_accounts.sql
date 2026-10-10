-- Saurus accounts (Supabase Auth): each signed-in user's own profile, level
-- per language, words, answer history and session summaries, protected by
-- RLS. Based on Mahdi Yusuf's account migration, extended with Hindi and
-- session summaries. Safe to re-run, including on a project where his
-- original version (which revoked the anonymous functions) was applied.
--
-- The extension requires sign-in and uses only saurus_account_memory. The
-- anonymous functions (saurus_memory, ...) stay granted for the public demo
-- page (demo.html / GitHub Pages), which has no sign-in.

create table if not exists public.saurus_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'de',
  onboarded boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.saurus_account_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  level integer not null default 1 check (level between 1 and 4),
  primary key (user_id, language)
);
create table if not exists public.saurus_account_words (
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  word text not null check (length(word) between 1 and 80),
  note text check (length(note) <= 200),
  misses integer not null default 0,
  correct integer not null default 0,
  mastery integer not null default 0 check (mastery between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, language, word)
);
create table if not exists public.saurus_account_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  word text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create table if not exists public.saurus_account_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  summary text not null check (char_length(summary) between 1 and 800),
  created_at timestamptz not null default now()
);
create index if not exists saurus_account_sessions_recent
  on public.saurus_account_sessions (user_id, language, created_at desc);

-- Languages, including Hindi (replaces the original fr/de/es/sv checks).
do $$
declare t text;
begin
  foreach t in array array['saurus_accounts','saurus_account_progress','saurus_account_words','saurus_account_history','saurus_account_sessions'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_language_check');
    execute format('alter table public.%I add constraint %I check (language in (''fr'',''de'',''es'',''sv'',''hi''))', t, t || '_language_check');
  end loop;
end;
$$;

alter table public.saurus_accounts         enable row level security;
alter table public.saurus_account_progress enable row level security;
alter table public.saurus_account_words    enable row level security;
alter table public.saurus_account_history  enable row level security;
alter table public.saurus_account_sessions enable row level security;
drop policy if exists own_account  on public.saurus_accounts;
drop policy if exists own_progress on public.saurus_account_progress;
drop policy if exists own_words    on public.saurus_account_words;
drop policy if exists own_history  on public.saurus_account_history;
drop policy if exists own_sessions on public.saurus_account_sessions;
create policy own_account  on public.saurus_accounts         for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_progress on public.saurus_account_progress for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_words    on public.saurus_account_words    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_history  on public.saurus_account_history  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_sessions on public.saurus_account_sessions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.saurus_accounts, public.saurus_account_progress, public.saurus_account_words,
              public.saurus_account_history, public.saurus_account_sessions from anon;
grant select, insert, update on public.saurus_accounts, public.saurus_account_progress, public.saurus_account_words to authenticated;
grant select, insert, delete on public.saurus_account_history, public.saurus_account_sessions to authenticated;
grant usage on sequence public.saurus_account_history_id_seq, public.saurus_account_sessions_id_seq to authenticated;

-- One entry point. SECURITY INVOKER: every statement is checked by RLS as
-- the caller; ownership comes from the JWT (auth.uid()), never a parameter.
create or replace function public.saurus_account_memory(p_op text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  lang text := p_data->>'language';
  lv integer;
  w text;
  right_answer boolean;
  result jsonb;
  nx jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_op not in ('profile','onboard','preferences','memory','level','answer','summary') then raise exception 'Invalid operation'; end if;
  if p_op <> 'profile' and (lang is null or lang not in ('fr','de','es','sv','hi')) then raise exception 'Invalid language'; end if;
  insert into saurus_accounts(user_id, language) values (uid, coalesce(lang, 'de')) on conflict do nothing;
  if p_op = 'onboard' then
    -- idempotent: never resets existing progress
    insert into saurus_account_progress(user_id,language,level) values(uid,lang,1) on conflict do nothing;
    update saurus_accounts set language=lang,onboarded=true,updated_at=now() where user_id=uid and not onboarded;
  elsif p_op = 'preferences' then
    update saurus_accounts set language=lang,updated_at=now() where user_id=uid;
    if p_data->>'corner' in ('br','bl','tr','tl') then
      update saurus_accounts set preferences=preferences || jsonb_build_object('corner',p_data->>'corner') where user_id=uid;
    end if;
  elsif p_op = 'level' then
    lv := (p_data->>'level')::integer;
    if lv is null or lv not between 1 and 4 then raise exception 'Invalid age'; end if;
    insert into saurus_account_progress(user_id,language,level) values(uid,lang,lv)
      on conflict(user_id,language) do update set level=excluded.level;
  elsif p_op = 'answer' then
    w := lower(btrim(p_data->>'word'));
    right_answer := (p_data->>'correct')::boolean;
    if w is null or length(w) not between 1 and 80 or right_answer is null then raise exception 'Invalid answer'; end if;
    insert into saurus_account_words(user_id,language,word,note,misses,correct,mastery)
      values(uid,lang,w,left(p_data->>'note',200),case when right_answer then 0 else 1 end,
      case when right_answer then 1 else 0 end,case when right_answer then 15 else 0 end)
      on conflict(user_id,language,word) do update set
        misses=saurus_account_words.misses+case when right_answer then 0 else 1 end,
        correct=saurus_account_words.correct+case when right_answer then 1 else 0 end,
        mastery=greatest(0,least(100,saurus_account_words.mastery+case when right_answer then 15 else -10 end)),
        note=coalesce(excluded.note,saurus_account_words.note),updated_at=now();
    insert into saurus_account_history(user_id,language,word,correct) values(uid,lang,w,right_answer);
  elsif p_op = 'summary' then
    if coalesce(btrim(p_data->>'summary'),'') = '' then raise exception 'Invalid summary'; end if;
    insert into saurus_account_sessions(user_id,language,summary) values(uid,lang,left(btrim(p_data->>'summary'),800));
    delete from saurus_account_sessions where user_id=uid and language=lang and id not in
      (select id from saurus_account_sessions where user_id=uid and language=lang order by created_at desc, id desc limit 20);
    return null;
  end if;
  if p_op in ('profile','onboard','preferences') then
    select to_jsonb(a) into result from saurus_accounts a where user_id=uid;
    return result;
  end if;
  select jsonb_build_object('type',case when count(*) > 0 then 'recall' else 'reading' end,
    'word',(array_agg(word order by misses-correct desc,mastery,updated_at desc))[1]) into nx
    from saurus_account_words where user_id=uid and language=lang and misses>0 and (mastery<70 or misses>=correct);
  nx := nx || jsonb_build_object(
    'learned',(select count(*) from saurus_account_words where user_id=uid and language=lang and mastery>=70 and correct>misses),
    'struggling',(select count(*) from saurus_account_words where user_id=uid and language=lang and misses>0 and (mastery<70 or misses>=correct)));
  if p_op = 'answer' then return nx; end if;
  return jsonb_build_object('level',coalesce((select level from saurus_account_progress where user_id=uid and language=lang),1),
    'struggles',coalesce((select jsonb_agg(to_jsonb(s)) from
      (select word,note,misses,correct,mastery from saurus_account_words where user_id=uid and language=lang and misses>0 and (mastery<70 or misses>=correct) order by misses-correct desc,mastery limit 10) s),'[]'::jsonb),
    'next',nx,
    'summary',(select summary from saurus_account_sessions where user_id=uid and language=lang order by created_at desc, id desc limit 1));
end;
$$;
revoke all on function public.saurus_account_memory(text,jsonb) from public, anon;
grant execute on function public.saurus_account_memory(text,jsonb) to authenticated;

-- Keep the anonymous functions available for the public demo page (the
-- original account migration revoked them).
grant execute on function public.saurus_memory(text, text)                         to anon, authenticated;
grant execute on function public.saurus_set_level(text, text, integer)             to anon, authenticated;
grant execute on function public.saurus_log_struggle(text, text, text, text)       to anon, authenticated;
grant execute on function public.saurus_next_action(text, text)                    to anon, authenticated;
grant execute on function public.saurus_log_answer(text, text, text, boolean, text) to anon, authenticated;
do $$
begin
  if to_regprocedure('public.saurus_save_summary(text, text, text)') is not null then
    grant execute on function public.saurus_save_summary(text, text, text) to anon, authenticated;
    grant execute on function public.saurus_last_summary(text, text)       to anon, authenticated;
  end if;
end;
$$;

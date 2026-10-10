-- REVIEW BEFORE DEPLOYMENT. Adds account memory without assigning shared demo
-- records to any user. Existing demo data remains untouched.
begin;
create table public.saurus_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'es' check (language in ('fr','de','es','sv')),
  onboarded boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.saurus_account_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('fr','de','es','sv')),
  level integer not null default 1 check (level between 1 and 4),
  primary key (user_id, language)
);
create table public.saurus_account_words (
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('fr','de','es','sv')),
  word text not null check (length(word) between 1 and 80),
  note text check (length(note) <= 200),
  misses integer not null default 0,
  correct integer not null default 0,
  mastery integer not null default 0 check (mastery between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, language, word)
);
create table public.saurus_account_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('fr','de','es','sv')),
  word text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);

alter table public.saurus_accounts enable row level security;
alter table public.saurus_account_progress enable row level security;
alter table public.saurus_account_words enable row level security;
alter table public.saurus_account_history enable row level security;
create policy own_account on public.saurus_accounts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_progress on public.saurus_account_progress for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_words on public.saurus_account_words for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_history on public.saurus_account_history for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.saurus_accounts, public.saurus_account_progress, public.saurus_account_words, public.saurus_account_history from anon;
grant select, insert, update on public.saurus_accounts, public.saurus_account_progress, public.saurus_account_words to authenticated;
grant select, insert on public.saurus_account_history to authenticated;
grant usage on sequence public.saurus_account_history_id_seq to authenticated;

-- SECURITY INVOKER means every operation is checked by RLS as the caller.
-- No user_id/learner parameter is accepted; ownership comes from the JWT.
create function public.saurus_account_memory(p_op text, p_data jsonb default '{}'::jsonb)
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
  if p_op not in ('profile','onboard','preferences','memory','level','answer') then raise exception 'Invalid operation'; end if;
  if p_op <> 'profile' and (lang is null or lang not in ('fr','de','es','sv')) then raise exception 'Invalid language'; end if;
  insert into saurus_accounts(user_id) values(uid) on conflict do nothing;
  if p_op = 'onboard' then
    -- Initialization is idempotent; it must never reset existing progress.
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
    'next',nx);
end;
$$;
revoke all on function public.saurus_account_memory(text,jsonb) from public, anon;
grant execute on function public.saurus_account_memory(text,jsonb) to authenticated;

-- Close the old anonymous/caller-selected identity route. Legacy shared demo
-- clients need this extension update. No shared records are copied or deleted.
revoke execute on function public.saurus_memory(text,text) from anon,authenticated;
revoke execute on function public.saurus_set_level(text,text,integer) from anon,authenticated;
revoke execute on function public.saurus_log_struggle(text,text,text,text) from anon,authenticated;
revoke execute on function public.saurus_log_answer(text,text,text,boolean,text) from anon,authenticated;
revoke execute on function public.saurus_next_action(text,text) from anon,authenticated;
commit;

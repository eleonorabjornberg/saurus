-- Italian ('it'), Brazilian Portuguese ('pt') and Mandarin Chinese ('zh'):
-- widen every language check, and the one inside saurus_account_memory, to
-- the eight languages. Run after 20261010220000_saurus_accounts.sql. Tables
-- that don't exist yet (a migration not run) are skipped. Safe to re-run.

do $$
declare t text;
begin
  foreach t in array array[
    'saurus_progress', 'saurus_struggles', 'saurus_sessions',
    'saurus_accounts', 'saurus_account_progress', 'saurus_account_words',
    'saurus_account_history', 'saurus_account_sessions'] loop
    if to_regclass('public.' || t) is null then
      raise notice '% not found, skipping', t;
      continue;
    end if;
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_language_check');
    execute format('alter table public.%I add constraint %I check (language in (''fr'',''de'',''es'',''sv'',''hi'',''it'',''pt'',''zh''))', t, t || '_language_check');
  end loop;
end;
$$;

-- Same function as in 20261010220000_saurus_accounts.sql, with the eight
-- languages in its check.
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
  if p_op <> 'profile' and (lang is null or lang not in ('fr','de','es','sv','hi','it','pt','zh')) then raise exception 'Invalid language'; end if;
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

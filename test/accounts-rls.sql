-- Run only against a disposable local database, after all migrations.
\set ON_ERROR_STOP on
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select saurus_account_memory('onboard','{"language":"es"}');
select saurus_account_memory('level','{"language":"es","level":3}');
select saurus_account_memory('answer','{"language":"es","word":"casa","correct":false}');
do $$ begin
  if (saurus_account_memory('memory','{"language":"es"}')->>'level')::int <> 3 then raise exception 'Age did not persist'; end if;
  if saurus_account_memory('memory','{"language":"es"}')->'next'->>'word' <> 'casa' then raise exception 'Mistake did not persist'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select saurus_account_memory('onboard','{"language":"sv"}');
do $$ begin
  if exists(select 1 from saurus_account_words) then raise exception 'Cross account read'; end if;
  if exists(select 1 from saurus_account_history) then raise exception 'Cross account history read'; end if;
  begin
    insert into saurus_account_progress(user_id,language,level) values('11111111-1111-4111-8111-111111111111','de',4);
    raise exception 'Cross account write allowed';
  exception when insufficient_privilege then null; end;
  if (saurus_account_memory('memory','{"language":"es","user_id":"11111111-1111-4111-8111-111111111111"}')->>'level')::int <> 1 then raise exception 'Forged identity accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select saurus_account_memory('onboard','{"language":"es"}');
do $$ begin
  if (saurus_account_memory('memory','{"language":"es"}')->>'level')::int <> 3 then raise exception 'Onboarding reset progress'; end if;
  if (select count(*) from saurus_account_history) <> 1 then raise exception 'History missing'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform saurus_account_memory('profile'); raise exception 'Anonymous account RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform saurus_memory('demo','es'); raise exception 'Legacy anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Account isolation, history, age restoration, and legacy anonymous denial passed' as result;

-- Connect the teammate's learner_profiles (backend/) to Saurus's learners.
--
-- learner_profiles keeps its own uuid id (backend/ validates it as a uuid),
-- and gains an optional saurus_learner column holding the Saurus id of the
-- same person (the random per-browser "u-..." id). One Saurus learner has at
-- most one profile. Nothing else changes; safe to re-run. Skipped if the
-- learner_profiles table doesn't exist.

do $$
begin
  if to_regclass('public.learner_profiles') is null then
    raise notice 'learner_profiles not found, skipping';
    return;
  end if;
  alter table public.learner_profiles add column if not exists saurus_learner text;
  alter table public.learner_profiles drop constraint if exists learner_profiles_saurus_learner_fkey;
  alter table public.learner_profiles add constraint learner_profiles_saurus_learner_fkey
    foreign key (saurus_learner) references public.saurus_learners (id) on delete set null;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'learner_profiles_saurus_learner_key') then
    create unique index learner_profiles_saurus_learner_key on public.learner_profiles (saurus_learner);
  end if;
end;
$$;

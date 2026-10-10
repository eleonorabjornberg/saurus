-- One row per learner, linked to their levels and struggle words, so the
-- tables are connected (foreign keys) and each learner is visible in one
-- place. Safe to re-run.
--
-- Learners are still the random per-install ids ("u-...") or a fixed name
-- from supabase-config.js; a row is created automatically the first time a
-- learner saves anything, so the extension needs no change.

create table if not exists public.saurus_learners (
  id         text        primary key check (char_length(id) between 1 and 64),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
alter table public.saurus_learners enable row level security;
revoke all on public.saurus_learners from anon, authenticated;

-- Learners who already have progress or struggle words.
insert into public.saurus_learners (id)
  select learner from public.saurus_progress
  union
  select learner from public.saurus_struggles
on conflict (id) do nothing;

-- Create the learner row (or update last_seen) before any save.
create or replace function public.saurus_touch_learner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into saurus_learners (id) values (new.learner)
  on conflict (id) do update set last_seen = now();
  return new;
end;
$$;
revoke all on function public.saurus_touch_learner() from public, anon, authenticated;

drop trigger if exists saurus_progress_learner on public.saurus_progress;
create trigger saurus_progress_learner before insert or update on public.saurus_progress
  for each row execute function public.saurus_touch_learner();
drop trigger if exists saurus_struggles_learner on public.saurus_struggles;
create trigger saurus_struggles_learner before insert or update on public.saurus_struggles
  for each row execute function public.saurus_touch_learner();

-- The links.
alter table public.saurus_progress  drop constraint if exists saurus_progress_learner_fkey;
alter table public.saurus_progress  add  constraint saurus_progress_learner_fkey
  foreign key (learner) references public.saurus_learners (id) on delete cascade;
alter table public.saurus_struggles drop constraint if exists saurus_struggles_learner_fkey;
alter table public.saurus_struggles add  constraint saurus_struggles_learner_fkey
  foreign key (learner) references public.saurus_learners (id) on delete cascade;

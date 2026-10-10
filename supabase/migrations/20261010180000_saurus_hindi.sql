-- Allow Hindi ('hi') in Saurus memory. Safe to re-run.
alter table public.saurus_progress  drop constraint if exists saurus_progress_language_check;
alter table public.saurus_progress  add  constraint saurus_progress_language_check
  check (language in ('fr', 'de', 'es', 'sv', 'hi'));
alter table public.saurus_struggles drop constraint if exists saurus_struggles_language_check;
alter table public.saurus_struggles add  constraint saurus_struggles_language_check
  check (language in ('fr', 'de', 'es', 'sv', 'hi'));

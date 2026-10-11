-- Saurus: let a signed-in user delete their own account. Safe to re-run.
--
-- Deleting the auth.users row removes everything Saurus keeps for the
-- account: every saurus_account_* table, saurus_usage and
-- saurus_gemini_tickets reference auth.users with "on delete cascade"
-- (as do Supabase's own sessions and identities).
-- The extension checks the password again before calling this.

create or replace function public.saurus_delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.saurus_delete_account() from public, anon;
grant execute on function public.saurus_delete_account() to authenticated;

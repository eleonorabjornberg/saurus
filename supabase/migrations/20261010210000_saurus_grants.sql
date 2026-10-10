-- Re-grant the functions the extension calls with the public key, in case
-- they were revoked (e.g. by a Security Advisor fix). The tables stay
-- locked; these SECURITY DEFINER functions are the only way in. Safe to re-run.
grant usage on schema public to anon, authenticated;
grant execute on function public.saurus_memory(text, text)                         to anon, authenticated;
grant execute on function public.saurus_set_level(text, text, integer)             to anon, authenticated;
grant execute on function public.saurus_log_struggle(text, text, text, text)       to anon, authenticated;
grant execute on function public.saurus_next_action(text, text)                    to anon, authenticated;
grant execute on function public.saurus_log_answer(text, text, text, boolean, text) to anon, authenticated;
do $$
begin
  -- from 20261010200000_saurus_sessions.sql, if it has been run
  if to_regprocedure('public.saurus_save_summary(text, text, text)') is not null then
    grant execute on function public.saurus_save_summary(text, text, text) to anon, authenticated;
    grant execute on function public.saurus_last_summary(text, text)       to anon, authenticated;
  end if;
end;
$$;

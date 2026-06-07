grant execute on function public.submit_conway_bracket(text, jsonb) to authenticated;
grant execute on function public.submit_password_room_bracket(text, text, text, jsonb) to anon, authenticated;
grant select on public.rooms to anon, authenticated;
grant select on public.brackets to anon, authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.actual_results to anon, authenticated;
grant select on public.bracket_submissions to anon, authenticated;
revoke insert, update, delete on public.brackets from anon, authenticated;

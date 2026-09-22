-- The project already contained this SECURITY DEFINER helper before the app schema.
-- It is used internally and must not be callable through the public Data API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

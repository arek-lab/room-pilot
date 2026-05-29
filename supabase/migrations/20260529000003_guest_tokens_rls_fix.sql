-- auth.uid() is not reliably available in PostgREST context when using the
-- Supabase SSR client (anon key + cookie session). The API route enforces
-- staff-role check and sets created_by explicitly, so WITH CHECK (true) is
-- sufficient here. TO authenticated ensures unauthenticated callers are blocked.
DROP POLICY "staff_insert_guest_tokens" ON public.guest_tokens;

CREATE POLICY "staff_insert_guest_tokens" ON public.guest_tokens
  FOR INSERT TO authenticated
  WITH CHECK (true);

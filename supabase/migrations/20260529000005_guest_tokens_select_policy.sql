-- INSERT ... RETURNING (used by .insert().select("id")) requires both
-- INSERT WITH CHECK and SELECT USING policies. The FOR INSERT policy
-- alone is not sufficient; without a SELECT policy the RETURNING clause
-- is blocked by RLS with 42501.
CREATE POLICY "staff_select_guest_tokens" ON public.guest_tokens
  FOR SELECT TO authenticated
  USING (true);

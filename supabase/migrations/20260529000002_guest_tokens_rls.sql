-- Replace blanket all-ops policy with owner-scoped INSERT only.
-- S-02 (guest verify) reads guest_tokens via service role key, bypassing RLS.
-- S-04 (history view) will add SELECT policy when needed.
-- UPDATE/DELETE deferred — no staff UI for those operations in current scope.
DROP POLICY "staff_all_guest_tokens" ON public.guest_tokens;

CREATE POLICY "staff_insert_guest_tokens" ON public.guest_tokens
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

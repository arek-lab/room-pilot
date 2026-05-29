-- GoTrue uses raw_app_meta_data.role as the JWT 'role' claim.
-- Setting role='staff' caused PostgREST to attempt SET ROLE staff,
-- which fails (no such DB role), falling back to anon and breaking RLS.
-- Fix: rename the key from 'role' to 'staff_role' so JWT role stays 'authenticated'.
UPDATE auth.users
SET raw_app_meta_data = (raw_app_meta_data - 'role') || '{"staff_role": "staff"}'::jsonb
WHERE raw_app_meta_data->>'role' = 'staff';

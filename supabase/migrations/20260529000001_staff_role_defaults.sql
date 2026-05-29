-- Backfill existing users: set role = "staff" where not already set.
-- Idempotent: WHERE clause skips rows already backfilled.
-- NOTE: cannot create functions/triggers in auth schema on Supabase cloud
-- (permission denied). New staff accounts must have app_metadata.role = "staff"
-- set manually via Supabase Dashboard (Authentication → Users → Edit) or
-- via the Admin API at account-creation time.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "staff"}'::jsonb
WHERE raw_app_meta_data->>'role' IS NULL;

# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Cloud Supabase: no DDL in `auth` schema from migrations

**Context:** `supabase/migrations/` — any migration that needs to interact with `auth.users`

**Problem:** `CREATE FUNCTION auth.*` and `CREATE TRIGGER on auth.users` fail with `permission denied for schema auth` on the Supabase cloud project. The `postgres` migration role can DML on `auth.users` (UPDATE, SELECT) but cannot create objects in the `auth` schema — that schema is managed by Supabase.

**Rule:** Never write `CREATE FUNCTION auth.*` or `CREATE TRIGGER ... ON auth.users` in migration files. For user `app_metadata` backfills use a plain `UPDATE auth.users SET raw_app_meta_data = ...`. For new-user provisioning hooks use the Supabase Dashboard → Authentication → Hooks (Custom Access Token hook), or set `app_metadata` via the Admin API at account-creation time.

**Applies to:** Every migration that touches the `auth` schema. Also applies to plan design — do not plan triggers on `auth.users`; plan Admin API calls or Dashboard hooks instead.


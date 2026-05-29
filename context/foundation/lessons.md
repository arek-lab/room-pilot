# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Cloud Supabase: no DDL in `auth` schema from migrations

**Context:** `supabase/migrations/` — any migration that needs to interact with `auth.users`

**Problem:** `CREATE FUNCTION auth.*` and `CREATE TRIGGER on auth.users` fail with `permission denied for schema auth` on the Supabase cloud project. The `postgres` migration role can DML on `auth.users` (UPDATE, SELECT) but cannot create objects in the `auth` schema — that schema is managed by Supabase.

**Rule:** Never write `CREATE FUNCTION auth.*` or `CREATE TRIGGER ... ON auth.users` in migration files. For user `app_metadata` backfills use a plain `UPDATE auth.users SET raw_app_meta_data = ...`. For new-user provisioning hooks use the Supabase Dashboard → Authentication → Hooks (Custom Access Token hook), or set `app_metadata` via the Admin API at account-creation time.

**Applies to:** Every migration that touches the `auth` schema. Also applies to plan design — do not plan triggers on `auth.users`; plan Admin API calls or Dashboard hooks instead.

## Supabase RLS: `.insert().select()` requires both INSERT and SELECT policies

**Context:** `supabase/migrations/` — any RLS table queried with `.insert().select()` in Supabase JS

**Problem:** `.insert().select()` generates `INSERT ... RETURNING`. PostgreSQL evaluates INSERT `WITH CHECK` for the write and SELECT `USING` for the RETURNING visibility — separately. A `FOR INSERT`-only policy does not cover the RETURNING clause; the query fails with `42501` even though the INSERT itself would be allowed.

**Rule:** Whenever a table uses `.insert().select()` in application code, the table must have both a `FOR INSERT WITH CHECK` and a `FOR SELECT USING` policy (or a single `FOR ALL` policy covering both). Review every new `FOR INSERT`-only policy against the codebase for chained `.select()` calls.

**Applies to:** Every RLS migration for tables accessed via Supabase JS `.insert().select()`.

## Supabase: never use `app_metadata.role` for application-level roles

**Context:** `supabase/migrations/` or any code setting `raw_app_meta_data`

**Problem:** GoTrue uses `raw_app_meta_data.role` as the `role` claim in the JWT. Setting `app_metadata.role = "staff"` causes the JWT to carry `"role": "staff"`. PostgREST then attempts `SET ROLE staff` — no such DB role exists — and falls back to `anon`, breaking all `TO authenticated` RLS policies silently.

**Rule:** Never use `role` as the key in `app_metadata` for custom application roles. Use a different key (`staff_role`, `user_role`, `app_role`) that does not shadow the JWT `role` claim. The JWT `role` must stay `authenticated` for standard Supabase RLS to work.

**Applies to:** Every migration or Admin API call setting `raw_app_meta_data`. Flag any plan that proposes setting `app_metadata.role`.


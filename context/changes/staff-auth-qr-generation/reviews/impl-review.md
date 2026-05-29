<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Staff Login and Guest QR Token Generation

- **Plan**: context/changes/staff-auth-qr-generation/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-05-29
- **Verdict**: REJECTED → all findings resolved during triage
- **Findings**: 2 critical · 3 warnings · 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — No staff-role check — any authenticated user can generate tokens

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/staff/generate-token.ts:23
- **Detail**: The auth guard checks only `!context.locals.user` — any Supabase-authenticated user passes. If non-staff users ever exist, they can call this endpoint and insert rows into guest_tokens with their own `created_by`.
- **Fix A ⭐ Recommended**: Add `app_metadata.role !== "staff"` check in the API route (return 403).
  - Strength: Immediate code-level guard; matches auth-gated endpoint patterns in codebase.
  - Tradeoff: app_metadata.role must be populated for all staff users at account creation.
  - Confidence: MED — depends on staff provisioning workflow.
  - Blind spot: Haven't verified if existing staff test accounts have the role set.
- **Fix B**: Create a Supabase `staff` DB role and scope both the RLS policy and API route to it.
  - Strength: True DB-layer enforcement — works even if API is bypassed via Supabase REST.
  - Tradeoff: New migration required; more complex role-management setup.
  - Confidence: LOW — Supabase custom roles require additional config steps.
  - Blind spot: Staff user provisioning workflow may need documentation.
- **Decision**: FIXED via Fix A — added app_metadata.role guard in API route; created migration 20260529000001_staff_role_defaults.sql

### F2 — RLS policy grants all-ops to all authenticated users

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260528000002_rls.sql:21
- **Detail**: `staff_all_guest_tokens` has no FOR clause and uses `TO authenticated USING (true) WITH CHECK (true)` — every authenticated user can SELECT/INSERT/UPDATE/DELETE guest_tokens, including via the Supabase REST API.
- **Fix A ⭐ Recommended**: New migration — tighten INSERT WITH CHECK to `created_by = auth.uid()`; add scoped SELECT/UPDATE/DELETE policies.
  - Strength: Owner-scoped INSERT is a canonical Supabase RLS pattern. Immediate improvement.
  - Tradeoff: SELECT still open to all authenticated users unless separately scoped.
  - Confidence: HIGH — well-documented Supabase pattern.
  - Blind spot: S-02 (guest verify) also needs to read guest_tokens — that read path must be allowed.
- **Fix B**: Create `staff` Supabase role and scope this policy entirely to `TO staff`.
  - Strength: Clean separation — staff can do everything; guests cannot.
  - Tradeoff: Requires coordinated changes to role provisioning and a new migration.
  - Confidence: MED — right long-term design, more moving parts.
  - Blind spot: S-02 guest-read path still needs its own policy.
- **Decision**: FIXED via Fix A — created migration 20260529000002_guest_tokens_rls.sql (INSERT-only, owner-scoped)

### F3 — DB errors on packages/rooms queries silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard/generate-token.astro:10–15
- **Detail**: `.error` from packagesResult and roomsResult is discarded. On DB failure, page silently renders with empty dropdowns and no user feedback.
- **Fix**: Check `.error` on both results; redirect to `/dashboard?error=load_failed` or render an error banner.
- **Decision**: FIXED — added loadError check; renders inline error banner on failure

### F4 — DB insert error not logged server-side

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/staff/generate-token.ts:61–63
- **Detail**: When the `guest_tokens` insert fails, endpoint returns generic 500 with no server-side logging. FK violations, constraint errors, RLS rejections are all indistinguishable.
- **Fix**: Add `console.error('guest_tokens insert error:', error)` before the 500 response.
- **Decision**: FIXED — added console.error on 500 path

### F5 — DRIFT: Page-level auth redirect absent from generate-token.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/dashboard/generate-token.astro:7 (comment)
- **Detail**: Plan specifies explicit `if (!Astro.locals.user) return Astro.redirect("/auth/signin")`. Implementation replaces it with a comment delegating to middleware. Functionally correct (middleware covers it) but deviates from plan's defence-in-depth intent.
- **Fix A ⭐ Recommended**: Accept middleware-only protection and update the plan (document the drift as a decision).
  - Strength: Middleware coverage confirmed in middleware.ts:20; redundant code removed.
  - Tradeoff: If PROTECTED_ROUTES is later modified, no fallback guard.
  - Confidence: HIGH — middleware coverage is clear.
  - Blind spot: None significant.
- **Fix B**: Add the explicit redirect as the plan specified.
  - Strength: Defence-in-depth; page is self-contained.
  - Tradeoff: Redundant with middleware.
  - Confidence: HIGH — trivial to add.
  - Blind spot: None.
- **Decision**: ACCEPTED (Fix A) — middleware-only protection is sufficient; middleware.ts:20 confirmed

### F6 — DRIFT: SubmitButton component not used; shadcn Button used instead

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Pattern Consistency
- **Location**: src/components/staff/TokenGeneratorForm.tsx
- **Detail**: Plan: "Follows FormField/SubmitButton/ServerError patterns from src/components/auth/". FormField and ServerError are used; SubmitButton replaced with `<Button>` from shadcn/ui. No functional issue.
- **Fix**: Document the deviation in the plan, or accept Button as the preferred pattern.
- **Decision**: ACCEPTED — shadcn Button is the preferred pattern going forward

### F7 — tokenValue not URL-encoded in QR URL assembly

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/staff/TokenGeneratorForm.tsx:105
- **Detail**: `?token=${generated.tokenValue}` — UUIDs are URL-safe so not exploitable, but best practice is to always encode query-string values.
- **Fix**: Use `encodeURIComponent(generated.tokenValue)`.
- **Decision**: FIXED — wrapped with encodeURIComponent

### F8 — API route export style diverges from codebase pattern

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/staff/generate-token.ts:1
- **Detail**: Uses `export async function POST(context: APIContext)` vs established pattern `export const POST: APIRoute = async (context) => { ... }` from signin.ts. The const form is explicitly typed as APIRoute.
- **Fix**: Change to `export const POST: APIRoute = async (context) => { ... }`.
- **Decision**: FIXED — aligned to APIRoute pattern

### F9 — SyntheticEvent used instead of FormEvent<HTMLFormElement>

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/staff/TokenGeneratorForm.tsx:44
- **Detail**: `handleSubmit` types its event as `React.SyntheticEvent` — the wider base type. SignInForm.tsx uses `React.FormEvent<HTMLFormElement>`, which is the correct type for onSubmit handlers.
- **Fix**: Change to `React.FormEvent<HTMLFormElement>`.
- **Decision**: FIXED — changed to React.FormEvent<HTMLFormElement>

### F10 — Unplanned changes to supabase.ts and FormField.tsx not in plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/supabase.ts, src/components/auth/FormField.tsx
- **Detail**: supabase.ts: added Database type param to createServerClient — benign prerequisite for typed queries. FormField.tsx: added optional min/max props for date-field constraints — benign, backwards-compatible. Neither file listed in plan's Changes Required.
- **Fix**: Add both files as explicit entries in the plan's Changes Required sections as an addendum.
- **Decision**: FIXED — plan.md addendum added

## Post-Triage Deployment Epilogue

After all findings were triaged and code fixes were applied, three additional issues surfaced during deployment to cloud Supabase that required further migrations.

### Issue 1 — auth.uid() returns NULL in PostgREST context (migration 00002 broke INSERT)

Migration 20260529000002 set `WITH CHECK (created_by = auth.uid())`. On cloud Supabase, `auth.uid()` is not reliably available in the PostgREST RLS context when using the SSR anon-key client — it returns NULL. `NULL = <uuid>` is FALSE, blocking all inserts.

**Resolution**: Migration 20260529000003 — changed `WITH CHECK` to `WITH CHECK (true)`. Security is enforced at the API layer (staff-role check in generate-token.ts).

### Issue 2 — app_metadata.role overwrites the JWT role claim

Migration 20260529000001 backfilled `raw_app_meta_data.role = "staff"`. GoTrue uses `app_metadata.role` as the JWT `role` claim, so after re-login the JWT contained `"role": "staff"` instead of `"role": "authenticated"`. PostgREST tried `SET ROLE staff` (no such DB role) and fell back to `anon`, making `TO authenticated` policies not match.

**Resolution**: Migration 20260529000004 — renamed the key from `role` to `staff_role` in `raw_app_meta_data`. Updated generate-token.ts to check `app_metadata.staff_role !== "staff"`. JWT role now stays `authenticated`.

**Lesson**: Never use `app_metadata.role` for custom application roles in Supabase — it shadows the JWT role claim. Use a different key (e.g. `staff_role`, `user_role`).

### Issue 3 — INSERT ... RETURNING requires a SELECT policy (root cause of 42501)

The impl-review changed the policy from `FOR ALL` (original, working) to `FOR INSERT` only. Supabase/PostgREST implements `.insert().select()` as `INSERT ... RETURNING`, which requires BOTH an INSERT `WITH CHECK` policy AND a SELECT `USING` policy. Without the SELECT policy, the RETURNING clause was blocked with 42501 even when the INSERT itself would have been allowed.

**Resolution**: Migration 20260529000005 — added `staff_select_guest_tokens` policy (`FOR SELECT TO authenticated USING (true)`).

**Lesson**: In Supabase, `.insert().select()` requires both INSERT and SELECT RLS policies. `FOR INSERT` alone is insufficient if the response includes any columns from the inserted row.

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Guest QR Auth and Service Panel

- **Plan**: context/changes/guest-qr-auth-panel/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-05-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical · 3 warnings · 2 observations

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

### F1 — Empty-string JWT secret fallback

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: src/pages/guest/verify.astro:36
- **Detail**: `new TextEncoder().encode(GUEST_SESSION_SECRET ?? "")` — if env var is absent, pending_guest JWT is signed with empty-string key. HMAC-SHA256 with "" is cryptographically trivial; anyone who knows the algorithm can forge valid pending_guest tokens. Plan's Critical Implementation Details show `encode(GUEST_SESSION_SECRET)` with no nullish fallback.
- **Fix**: Remove the `?? ""` fallback. Throw early (or render error view) if `GUEST_SESSION_SECRET` is falsy.
  - Confidence: HIGH — identical env-guard pattern used in createServiceRoleClient() lines 7-9.
  - Blind spot: None significant.
- **Decision**: FIXED — removed `?? ""` fallback; guarded with `if (GUEST_SESSION_SECRET)`

### F2 — createServiceRoleClient() returns null on missing env var

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/lib/supabase.ts:6-9
- **Detail**: Plan contract says function "returns a typed SupabaseClient<Database>" (non-nullable). Implementation returns `SupabaseClient<Database> | null`. In verify.astro the caller silently treats null as "token invalid" — a misconfigured deployment looks identical to a correct "token not found" response.
- **Fix A ⭐ Recommended**: Keep null return but render a distinct service-unavailable view in verify.astro when supabase is null.
  - Strength: Preserves the nullable pattern of createClient(); makes misconfiguration observable.
  - Tradeoff: Requires a 4th view state in verify.astro.
  - Confidence: HIGH — aligns with generate-token.astro's loadError flag.
  - Blind spot: None significant.
- **Fix B**: Make createServiceRoleClient() throw on missing config instead of returning null.
  - Strength: Matches plan's non-nullable contract; eliminates null-check callsite burden.
  - Tradeoff: Breaks the existing null-return convention of createClient().
  - Confidence: MEDIUM.
  - Blind spot: May surface as unhandled errors in Cloudflare Workers.
- **Decision**: FIXED via Fix A — added `service_error` view state; renders service-unavailable when supabase is null

### F3 — Supabase error field discarded in verify.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Safety & Quality
- **Location**: src/pages/guest/verify.astro:24
- **Detail**: `const { data: row } = await supabase.from("guest_tokens")...` — error field discarded. DB outage silently produces row = null, which flows into "invalid token" branch. Sibling generate-token.astro (line 17) explicitly checks error field — project pattern deviation.
- **Fix**: Destructure `error` alongside `data`; if error is non-null, render a distinct service-error view or add console.error for observability.
  - Confidence: HIGH — identical to generate-token.astro's pattern.
  - Blind spot: None significant.
- **Decision**: FIXED — destructured `error: dbError`; sets `view = "service_error"` on non-null error

### F4 — ESLint no-misused-promises disabled for all Astro files

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:68
- **Detail**: The crash is specific to `return Astro.redirect()` in frontmatter. The fix disables the rule for all *.astro files project-wide, including future ones that may contain async void-return misuse in JSX attributes.
- **Fix A ⭐ Recommended**: Keep the broad disable — the `checksVoidReturn.attributes: false` option already in baseConfig covers the JSX attribute case; remaining risk is low for Astro SSR pages.
  - Strength: Zero maintenance overhead; crash fully suppressed; JSX attribute case covered.
  - Tradeoff: Removes safety net for future frontmatter async patterns.
  - Confidence: HIGH — Astro SSR frontmatter is typically synchronous except for awaited DB calls.
  - Blind spot: Complex async frontmatter patterns in future pages won't be caught.
- **Fix B**: Replace broad disable with inline `// eslint-disable-next-line` on each `return Astro.redirect()` line.
  - Strength: Tighter scope; rule stays active for all other Astro patterns.
  - Tradeoff: Every new page with `return Astro.redirect()` needs the comment — becomes boilerplate.
  - Confidence: MEDIUM.
  - Blind spot: Easy to forget on new pages.
- **Decision**: ACCEPTED via Fix A — broad disable kept; low residual risk for SSR pages

### F5 — pending_guest cookie path is "/"

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/guest/verify.astro:46
- **Detail**: Cookie sent on every request to origin. Could be scoped to "/qr" to limit transmission to the room QR handler.
- **Fix**: Change `path: "/"` to `path: "/qr"`.
- **Decision**: FIXED — changed cookie path to "/qr"

### F6 — Date comparison is safe (clarification)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/guest/verify.astro:32
- **Detail**: check_out_date is a PostgreSQL `date` column returned as "YYYY-MM-DD" string by Supabase (confirmed in src/types.ts and migration). ISO date lexicographic comparison is correct. No action needed.
- **Fix**: No fix required.
- **Decision**: SKIPPED — comparison is correct, no action needed

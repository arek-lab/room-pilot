# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-03 (Phase 1 implemented)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase signal (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` only (last 30 days, excluding `node_modules/`, `dist/`, `.astro/`).

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the evidence that surfaced
this risk — never a specific file as "where the failure lives."

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|-------------------------------|
| 1 | 2-step QR auth broken: guest with valid reception token scans the room QR and is still blocked from the panel | High | High | Interview Q1; PRD US-01 AC; hot-spot dir `src/pages/guest/` (7 commits/30d), `src/pages/qr/room/` (4 commits/30d) |
| 2 | Middleware regression: change to guest JWT or staff auth logic silently invalidates valid sessions | High | High | Interview Q3; hot-spot `src/middleware.ts` (3 commits/30d); PRD FR-002, FR-005 |
| 3 | Token expiry not enforced: expired guest token (past check-out date) still grants panel access | High | Medium | PRD FR-004, Guardrails ("token wygasa automatycznie"); archive `db-schema-supabase/plan.md` (exp claim w JWT) |
| 4 | Order state machine violated: order disappears without trace, or guest cancels after reception marks as fulfilled | High | Medium | PRD Guardrails, US-02 AC, FR-009 |
| 5 | Unauthorized service ordering: guest places an order for a service_id outside their package's addon list | Medium | Medium | PRD §Access Control; archive `db-schema-supabase/plan.md` (no guest RLS — app-level enforcement only) |
| 6 | IDOR: guest A retrieves or mutates guest B's orders via service-role API | Medium | Low-Medium | PRD Guardrails ("brak dostępu do danych innego gościa"); archive `db-schema-supabase/plan.md` (service role + WHERE clause — app-enforced) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | `pending_guest` cookie + valid `qr_token` in URL → `guest_session` cookie issued with correct claims (tokenId, roomNumber, packageId, exp) | "Token is valid" ≠ "room QR lookup succeeds AND session is issued correctly" | How `pending_guest` cookie is set; what `qr_token` lookup does; what triggers `guest_session` issuance; redirect target | Integration (server route handler, no browser) | Asserting only HTTP 200 — must assert cookie is set with correct claims |
| #2 | Valid guest JWT → `guestToken` populated; valid staff session → `user` populated; expired/tampered/missing cookie → null, no 500 | "Works in Node dev" ≠ "same behavior in Workers runtime" — but user excluded Wrangler tests; verify Node coverage is sufficient | `jose` jwtVerify logic; cookie name; how `GUEST_SESSION_SECRET` is injected in test env | Unit (mock Astro request context) | Testing only the happy path; skipping expired, tampered, and missing-cookie cases |
| #3 | Request with `exp` claim in the past → 401/redirect, not panel access | "JWT parses" ≠ "`exp` is actually checked and enforced" | Where `exp` is enforced: middleware only, or also per-API-route; is it the JWT `exp` or a separate DB check | Unit (middleware logic) | Asserting 200 on any request that has a syntactically valid JWT |
| #4 | Order placed → visible in DB with status `pending`; cancel before fulfillment → order status updated; cancel after staff marks fulfilled → 4xx | "Status updated" ≠ "state machine enforced atomically" | Status field CHECK constraint; cancel endpoint guard logic; whether status transitions are validated server-side | Integration (API route + Supabase, not mocked) | Mocking the database; test must hit a real or schema-equivalent Supabase instance |
| #5 | Guest with Package Basic POSTs an order for a Premium-only service → 4xx; POSTs for an included (non-addon) service → 4xx | "Service exists" ≠ "service is in the guest's package as addon" | `package_services` join logic in the orders POST endpoint; how guest's `packageId` reaches the validation step | Integration | Testing only the happy "valid addon in correct package" path |
| #6 | GET `/api/guest/orders` with guest A's session → returns only A's orders, never B's | "WHERE clause is in the code" ≠ "guest_token_id always comes from the JWT in context.locals, not from a request param the client controls" | How `guest_token_id` is sourced in each guest API route; whether any route reads it from query params or body | Integration | Trusting that the WHERE is correct because code review said so — test must assert cross-guest isolation with two distinct tokens |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right; the orchestrator updates Status
and Change-folder as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Runner + QR auth path | Bootstrap Vitest; prove middleware JWT behavior, 2-step QR→session path, and token expiry | #1, #2, #3 | unit, integration | implemented | context/changes/testing-runner-qr-auth-path/ |
| 2 | Order flow integrity | Prove order CRUD, cancel gate, service authorization, and guest isolation | #4, #5, #6 | integration (API + Supabase) | not started | — |
| 3 | E2E golden path | Playwright: north star end-to-end (staff login → QR generation → guest 2-step access → add-on order → reception status update) | #1, #2, #4 (smoke) | e2e | not started | — |
| 4 | CI quality gate | Wire Vitest + Playwright into GitHub Actions; enforce type-check gate on every PR | all | CI configuration | not started | — |

---

## 4. Stack

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | none yet — see §3 Phase 1 | Node runtime; compatible with Astro 6 + TypeScript 5; does not require Cloudflare Workers runtime |
| e2e | Playwright | none yet — see §3 Phase 3 | Browser-driven; tests the full guest + staff flows against a running dev server |
| API mocking | none planned | — | Guest API routes hit a real Supabase instance in integration tests; mock only at network edge if needed |
| CI | GitHub Actions | already configured | `.github/workflows/ci.yml` runs lint + build; Phase 4 extends it with test steps |

**Stack grounding tools (current session):**
- Docs (Context7): not available in current session — stack choices based on local `package.json`, CLAUDE.md, and known Astro/Cloudflare Workers constraints.
- Search (web): WebSearch deferred tool available (not MCP) — not used; stack is well-known.
- Runtime/browser: Playwright MCP not available in current session; checked: 2026-06-02.
- Provider/platform: `mcp__plugin_supabase_supabase` available — potential use in Phase 4 quality gate (run count queries post-migration); checked: 2026-06-02.

**Key constraint:** Cloudflare Workers runtime is excluded from tests per Phase 2 interview (Q5: "nie testuj wranglera"). Vitest runs in Node; Workers-specific behavior (e.g., CPU limits, binding APIs) is not covered. If Workers-specific regressions surface, revisit with `--refresh`.

---

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (`npm run lint`, `npx tsc --noEmit`) | local + CI | required now | syntactic and type drift |
| unit + integration (Vitest) | local + CI | required after §3 Phase 1 | middleware regressions, QR auth path, order state machine, isolation |
| e2e on critical flows (Playwright) | CI on PR | required after §3 Phase 3 | broken north-star user path end-to-end |
| CI gate wiring | GitHub Actions | required after §3 Phase 4 | prevents unverified code from reaching production |
| pre-prod smoke | manual, between merge + prod | optional | environment-specific failures (Cloudflare, Supabase cloud) |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section fills in once the
relevant rollout phase ships.

### 6.1 Adding a unit test

TBD — see §3 Phase 1.

### 6.2 Adding an integration test

TBD — see §3 Phase 1.

### 6.3 Adding a test for a guest API endpoint

TBD — see §3 Phase 2.

### 6.4 Adding an e2e test

TBD — see §3 Phase 3.

### 6.5 Per-rollout-phase notes

(Filled in as phases complete.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5).

- **shadcn/ui component UI snapshots** — library components are not authored here; snapshots would break on every library update and catch nothing we own. Re-evaluate if we fork or heavily customise a component. (Source: interview Q5.)
- **Auth pages (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`)** — authentication is handled by Supabase; testing these pages tests Supabase's SDK, not our logic. Re-evaluate if custom auth middleware is added. (Source: interview Q5.)
- **Cloudflare Workers / Wrangler deployment behavior** — runtime-specific tests (CPU limits, bindings, deploy pipeline) are excluded. Unit and integration tests run in Node. Re-evaluate if a Workers-specific bug surfaces in production. (Source: interview Q5.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-02
- Stack versions last verified: 2026-06-02
- AI-native tool references last verified: n/a (none in use)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.

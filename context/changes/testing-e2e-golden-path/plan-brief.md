# E2E Golden Path — Plan Brief

> Full plan: `context/changes/testing-e2e-golden-path/plan.md`

## What & Why

Install Playwright and write the north-star E2E test covering the complete
guest + staff flow end-to-end. The test proves that the three highest-risk
failure scenarios (#1 QR auth, #2 middleware regression, #4 order state) do
not silently break in a real browser session against a running server.
No other test layer does this — unit and integration tests mock the browser.

## Starting Point

Playwright is not installed. Vitest with 7 passing tests (Phase 1) covers
middleware JWT and QR auth in Node. The app is fully functional against cloud
Supabase — `npm run dev` + `.env` runs the full stack locally.

## Desired End State

`npm run test:e2e` exits 0 with 2 specs. The golden path spec opens two browser
contexts (staff + guest), walks the full flow from staff login through QR token
generation, guest 2-step access, add-on order, and staff fulfillment, ending
with the guest page showing "✓ Fulfilled" after a page reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test data strategy | Static seed in cloud Supabase (manual SQL) | Cloud DB is shared; no local stack to reset | Plan |
| Staff credentials | `.env.test` env vars | Standard E2E pattern; avoids Admin API dependency | Plan |
| QR URL navigation | Direct URL with known `SEED.roomQrToken` | `qr_token` column value is deterministic after seed | Plan |
| Browser context isolation | Separate `BrowserContext` per actor | Prevents cookie bleed between staff and guest | Plan |
| Dev server | `webServer` in playwright.config.ts | CI-friendly; zero manual setup | Plan |
| Test granularity | Single `test()` with four phases | Golden path is one story; any failure pinpoints the exact broken step | Plan |
| Order cleanup | No teardown — test ends at "fulfilled" | Simplest; fulfilled orders are harmless in pilot DB | Plan |
| Staff dashboard assertion | Badge visible + order card with guest name | Verifies UI, not just API | Plan |

## Scope

**In scope:**
- Playwright install + `playwright.config.ts` (webServer, Chromium, sequential)
- `e2e/smoke.spec.ts` — runner health check
- `e2e/fixtures/seed.ts` — seed constants + SQL documentation
- `.env.test.example` — staff credential template
- `data-testid="pending-badge"` in `StaffLayout.astro`
- `e2e/golden-path.spec.ts` — full north-star flow

**Out of scope:**
- CI wiring (Phase 4 of the test rollout)
- Multiple browsers
- Visual regression / screenshot comparison
- Order state machine edge cases (Phase 2 integration tests)
- `globalSetup` / `globalTeardown`

## Architecture / Approach

Two `BrowserContext` objects within one `test()`. Staff context authenticates
via Supabase session cookies; guest context accumulates `pending_guest` and
`guest_session` cookies naturally through normal page navigation. `test.slow()`
triples assertion timeouts for cloud Supabase latency. The dev server runs
automatically via `webServer`; `reuseExistingServer: !process.env.CI` avoids
double-starting in local development.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Playwright Bootstrap | Runner + browser working, smoke spec green | Peer dep conflict with existing Vite override |
| 2. Seed + Fixtures | Test constants defined, badge testid added, credentials template ready | Seed SQL fails on cloud DB (FK violation or missing table) |
| 3. Golden Path Spec | Full north-star E2E test passing | Cloud latency causes flaky timeouts; locators miss after UI change |

**Prerequisites:**
- Seed SQL executed in cloud Supabase dashboard (4 rows)
- Staff test account created in Supabase Auth with `raw_app_meta_data: {"staff_role":"staff"}`
- `.env.test` file created from `.env.test.example` with real credentials

**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- Cloud Supabase latency may cause occasional timeout flakiness — `test.slow()` mitigates, trace-on-retry aids diagnosis
- If `npm run dev` port conflicts with another process, `reuseExistingServer` will use the existing one (desired locally, risky in CI without port isolation)
- The `pending_guest` cookie has `path: "/qr"` — Playwright preserves it correctly across navigations within the same context

## Success Criteria (Summary)

- `npm run test:e2e` exits 0; both specs pass against the real dev server + cloud Supabase
- `npm run test:e2e:headed` shows a visible browser completing all four flow phases without errors
- `npx tsc --noEmit` and `npm run lint` stay clean

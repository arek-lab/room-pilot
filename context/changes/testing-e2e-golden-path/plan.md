# E2E Golden Path — Implementation Plan

## Overview

Install Playwright and write the north-star E2E test covering the full
north-star flow: staff login → QR token generation → guest 2-step QR access →
add-on order → reception fulfillment. Test runs against `npm run dev` (Astro
dev server connected to cloud Supabase). Covers risks #1, #2, #4 (smoke) from
the test plan.

## Current State Analysis

Vitest with 7 passing tests (Phase 1 of the test rollout) is fully in place.
Playwright is not installed — `@playwright/test` is absent from `package.json`
and no `playwright.config.*` exists. The project uses cloud Supabase, so test
seed data must be inserted manually once via the Supabase dashboard SQL editor;
there is no local Docker stack to reset.

## Desired End State

`npm run test:e2e` exits 0. Playwright HTML report shows 2 specs:

1. `e2e/smoke.spec.ts` — 1 test (page loads, heading visible)
2. `e2e/golden-path.spec.ts` — 1 test (full north-star flow passes)

The golden path test proves end-to-end:
- Staff logs in, fills the generate-token form, captures `tokenValue` from the
  API response
- Guest context navigates `/guest/verify`, then `/qr/room/<TEST_ROOM_QR_TOKEN>`,
  and lands on `/guest/panel` (guest_session cookie issued correctly — R1, R2)
- Guest orders the seeded add-on — "⏳ Awaiting" badge visible (R4 smoke)
- Staff fulfills the order via dialog — order card disappears from dashboard
- Guest page reload shows "✓ Fulfilled" on the service card

**Verification**: `npm run test:e2e` green; `npx tsc --noEmit` clean; `npm run lint` clean.

### Key Discoveries

- `processQrAuth` queries `room_qr_codes` by `.eq("qr_token", qrToken)` — **not
  by `id`** (`src/lib/qr-auth.ts:36`). The URL segment is the `qr_token` column
  value.
- Staff signin form has a "Kod hotelu" field that is client-validated (non-empty)
  but the API ignores it (`src/components/auth/SignInForm.tsx:41–43`). Test must
  fill it with any non-empty string.
- Fulfill action requires two clicks: "Fulfill" → AlertDialog → "Confirm"
  (`src/components/staff/OrderList.tsx:67–89`).
- `AddonList` polls `/api/guest/orders` every 20 s — test reloads the guest page
  after staff fulfillment rather than waiting for the poll.
- `StaffLayout` badge: `<span id="pending-badge">` without ARIA role; needs
  `data-testid="pending-badge"` for reliable E2E targeting (`src/layouts/StaffLayout.astro:58`).
- Staff auth POST redirects to `/`; the index page then redirects logged-in
  users to `/dashboard`.

## What We're NOT Doing

- No Wrangler / Workers runtime (excluded per `test-plan.md §7`)
- No globalSetup / teardown — seed is manual, fulfilled orders accumulate in
  the cloud DB (acceptable for the pilot)
- No `page.waitForTimeout()` — all waits are state-based
- No auth unit or order state machine tests (Phase 1 and 2 respectively)
- No multi-browser coverage — Chromium only for Phase 3
- No CI / GitHub Actions wiring (Phase 4)

## Implementation Approach

Three phases, each independently verifiable. Phase 1 proves Playwright boots
before any real test logic is written. Phase 2 defines seed constants, documents
the one-time cloud DB setup, and adds the single production code change
(`data-testid`). Phase 3 writes the golden path spec using two separate browser
contexts — one for staff, one for guest — matching the real-world two-device
scenario.

## Critical Implementation Details

**Cloud Supabase seed is manual**: `e2e/fixtures/seed.ts` contains the SQL
block as comments. Execute it once in the Supabase dashboard → SQL editor before
running tests. Uses `ON CONFLICT DO NOTHING` so re-running is safe.

**`qr_token` field vs `id`**: the URL `/qr/room/<value>` carries
`room_qr_codes.qr_token`, not `room_qr_codes.id`. `SEED.roomQrToken` must equal
the `qr_token` column value of the seeded row.

**TokenValue capture**: use `staffPage.waitForResponse(r => r.url().includes("/api/staff/generate-token") && r.request().method() === "POST")` *before* clicking submit, then `await` it after. The response JSON contains `tokenValue`.

**Dev server env**: `playwright.config.ts` launches `npm run dev`; Astro dev
reads credentials from `.env`. The test runner reads staff credentials from
`.env.test` (loaded via `dotenv` in the config). Both files must be present.

---

## Phase 1: Playwright Bootstrap

### Overview

Install `@playwright/test`, configure the runner, add npm scripts, and write a
smoke spec. The goal is a working E2E runner before any golden-path logic is
written.

### Changes Required

#### 1. Install @playwright/test and dotenv

**File**: `package.json` (devDependencies)

**Intent**: Add Playwright as the E2E test runner and `dotenv` for loading
`.env.test` in the config file.

**Contract**: Add to `devDependencies`:
```json
"@playwright/test": "latest",
"dotenv": "latest"
```
After `npm install`, run `npx playwright install --with-deps chromium` to
download the Chromium browser binary.

#### 2. Add E2E test scripts

**File**: `package.json` (scripts)

**Intent**: Expose E2E commands for development and CI.

**Contract**:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

#### 3. Create playwright.config.ts

**File**: `playwright.config.ts` (new, project root)

**Intent**: Configure Playwright with an auto-managed dev server, `baseURL`,
Chromium-only project, sequential workers (cloud DB is shared), and `.env.test`
credential loading.

**Contract**:
```typescript
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
});
```

`fullyParallel: false` and `workers: 1` because all tests share the cloud
Supabase instance; sequential execution prevents flaky cross-test interference.

#### 4. Create smoke spec

**File**: `e2e/smoke.spec.ts` (new)

**Intent**: Confirm the runner, browser, and dev server all work before writing
golden-path logic.

**Contract**: One `test()` — `page.goto("/")` and
`expect(page.getByRole("heading", { name: "RoomPilot" })).toBeVisible()`.

### Success Criteria

#### Automated Verification

- `npm install` completes without errors
- `npx playwright install --with-deps chromium` completes
- `npm run test:e2e` exits 0; report shows 1 spec, 1 test passing
- `npx tsc --noEmit` passes including `playwright.config.ts`

#### Manual Verification

- `npx playwright show-report` opens the HTML report showing smoke passed with
  no warnings

**Implementation Note**: After all automated criteria pass, confirm the HTML
report is clean before proceeding to Phase 2.

---

## Phase 2: Seed Constants + Test Infrastructure

### Overview

Define the static seed constants, document the one-time SQL setup, create
`.env.test.example`, add `.env.test` to `.gitignore`, and add
`data-testid="pending-badge"` to `StaffLayout` — the only production code change
in the plan.

### Changes Required

#### 1. Create seed constants file

**File**: `e2e/fixtures/seed.ts` (new)

**Intent**: Central module for test data constants used across E2E specs. Also
documents the exact SQL that must be run once against the cloud Supabase
instance.

**Contract**: A single exported `SEED` object:

```typescript
// Rows required in cloud Supabase before running E2E tests.
// Run the SQL block below once via Supabase Dashboard → SQL editor.
//
// INSERT INTO room_qr_codes (id, qr_token, room_number, active)
// VALUES ('10000000-0000-0000-0000-000000000001','e2e-room-101','101-E2E',true)
// ON CONFLICT (id) DO NOTHING;
//
// INSERT INTO packages (id, name, active)
// VALUES ('20000000-0000-0000-0000-000000000001','E2E Test Package',true)
// ON CONFLICT (id) DO NOTHING;
//
// INSERT INTO services (id, name, category, active, price_pln)
// VALUES ('30000000-0000-0000-0000-000000000001','E2E Massage','wellness',true,100)
// ON CONFLICT (id) DO NOTHING;
//
// INSERT INTO package_services (id, package_id, service_id, inclusion_type)
// VALUES ('40000000-0000-0000-0000-000000000001',
//         '20000000-0000-0000-0000-000000000001',
//         '30000000-0000-0000-0000-000000000001',
//         'addon')
// ON CONFLICT (id) DO NOTHING;
//
// Staff account: create in Supabase Auth dashboard, set
//   raw_app_meta_data: {"staff_role":"staff"}
// Then copy credentials to .env.test (see .env.test.example).

export const SEED = {
  roomQrToken: "e2e-room-101",   // room_qr_codes.qr_token — used in /qr/room/<value>
  roomNumber: "101-E2E",         // room_qr_codes.room_number (must match guest token)
  packageId: "20000000-0000-0000-0000-000000000001",
  serviceName: "E2E Massage",    // services.name — locator for the addon card
} as const;
```

#### 2. Create .env.test.example

**File**: `.env.test.example` (new)

**Intent**: Template for test-runner credentials. Developer copies to `.env.test`
and fills in real values. The staff account must exist in Supabase Auth with
`raw_app_meta_data: {"staff_role":"staff"}`.

**Contract**:
```
# E2E test credentials — copy to .env.test (gitignored) and fill in real values.
# Staff account must exist in Supabase Auth with raw_app_meta_data: {"staff_role":"staff"}
STAFF_TEST_HOTEL_CODE=your-hotel-code
STAFF_TEST_EMAIL=e2e-staff@example.com
STAFF_TEST_PASSWORD=YourPasswordHere
```

#### 3. Add .env.test to .gitignore

**File**: `.gitignore`

**Intent**: Prevent test credentials from being committed to source control.

**Contract**: Append `.env.test` as a new line.

#### 4. Add data-testid to pending badge

**File**: `src/layouts/StaffLayout.astro`

**Intent**: Make the pending-orders badge targetable by `getByTestId` in E2E
tests without using CSS selectors or brittle text matching on a number.

**Contract**: Add `data-testid="pending-badge"` to the `<span id="pending-badge">`
element. No visual or behavioral change.

### Success Criteria

#### Automated Verification

- `npm run test:e2e` still exits 0 (smoke spec passes, fixtures file has no
  syntax errors)
- `npx tsc --noEmit` passes

#### Manual Verification

- `.env.test.example` is tracked in git; `.env.test` is absent (verified via
  `git status`)
- Execute the SQL block from `seed.ts` comments in Supabase dashboard — all 4
  inserts succeed with no unique-constraint errors
- Staff test account exists in Supabase Auth with correct `staff_role` metadata

**Implementation Note**: The seed SQL and the staff account setup must be verified
manually before proceeding to Phase 3. Phase 3 will fail silently if these rows
or the account are missing.

---

## Phase 3: Golden Path Spec

### Overview

Write `e2e/golden-path.spec.ts` — a single `test()` covering the full
north-star flow using two separate browser contexts (staff and guest). Failure
in any `expect()` call pinpoints the exact broken step.

### Changes Required

#### 1. Create golden path spec

**File**: `e2e/golden-path.spec.ts` (new)

**Intent**: The complete E2E golden path across staff and guest actors. One
test(), four logical phases, sequential assertions — any failure is immediately
traceable to a specific step.

**Contract**:

The spec structure:

```
import { test, expect } from "@playwright/test";
import { SEED } from "./fixtures/seed";

test.slow(); // triples timeouts for cloud Supabase round-trips

test("golden path: staff login → QR generate → guest access → order → fulfillment",
  async ({ browser }) => {
    // Two isolated browser contexts: staff cookies never bleed into guest
    const staffCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const staffPage = await staffCtx.newPage();
    const guestPage = await guestCtx.newPage();
    const guestName = `E2E Guest ${Date.now()}`;

    try {
      // Phase A: Staff login + token generation
      // Phase B: Guest 2-step QR access
      // Phase C: Guest orders add-on
      // Phase D: Staff fulfills, guest confirms
    } finally {
      await staffCtx.close();
      await guestCtx.close();
    }
  }
);
```

**Phase A — Staff login + token generation:**

1. `staffPage.goto("/auth/signin")`
2. `staffPage.getByLabel("Kod hotelu").fill(process.env.STAFF_TEST_HOTEL_CODE!)`
3. `staffPage.getByLabel("Email").fill(process.env.STAFF_TEST_EMAIL!)`
4. `staffPage.getByLabel("Password").fill(process.env.STAFF_TEST_PASSWORD!)`
5. `staffPage.getByRole("button", { name: /Sign in/i }).click()`
6. `staffPage.waitForURL("**/dashboard")` — confirms auth + index redirect
7. `staffPage.goto("/dashboard/generate-token")`
8. `staffPage.getByLabel("Guest Name").fill(guestName)`
9. `staffPage.getByLabel("Room").selectOption(SEED.roomNumber)`
10. `staffPage.getByLabel("Package").selectOption(SEED.packageId)`
11. Fill check-in / check-out dates (today and 3 days from now)
12. `const tokenRes = staffPage.waitForResponse(r => r.url().includes("/api/staff/generate-token") && r.request().method() === "POST")`
13. `staffPage.getByRole("button", { name: /Generate Token/i }).click()`
14. `const { tokenValue } = await (await tokenRes).json() as { tokenValue: string }`
15. `expect(staffPage.getByText(guestName)).toBeVisible()` — generated view shown

**Phase B — Guest 2-step QR access:**

16. `guestPage.goto("/guest/verify?token=" + encodeURIComponent(tokenValue))`
17. `expect(guestPage.getByText(/Step 2 of 2/)).toBeVisible()`
18. `guestPage.goto("/qr/room/" + SEED.roomQrToken)`
19. `guestPage.waitForURL("**/guest/panel")`
20. `expect(guestPage.getByText(/Included in your package/i)).toBeVisible()`

**Phase C — Guest orders add-on:**

21. `const addonCard = guestPage.getByRole("article").filter({ hasText: SEED.serviceName })`
22. `expect(addonCard).toBeVisible()`
23. `addonCard.getByRole("button", { name: "Order" }).click()`
24. `expect(addonCard.getByText(/Awaiting/)).toBeVisible()`

**Phase D — Staff sees order, fulfills; guest confirms:**

25. `staffPage.goto("/dashboard")`
26. `expect(staffPage.getByText(guestName)).toBeVisible()`
27. `expect(staffPage.getByTestId("pending-badge")).toBeVisible()`
28. `staffPage.getByRole("listitem").filter({ hasText: guestName }).getByRole("button", { name: "Fulfill" }).click()`
29. `expect(staffPage.getByRole("alertdialog")).toBeVisible()`
30. `staffPage.getByRole("button", { name: "Confirm" }).click()`
31. `expect(staffPage.getByText(guestName)).not.toBeVisible()`
32. `guestPage.reload()`
33. `expect(guestPage.getByRole("article").filter({ hasText: SEED.serviceName }).getByText(/Fulfilled/)).toBeVisible()`

### Success Criteria

#### Automated Verification

- `npm run test:e2e` exits 0; report shows 2 specs, 2 tests passing
- `npx tsc --noEmit` passes
- `npm run lint` passes

#### Manual Verification

- `npm run test:e2e:headed` — watch the flow execute in a visible browser;
  every step should produce visible UI changes matching the assertion names
- After staff fulfillment (step 30), the order card with `guestName` disappears
  from the list before the test moves to the guest page reload
- Guest page reload (step 32) shows "✓ Fulfilled" badge on the E2E Massage card

**Implementation Note**: Run headed mode at least once to confirm the flow is
visually correct, not just assertion-green. Cloud Supabase latency means any
step could exceed the default timeout — if a specific step is flaky, inspect
the Playwright trace (`trace: "on-first-retry"`) rather than increasing timeouts
globally.

---

## Testing Strategy

### E2E test structure

The golden path is one linear `test()` with `test.slow()` tripling the default
timeout (5 s → 15 s per assertion). Sequential `expect()` calls act as
checkpoints — a failure at step 19 (`waitForURL("**/guest/panel")`) proves
exactly that the QR auth redirect failed, not some downstream issue.

The `try/finally` block in the test ensures both browser contexts are always
closed even if an assertion throws, preventing resource leaks during
development.

### Locator strategy

All locators use `getByRole`, `getByLabel`, `getByText`, or `getByTestId` (for
the badge only). No CSS selectors, no XPath, no DOM structure traversal. The
`data-testid="pending-badge"` attribute is the only addition to production code
and is justified because the span has no ARIA role.

### Manual testing steps

1. Ensure `.env.test` exists with valid staff credentials
2. Ensure seed SQL rows exist in cloud Supabase (run once)
3. `npm run test:e2e` — should exit 0
4. `npm run test:e2e:headed` — visually confirm the browser executes the flow
5. If a step fails, run `npx playwright show-report` and inspect the trace

---

## Migration Notes

The `data-testid="pending-badge"` change in `StaffLayout.astro` is purely additive
— no existing behavior changes.

---

## References

- Test plan: `context/foundation/test-plan.md` §3 Phase 3
- Phase 1 plan (Vitest): `context/changes/testing-runner-qr-auth-path/plan.md`
- QR auth logic: `src/lib/qr-auth.ts:34–38` (queries `room_qr_codes` by `qr_token`)
- Signin form hotel-code validation: `src/components/auth/SignInForm.tsx:41–43`
- OrderList fulfill dialog: `src/components/staff/OrderList.tsx:67–89`
- StaffLayout badge: `src/layouts/StaffLayout.astro:58`
- AddonList polling interval: `src/components/guest/AddonList.tsx:57` (20 s)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Playwright Bootstrap

#### Automated

- [x] 1.1 npm install completes without errors — 28dd754
- [x] 1.2 npx playwright install --with-deps chromium completes — 28dd754
- [x] 1.3 npm run test:e2e exits 0; 1 spec, 1 test passing — 28dd754
- [x] 1.4 npx tsc --noEmit passes including playwright.config.ts — 28dd754

#### Manual

- [x] 1.5 npx playwright show-report shows smoke passed, no warnings — 28dd754

### Phase 2: Seed Constants + Test Infrastructure

#### Automated

- [x] 2.1 npm run test:e2e exits 0 after Phase 2 changes — 3d008a6
- [x] 2.2 npx tsc --noEmit passes — 3d008a6

#### Manual

- [x] 2.3 .env.test.example tracked in git; .env.test absent from git status — 3d008a6
- [x] 2.4 Seed SQL inserts succeed in Supabase dashboard (4 rows, no conflicts) — 3d008a6
- [x] 2.5 Staff test account exists in Supabase Auth with staff_role metadata — 3d008a6

### Phase 3: Golden Path Spec

#### Automated

- [x] 3.1 npm run test:e2e exits 0; 2 specs, 2 tests passing — 63b08ce
- [x] 3.2 npx tsc --noEmit passes — 63b08ce
- [x] 3.3 npm run lint passes — 63b08ce

#### Manual

- [x] 3.4 npm run test:e2e:headed — flow visible in browser, all steps produce correct UI changes — 63b08ce
- [x] 3.5 After staff fulfillment the order card disappears before guest page reload — 63b08ce
- [x] 3.6 Guest page reload shows "✓ Fulfilled" on the E2E Massage card — 63b08ce

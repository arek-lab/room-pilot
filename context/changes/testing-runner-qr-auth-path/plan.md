# Phase 1 Test Coverage: Runner + QR Auth Path

## Overview

Bootstrap Vitest from zero and write Phase 1 test coverage for Risks R1, R2, and R3. The project has no test infrastructure today. This plan creates it and delivers the first meaningful suites: middleware unit tests (R2 + R3) and a QR route integration test (R1).

## Current State Analysis

No test dependencies, no `vitest.config.ts`, no `src/__tests__/` directory. The middleware (`src/middleware.ts`) uses `jose` for HS256 JWT verification and imports `GUEST_SESSION_SECRET` via `astro:env/server` — a module that does not exist in Node. The QR route business logic lives entirely in `.astro` frontmatter, which Vitest cannot import directly. The project is ESM (`"type": "module"`) with a `"vite": "^7.3.2"` override in `package.json` — Vitest version compatibility must be verified at install time.

## Desired End State

`npm test` exits 0 with 7 tests across 3 suites:
1. `src/__tests__/smoke.test.ts` — 1 trivial test confirming the runner works
2. `src/__tests__/middleware.test.ts` — 5 unit tests covering all middleware JWT paths (R2 + R3)
3. `src/__tests__/qr-auth.test.ts` — 2 integration tests covering the QR auth flow (R1)

**Verification**: `npm test` green; `npx tsc --noEmit` clean; `npm run lint` clean.

### Key Discoveries

- Cookie name for guest session: `guest_session` (`src/middleware.ts:26`)
- JWT library: `jose`, function `jwtVerify` (`src/middleware.ts:3,30`) — `exp` enforcement is automatic; no explicit check needed
- Locals type: `GuestTokenLocals | null` for `guestToken`, `User | null` for `user` (`src/env.d.ts:1–14`)
- QR route signs session with `exp = new Date(check_out_date + "T23:59:59Z")` (`src/pages/qr/room/[qr_token].astro:68`)
- `pending_guest` carries `type: "pending_guest"` claim; QR handler verifies it (`src/pages/qr/room/[qr_token].astro:30–31`)
- `processQrAuth` extraction required: `.astro` frontmatter is not importable by Vitest

## What We're NOT Doing

- No Playwright / E2E (Phase 3 of test rollout)
- No order flow or IDOR tests (Phase 2 of test rollout)
- No React component tests
- No real Supabase instance required (Phase 1 mocks the client)
- No coverage reporting wiring (add in Phase 4 CI work)
- No Wrangler / Workers runtime tests (excluded per test-plan §7)
- No CI GitHub Actions wiring (Phase 4)

## Implementation Approach

Three phases each independently verifiable. Phase 1 confirms the runner boots before any test logic is written. Phase 2 tests middleware in pure isolation — real `jose` calls, mocked `astro:env/server` and Supabase client. Phase 3 extracts the QR route's business logic to a testable TypeScript module, then writes integration tests against it with a mocked Supabase client.

`astro:env/server` is intercepted via `vi.mock` hoisting in each test file — the mock factory runs before any module resolution, so the physical module not existing in Node is not an issue. All Phase 1 tests run in Node environment; no DOM needed.

## Critical Implementation Details

**`astro:env/server` mock hoisting**: `vi.mock("astro:env/server", () => ({ ... }))` is hoisted by Vitest's AST transform before any `import` statements execute. The mock intercepts the module specifier string before Node's module resolution runs — this works even though no physical `astro:env/server` file exists. Every test file that transitively imports from this module must declare the mock at the top of the file.

**QR route is an Astro page**: Astro `.astro` frontmatter is not a module that Vitest (or any bundler) can import. R1's integration test requires extracting the business logic to `src/lib/qr-auth.ts` — a plain TypeScript file with no Astro dependencies. The `.astro` file becomes a thin adapter (cookie setting + redirects). This is the only production code change in the plan and has no behavior impact.

**Use real `jose` in middleware tests (R3)**: Do not mock `jwtVerify`. R3's challenge is "JWT parses ≠ `exp` is actually checked." The only way to prove expiry enforcement is to pass a real expired JWT to real `jwtVerify` and observe that the middleware catches the thrown `JWTExpired` error and sets `guestToken = null`. Mocking `jose` would test mock behavior, not the actual enforcement.

---

## Phase 1: Vitest Bootstrap

### Overview

Install Vitest, create `vitest.config.ts`, add npm scripts, create `src/__tests__/` with a smoke test. The goal is a working test runner before any test logic is written.

### Changes Required

#### 1. Install Vitest

**File**: `package.json` (devDependencies)

**Intent**: Add Vitest as the test runner and coverage provider.

**Contract**: Add to `devDependencies`:
```json
"vitest": "latest",
"@vitest/coverage-v8": "latest"
```
After `npm install`, check for peer dep warnings related to the `"vite": "^7.3.2"` override. If Vitest's bundled Vite conflicts with the override, use the latest Vitest version that explicitly supports Vite 7 (check `vitest` changelog). Resolve all peer dep conflicts before proceeding.

#### 2. Add test scripts

**File**: `package.json` (scripts)

**Intent**: Expose test commands for local development and CI.

**Contract**: Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

#### 3. Create vitest.config.ts

**File**: `vitest.config.ts` (new, project root)

**Intent**: Configure Vitest with Node environment, the `@/*` path alias matching `tsconfig.json`, and the test file glob.

**Contract**:
```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```
`globals: true` makes `describe`, `it`, `expect`, `vi` available without explicit imports in every test file.

#### 4. Create smoke test

**File**: `src/__tests__/smoke.test.ts` (new)

**Intent**: A trivially passing test that confirms runner, TypeScript compilation, and `@/*` alias resolution work end-to-end.

**Contract**: One describe block with one `expect(1 + 1).toBe(2)` test. Also import one symbol via `@/` alias (e.g., `import type { Database } from "@/types"`) to confirm alias resolution works at import time.

### Success Criteria

#### Automated Verification

- `npm install` completes with no peer dep errors or unresolved conflicts
- `npm test` exits 0; output shows 1 suite, 1 test passing
- `npm run lint` passes on `vitest.config.ts` and `src/__tests__/smoke.test.ts`
- `npx tsc --noEmit` passes

#### Manual Verification

- `npm test` output contains no unexpected warnings (no "cannot find module astro:*", no Vite version mismatch)

**Implementation Note**: After all automated verification passes, confirm manually that test output is clean before proceeding to Phase 2.

---

## Phase 2: Middleware Unit Tests (R2 + R3)

### Overview

Write unit tests for `src/middleware.ts` covering all guest JWT paths and the staff path. No Supabase instance needed — the Supabase client is mocked. Real `jose` is used for JWT signing and verification to prove `exp` enforcement genuinely works.

### Changes Required

#### 1. Create middleware test file

**File**: `src/__tests__/middleware.test.ts` (new)

**Intent**: Prove middleware correctly populates `context.locals.guestToken` for valid JWTs, sets it to `null` for all failure modes, and never throws. Also verify the staff auth path populates `context.locals.user`.

**Contract**:

Mock declarations at the top of the file (hoisted by Vitest before imports):

```typescript
vi.mock("astro:env/server", () => ({
  GUEST_SESSION_SECRET: "a".repeat(64),  // 64 hex chars = 32 bytes
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "test-anon-key",
}));

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));
```

The test file imports `{ onRequest } from "@/middleware"` after the mocks are declared.

Helper: a `makeContext(cookieValue?: string)` factory that returns a minimal `App.Locals`-compatible context object:
```typescript
const makeContext = (cookieValue?: string) => ({
  cookies: {
    get: vi.fn((name: string) =>
      name === "guest_session" && cookieValue ? { value: cookieValue } : undefined
    ),
  },
  locals: {} as App.Locals,
  url: { pathname: "/guest/panel" },
  redirect: vi.fn(),
  request: { headers: new Headers() },
});
```

Helper: `signJwt(payload, expiry)` that signs a JWT using the same test secret (`"a".repeat(64)` encoded via `TextEncoder`) and returns the JWT string. This lets each test produce a real JWT for its scenario.

**Test cases** (all in a `describe("middleware — guest JWT")` block):

1. **"valid JWT → guestToken populated with all fields"**: sign a JWT with `{tokenId: "t1", roomNumber: "101", packageId: "p1", checkOutDate: "2026-12-31"}` and `exp` = now + 1 hour. Call `onRequest(ctx, next)`. Assert `ctx.locals.guestToken` equals `{tokenId: "t1", roomNumber: "101", packageId: "p1", checkOutDate: "2026-12-31", exp: <number>}`.

2. **"expired JWT → guestToken null, no throw"** (R3 core test): sign a JWT with the same payload but `exp` = now − 1 second. Call `onRequest`. Assert `ctx.locals.guestToken === null`. Assert `next` was still called (middleware did not throw or halt).

3. **"tampered JWT → guestToken null"**: take a valid JWT string and replace the last character with a different one. Assert `ctx.locals.guestToken === null`.

4. **"missing cookie → guestToken null"**: call `makeContext()` with no cookie value. Assert `ctx.locals.guestToken === null`.

5. **"missing GUEST_SESSION_SECRET → guestToken null"**: in this test, use `vi.doMock` (non-hoisted) to override the `astro:env/server` mock with `GUEST_SESSION_SECRET: undefined`, then re-import middleware. Assert `ctx.locals.guestToken === null`.

For tests 1–4, the Supabase client mock should return `{ data: { user: null }, error: null }` from `auth.getUser()` so the staff path runs cleanly without interference.

### Success Criteria

#### Automated Verification

- `npm test` exits 0; all 6 tests pass (1 smoke + 5 middleware)
- `npx tsc --noEmit` passes

#### Manual Verification

- Each test name clearly identifies the risk it covers (R2 or R3)
- The expired-token test output shows the test name contains "expired" and passes — confirming R3's expiry enforcement, not just "some failure"

**Implementation Note**: After all automated verification passes, confirm manually that test descriptions are readable and map to the risk register before proceeding to Phase 3.

---

## Phase 3: QR Route Integration Test (R1)

### Overview

Extract the QR auth business logic from `src/pages/qr/room/[qr_token].astro` into `src/lib/qr-auth.ts`, then write integration tests that call `processQrAuth` directly with a mocked Supabase client. The `.astro` file becomes a thin adapter.

### Changes Required

#### 1. Create `src/lib/qr-auth.ts`

**File**: `src/lib/qr-auth.ts` (new)

**Intent**: A pure TypeScript module containing `processQrAuth` — the route's business logic isolated from Astro's cookie/redirect APIs. Takes all external dependencies as parameters so tests can inject mocks.

**Contract**:

```typescript
import { jwtVerify, SignJWT } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";

export type QrAuthResult =
  | { type: "success"; sessionJwt: string; sessionExpiry: Date }
  | { type: "error"; reason: "invalid" | "expired" };

export async function processQrAuth(params: {
  qrToken: string;
  pendingCookieValue: string | undefined;
  secret: Uint8Array;
  supabase: SupabaseClient;
  today: string;           // YYYY-MM-DD; injected for deterministic tests
}): Promise<QrAuthResult>
```

The implementation is a direct extraction of the current [qr_token].astro logic in the same order:
1. Verify `pendingCookieValue` with `jwtVerify` and check `payload.type === "pending_guest"`
2. Query `room_qr_codes` for `qrToken` → get `room_number`
3. Query `guest_tokens` for `pendingPayload.tokenId` → get `{id, room_number, package_id, check_out_date}`
4. Check room match
5. Check `check_out_date < today`
6. Sign session JWT with `setExpirationTime(new Date(check_out_date + "T23:59:59Z"))` and return it

On any step failure, return `{ type: "error", reason: "invalid" | "expired" }`. On success, return `{ type: "success", sessionJwt, sessionExpiry }`.

The function does not set cookies, redirect, or read from `Astro.*`. All such side effects stay in the `.astro` adapter.

#### 2. Update `src/pages/qr/room/[qr_token].astro`

**File**: `src/pages/qr/room/[qr_token].astro`

**Intent**: Replace inline logic with a call to `processQrAuth`, then act on the returned discriminated union to set cookies and redirect. No behavior change.

**Contract**: The frontmatter becomes:
1. Early return: if `context.locals.guestToken` → `Astro.redirect("/guest/panel", 302)`
2. `const result = await processQrAuth({ qrToken: Astro.params.qr_token, pendingCookieValue: Astro.cookies.get("pending_guest")?.value, secret: new TextEncoder().encode(GUEST_SESSION_SECRET), supabase: createServiceRoleClient(context)!, today: new Date().toISOString().slice(0, 10) })`
3. On `result.type === "error"` → `Astro.redirect("/guest/error?reason=" + result.reason, 302)`
4. On `result.type === "success"`:
   - Set `guest_session` cookie with `result.sessionJwt`, `expires: result.sessionExpiry`, `path: "/"`, `httpOnly: true`, `secure: true`, `sameSite: "lax"`
   - Clear `pending_guest` cookie (`path: "/qr"`, `maxAge: 0`, `httpOnly: true`, `secure: true`, `sameSite: "lax"`)
   - `Astro.redirect("/guest/panel", 302)`

#### 3. Create QR auth integration test file

**File**: `src/__tests__/qr-auth.test.ts` (new)

**Intent**: Test `processQrAuth` with mocked Supabase chains. Prove the R1 happy path issues a `guest_session` JWT with correct claims and the correct `exp`. Also prove expired `pending_guest` returns `error: invalid`.

**Contract**:

Mock declarations:
```typescript
vi.mock("astro:env/server", () => ({
  GUEST_SESSION_SECRET: "a".repeat(64),
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
}));
```

Supabase mock: create a `makeMockSupabase(roomRow, guestTokenRow)` helper that returns a Supabase client shaped object where:
- `.from("room_qr_codes").select(...).eq(...).maybeSingle()` resolves to `{ data: roomRow, error: null }`
- `.from("guest_tokens").select(...).eq(...).maybeSingle()` resolves to `{ data: guestTokenRow, error: null }`

The chained call mock can use nested `vi.fn().mockReturnValue(...)` to satisfy Supabase's builder pattern.

**Test cases** (in a `describe("processQrAuth")` block):

1. **"happy path: issues guest_session JWT with correct claims"**:
   - Sign a valid `pending_guest` JWT: `{ tokenId: "gt-1", type: "pending_guest" }`, `exp` = now + 10 min
   - Mock Supabase: room row `{ room_number: "101" }`, guest token row `{ id: "gt-1", room_number: "101", package_id: "pkg-1", check_out_date: "2026-12-31" }`
   - `today = "2026-06-02"` (injected; before checkout)
   - Call `processQrAuth(...)`
   - Assert `result.type === "success"`
   - Decode `result.sessionJwt` with `jwtVerify` using the test secret
   - Assert payload contains `{ tokenId: "gt-1", roomNumber: "101", packageId: "pkg-1", checkOutDate: "2026-12-31" }`
   - Assert `payload.exp` equals `new Date("2026-12-31T23:59:59Z").getTime() / 1000` (within 1 second tolerance)

2. **"expired pending_guest → error: invalid"**:
   - Sign a `pending_guest` JWT with `exp` = now − 1 second
   - Call `processQrAuth(...)` (Supabase mock irrelevant — never reached)
   - Assert `result.type === "error"` and `result.reason === "invalid"`

### Success Criteria

#### Automated Verification

- `npm test` exits 0; all 7 tests pass (1 smoke + 5 middleware + 2 QR auth)
- `npx tsc --noEmit` passes — including `src/lib/qr-auth.ts` and the updated `.astro` file
- `npm run lint` passes

#### Manual Verification

- Navigate the QR auth flow in `npm run dev` after the refactor: `/guest/verify` → enter a valid token → see "scan QR code" screen → navigate to `/qr/room/<qr_token>` → confirm redirect to `/guest/panel` with `guest_session` cookie set
- In the R1 happy path test, decoded JWT payload shows all four claims plus `exp` matching end-of-day — test output should make this visible (log or assertion message)

**Implementation Note**: The manual QR flow verification in dev is mandatory after Phase 3. The `processQrAuth` extraction is a pure refactor — any behavioral change is a bug.

---

## Testing Strategy

### Unit Tests (Phase 2 — middleware)

Real `jose` is used for both signing test JWTs and verifying in middleware. This directly proves R3: `jwtVerify` throws `JWTExpired` on a past-`exp` JWT, the `catch {}` in middleware captures it, and `guestToken` is set to `null`. No `jose` mocking.

### Integration Tests (Phase 3 — QR route)

`processQrAuth` is tested with mocked Supabase chains. Test data must match the TypeScript types in `src/types.ts` exactly (e.g., `guest_tokens` row shape, `room_qr_codes` row shape) to avoid type errors that would also break at runtime.

### Manual Testing (Phase 3)

After extracting the route logic, manually walk the full QR auth flow in the dev server to confirm the refactor introduced no regression. Focus on: cookie is set with the correct name, path, and expiry; `pending_guest` is cleared; redirect lands on `/guest/panel`.

---

## References

- Research: `context/changes/testing-runner-qr-auth-path/research.md`
- Test plan: `context/foundation/test-plan.md`
- Middleware: `src/middleware.ts:26–43`
- QR route handler: `src/pages/qr/room/[qr_token].astro`
- Locals type: `src/env.d.ts:1–14`
- Supabase table types: `src/types.ts:42–92` (guest_tokens), `198–221` (room_qr_codes)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 npm install completes with no peer dep errors — 96159ed
- [x] 1.2 npm test exits 0; 1 suite, 1 test passing — 96159ed
- [x] 1.3 npm run lint passes on vitest.config.ts and smoke.test.ts — 96159ed
- [x] 1.4 npx tsc --noEmit passes — 96159ed

#### Manual

- [x] 1.5 npm test output contains no unexpected warnings (no astro:* module errors, no Vite version mismatch)

### Phase 2: Middleware Unit Tests (R2 + R3)

#### Automated

- [x] 2.1 npm test exits 0; all 6 tests pass (1 smoke + 5 middleware) — 326fc83
- [x] 2.2 npx tsc --noEmit passes — 326fc83

#### Manual

- [x] 2.3 Each test name clearly identifies R2 or R3
- [x] 2.4 Expired-token test passes and output confirms guestToken === null for a past-exp JWT

### Phase 3: QR Route Integration Test (R1)

#### Automated

- [x] 3.1 npm test exits 0; all 7 tests pass (1 smoke + 5 middleware + 2 QR auth) — caa604f
- [x] 3.2 npx tsc --noEmit passes including src/lib/qr-auth.ts and updated .astro — caa604f
- [x] 3.3 npm run lint passes — caa604f

#### Manual

- [x] 3.4 QR auth flow works correctly end-to-end in npm run dev after processQrAuth extraction — caa604f
- [x] 3.5 R1 happy path test decodes sessionJwt and verifies all four claims plus exp=T23:59:59Z — caa604f

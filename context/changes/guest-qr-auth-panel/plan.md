# Guest QR Auth and Service Panel Implementation Plan

## Overview

Build the S-02 guest access flow: two-step QR verification (token QR from reception → room QR on the wall) that issues a `guest_session` JWT cookie, plus a read-only service panel showing included services, available add-ons, and existing order status badges. No order placement in this slice (S-03).

## Current State Analysis

Staff can generate guest tokens at `/dashboard/generate-token` (S-01 complete). The QR encodes `/guest/verify?token=<uuid>`, which currently returns a 404. The foundation is well-prepared for this slice:

- `guest_tokens`, `room_qr_codes`, `services`, `packages`, `package_services`, `orders` — all seeded and live in Supabase
- `src/middleware.ts` already extracts `guest_session` JWT cookie into `context.locals.guestToken` (try/catch, HS256 via `jose:jwtVerify`) — no middleware changes needed
- `App.Locals` declares `guestToken: { tokenId, roomNumber, packageId, exp } | null`
- `GUEST_SESSION_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are both declared in `astro.config.mjs` env schema and `.env.example`
- `jose` is installed (imported in `src/middleware.ts`) — `SignJWT` just needs to be imported
- Room QR codes are static UUIDs seeded in `room_qr_codes` (rooms 101–110)
- `package_services.inclusion_type` ('included' / 'addon') drives the panel's two-section split

No new Supabase migrations required — guest DB queries use the service role key (bypasses RLS) with explicit `WHERE` guards in app code.

## Desired End State

A guest scans the QR printed at reception → `/guest/verify?token=<uuid>` validates the token in DB, sets a short-lived `pending_guest` cookie, and displays a "now scan room QR" instruction screen. Guest scans the QR affixed to the hotel room wall → `/qr/room/<qr_token>` validates the room UUID, verifies it matches the token's room, issues the full `guest_session` JWT cookie, and redirects to `/guest/panel`. The panel shows their package's included services and available add-ons with any existing order status badges. Expired token → human-readable expired message; invalid/unknown token → generic error. Already-authenticated guests who re-scan any QR are silently redirected to the panel.

### Key Discoveries

- `context.locals.guestToken` is populated by the existing middleware — guest pages read this directly without re-verifying the JWT
- `room_qr_codes.qr_token` (UUID) is the slug for the room QR URL; `room_qr_codes.room_number` cross-checks against `guest_tokens.room_number`
- `package_services.inclusion_type` drives the included/addon split; `orders.guest_token_id` links orders to the guest token for badge display
- `@supabase/ssr` is the installed package; the service role client can be created via `createServerClient` from that same package with a no-op cookie handler and `auth.persistSession: false`
- `jose`'s `SignJWT` uses a builder pattern (not yet in codebase); middleware `jwtVerify` uses the same `GUEST_SESSION_SECRET` as the signing secret

## What We're NOT Doing

- Add-on order placement and cancellation (S-03)
- AI concierge integration (S-05)
- Guest-specific RLS policies (service role + app-level WHERE guards instead)
- Token revocation before check-out or early logout
- Multiple device support per stay (one `guest_session` per device — acceptable for MVP)
- Staff token listing / management UI (parked in roadmap)

## Implementation Approach

Three sequential Astro SSR pages — no React islands needed for S-02 (all data is read-only, no client-side state). A `createServiceRoleClient()` helper is added to `src/lib/supabase.ts` for guest DB queries. JWT signing for both cookies uses `jose`'s `SignJWT` with `GUEST_SESSION_SECRET`.

Step-1 (`/guest/verify`) validates the token and sets a short-lived `pending_guest` cookie. Step-2 (`/qr/room/[qr_token]`) upgrades it to the full `guest_session` cookie. The middleware already handles `guest_session` extraction; the `pending_guest` cookie is read and cleared only in the room QR page.

## Critical Implementation Details

**JWT `exp` for `guest_session`**: Set to end-of-day of `check_out_date` (23:59:59 UTC), not midnight at the start of that day. Convert the `YYYY-MM-DD` string with `new Date(check_out_date + "T23:59:59Z")`. Setting exp to start-of-day would cut off guest access before the check-out day begins.

**`sameSite: "lax"` on both cookies**: The room QR page is opened by the phone camera as a top-level navigation, not a cross-site POST. `sameSite: "lax"` allows the `pending_guest` cookie to be sent on this navigation; `sameSite: "strict"` would block it.

**`jose` `SignJWT` builder pattern** (not yet in codebase — easy to misuse):
```ts
import { SignJWT } from "jose";
const secret = new TextEncoder().encode(GUEST_SESSION_SECRET);
const token = await new SignJWT({ ...payload })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime(expiryDateOrString)  // "10m" or a Date object
  .sign(secret);
```

---

## Phase 1: Token QR Verification

### Overview

Add the `createServiceRoleClient()` helper, implement `/guest/verify` (the landing page when a guest scans the token QR), and add the shared guest error page. On a valid token: sets `pending_guest` cookie, renders instruction screen. On expired: readable expired message. On invalid/missing: generic error. Already-authenticated guests redirect to the panel.

### Changes Required

#### 1. Service role Supabase client helper

**File**: `src/lib/supabase.ts`

**Intent**: Add a `createServiceRoleClient()` export so guest pages can query the DB without a Supabase Auth session. The existing `createClient()` depends on the auth cookie session that guests don't have.

**Contract**: New named export `createServiceRoleClient()` returns a typed `SupabaseClient<Database>` created via `createServerClient` from `@supabase/ssr` using `SUPABASE_SERVICE_ROLE_KEY`, a no-op cookie handler (`getAll: () => []`, `setAll: () => {}`), and `auth: { persistSession: false }`.

#### 2. Guest error page

**File**: `src/pages/guest/error.astro`

**Intent**: Shared error destination for all guest flow failures, keeping individual endpoint URLs clean. Reads a `?reason=` query param to select the appropriate message.

**Contract**: SSR page. Reads `Astro.url.searchParams.get("reason")`. Renders "Your stay access has expired — please ask reception for assistance" for `reason=expired`; renders generic "Access not available — please contact reception" for all other values. Uses `Layout.astro` directly (no guest header, since the guest may not be authenticated).

#### 3. Guest verify page

**File**: `src/pages/guest/verify.astro`

**Intent**: Server-side entry point for the token QR scan. Reads `?token=<uuid>`, validates against DB, decides outcome (redirect / pending cookie + instruction screen / error), and renders the appropriate UI inline.

**Contract**: SSR page with `export const prerender = false`. Server logic sequence:
1. If `context.locals.guestToken` is set → `return Astro.redirect("/guest/panel", 302)`.
2. Read `Astro.url.searchParams.get("token")`. If missing or not a valid UUID format → render "invalid" inline error view.
3. Query `guest_tokens WHERE token_value = $token` using service role client. If no row → render "invalid" inline error (do not distinguish "not found" from other failures — avoids UUID enumeration).
4. If `check_out_date < today (UTC date string comparison)` → render "expired" inline error.
5. Issue `pending_guest` JWT (payload: `{ tokenId: row.id, type: "pending_guest" }`; exp: 10 min) signed with `GUEST_SESSION_SECRET`; set cookie `pending_guest` (httpOnly, secure, sameSite: "lax", path: "/", maxAge: 600).
6. Render instruction screen: "Step 2 of 2 — Scan the QR code in your room to complete access."

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Visiting `/guest/verify?token=<valid-uuid>` renders the instruction screen and sets a `pending_guest` cookie
- Visiting `/guest/verify?token=<expired-token-uuid>` (check_out_date in the past) renders the expired message inline
- Visiting `/guest/verify` (no token) or with a garbage UUID renders the generic invalid message inline
- Visiting `/guest/verify?token=<valid-uuid>` with a valid `guest_session` cookie already present redirects to `/guest/panel`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Room QR Verification and Session Issuance

### Overview

Implement `/qr/room/[qr_token]` — the page encoded in the physical room QR. Validates the room UUID against DB, cross-checks against the `pending_guest` cookie's tokenId, issues the full `guest_session` JWT cookie, and redirects to the panel.

### Changes Required

#### 1. Room QR verification page

**File**: `src/pages/qr/room/[qr_token].astro`

**Intent**: Complete the two-step verification by confirming the guest is physically in the correct room. Opened by the phone camera as a top-level GET — receives no prior state except cookies.

**Contract**: Astro SSR dynamic route. `Astro.params.qr_token` is the room UUID slug. Server logic:
1. If `context.locals.guestToken` is set → `return Astro.redirect("/guest/panel", 302)`.
2. Read and verify `pending_guest` cookie (try/catch with `jwtVerify`). If missing or invalid → `return Astro.redirect("/guest/error?reason=invalid", 302)`.
3. Query `room_qr_codes WHERE qr_token = $slug` using service role. If not found → redirect to `/guest/error?reason=invalid`.
4. Query `guest_tokens WHERE id = $payload.tokenId` using service role. If not found OR `room_number !== room.room_number` → redirect to `/guest/error?reason=invalid` (room mismatch is opaque — same generic error as not-found).
5. If `check_out_date < today (UTC)` → redirect to `/guest/error?reason=expired`.
6. Issue `guest_session` JWT (payload: `{ tokenId: guestToken.id, roomNumber: guestToken.room_number, packageId: guestToken.package_id }`; exp: `new Date(guestToken.check_out_date + "T23:59:59Z")`). Set cookie `guest_session` (httpOnly, secure, sameSite: "lax", path: "/", expires: same Date).
7. Clear `pending_guest` cookie (set to empty, maxAge: 0).
8. `return Astro.redirect("/guest/panel", 302)`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification

- Visiting `/qr/room/<valid-qr_token>` with a valid `pending_guest` cookie for the matching room sets `guest_session` cookie and redirects to `/guest/panel`
- Visiting `/qr/room/<valid-qr_token>` with no `pending_guest` cookie redirects to `/guest/error?reason=invalid`
- Visiting `/qr/room/<valid-qr_token>` with a `pending_guest` cookie whose tokenId is for a different room redirects to `/guest/error?reason=invalid`
- Visiting `/qr/room/<valid-qr_token>` when already authenticated (`guest_session` present) redirects silently to `/guest/panel`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Guest Panel

### Overview

Build `GuestLayout.astro` and `/guest/panel.astro`. The panel queries the guest's package services (included + add-ons) and any existing orders, then renders the two-section layout with status badges. No order placement UI (S-03).

### Changes Required

#### 1. Guest layout

**File**: `src/layouts/GuestLayout.astro`

**Intent**: Consistent page wrapper for all guest-facing pages, displaying room and guest context in a slim header. Mirrors the `StaffLayout.astro` pattern so S-05 (AI concierge) can extend it with minimal friction.

**Contract**: Props `{ roomNumber: string; guestName: string; checkOutDate: string }`. Wraps `Layout.astro` with `<slot />`. Renders a slim header bar containing: room number (prominent), guest name, and check-out date formatted as a human-readable date string. No nav links. No `print:hidden` rules.

#### 2. Guest panel page

**File**: `src/pages/guest/panel.astro`

**Intent**: Main guest-facing screen. All data fetched SSR — no React islands needed for S-02's read-only view.

**Contract**: SSR page with `export const prerender = false`. Server logic:
1. If `!context.locals.guestToken` → `return Astro.redirect("/guest/error?reason=invalid", 302)`.
2. Query `guest_tokens WHERE id = $tokenId` using service role. If not found OR `check_out_date < today (UTC)` → `return Astro.redirect("/guest/error?reason=expired", 302)`.
3. Query `package_services JOIN services WHERE package_services.package_id = $packageId AND services.active = true` using service role. Split results into `included[]` (inclusion_type = 'included') and `addons[]` (inclusion_type = 'addon').
4. Query `orders WHERE guest_token_id = $tokenId` using service role. Build a lookup map `{ [service_id]: order.status }`.
5. Render `GuestLayout` with room_number, guest_name, check_out_date from step 2.
6. Section 1 "Included in your package": each service as a card row with a green ✓ badge, service name, and description.
7. Section 2 "Available add-ons": each addon as a card row. If `orderMap[service.id]` exists, render a status badge: ⏳ Pending (yellow) / ✓ Fulfilled (green) / ✕ Cancelled (gray). If no order exists for the service, render service name and description only — no button (S-03 adds the Order button).

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Full two-step QR flow completes: scan token QR → instruction screen → scan room QR → panel loads
- Panel header shows correct room number, guest name, and check-out date
- "Included in your package" section lists all included services for the guest's package with ✓ badges
- "Available add-ons" section lists all add-on services for the package
- Manually inserting an order row in Supabase with the test tokenId shows the correct status badge on panel reload
- No regressions: staff login, `/dashboard`, and QR generation still work
- Accessing `/guest/panel` with a cookie whose token has expired (check_out_date in past) redirects to `/guest/error?reason=expired`
- Accessing `/guest/panel` without a `guest_session` cookie redirects to `/guest/error?reason=invalid`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Manual Testing Steps

1. Generate a token via `/dashboard/generate-token`; note the token UUID from the network response or Supabase dashboard
2. Visit `/guest/verify?token=<uuid>` — confirm instruction screen renders and `pending_guest` cookie is set (check DevTools → Cookies)
3. Find the room's `qr_token` UUID in the Supabase `room_qr_codes` table for the room on the token; visit `/qr/room/<qr_token>` — confirm redirect to `/guest/panel` and `guest_session` cookie is set
4. Verify panel header matches token data; verify included services match the package's seed data
5. In Supabase, INSERT a row into `orders` (guest_token_id = tokenId, service_id = an add-on service id, status = 'pending'); refresh panel — confirm ⏳ badge appears
6. Test expired token: create a token with `check_out_date` = yesterday; visit `/guest/verify?token=<uuid>` — confirm expired message
7. Test wrong room: use a valid `pending_guest` cookie for room 101, visit `/qr/room/<qr_token-for-room-102>` — confirm redirect to `/guest/error?reason=invalid`
8. Test already-authenticated redirect: with a valid `guest_session` cookie, visit `/guest/verify?token=<any>` — confirm redirect to panel without re-verification

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-002, FR-003, FR-004, FR-006, FR-007, FR-010, US-01)
- Prior implementation: `context/changes/staff-auth-qr-generation/plan.md`
- Middleware: `src/middleware.ts:26-42` (guest_session JWT extraction)
- Schema: `supabase/migrations/20260528000001_schema.sql` (tables and indexes)
- RLS migrations: `supabase/migrations/20260529000*.sql`
- Supabase client: `src/lib/supabase.ts:1-25`
- Lessons: `context/foundation/lessons.md` — app_metadata key naming; INSERT+SELECT RLS

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token QR Verification

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 Valid token renders instruction screen and sets `pending_guest` cookie
- [x] 1.4 Expired token renders expired message inline
- [x] 1.5 Missing/invalid token renders generic invalid message inline
- [ ] 1.6 Already-authenticated guest redirects to `/guest/panel`

### Phase 2: Room QR Verification and Session Issuance

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`

#### Manual

- [ ] 2.3 Valid room QR + matching pending cookie → `guest_session` cookie set, redirect to panel
- [ ] 2.4 Valid room QR + no pending cookie → redirect to `/guest/error?reason=invalid`
- [ ] 2.5 Valid room QR + pending cookie for different room → redirect to `/guest/error?reason=invalid`
- [ ] 2.6 Already-authenticated guest visiting room QR → silent redirect to panel

### Phase 3: Guest Panel

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Full two-step QR flow completes and lands on panel
- [ ] 3.5 Panel header shows correct room number, guest name, and check-out date
- [ ] 3.6 "Included" section lists correct services with ✓ badges
- [ ] 3.7 "Add-ons" section lists correct add-on services
- [ ] 3.8 Manually inserted order shows correct status badge on reload
- [ ] 3.9 No regressions in staff login, dashboard, QR generation
- [ ] 3.10 Expired token redirects to `/guest/error?reason=expired`
- [ ] 3.11 Missing `guest_session` cookie redirects to `/guest/error?reason=invalid`

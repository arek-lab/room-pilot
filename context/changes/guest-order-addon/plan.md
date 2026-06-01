# Guest Order Add-On Implementation Plan

## Overview

Build S-03: the guest can place and cancel add-on orders inline from the panel, with live status badges. Reception staff sees a pending-order count badge in the nav bar and a summary card on the dashboard. No email notifications — the staff badge is the notification mechanism. No schema migrations needed; the `orders` table (with `status CHECK ('pending','fulfilled','cancelled')` and `updated_at` trigger) is already production-ready.

## Current State Analysis

S-02 is complete. The guest panel at `/guest/panel.astro` renders add-ons as a static SSR list with read-only status badges — no Order or Cancel buttons. The `orders` table exists with the correct schema and RLS (staff can read and update all orders via their authenticated client; guest API routes use `createServiceRoleClient()` which bypasses RLS, with explicit `WHERE guest_token_id = tokenId` guards in app code). The middleware already populates `context.locals.guestToken` on every request, so the guest API endpoints get identity for free without additional JWT handling.

Key schema facts for this slice:
- `orders.status` — CHECK constraint: `'pending' | 'fulfilled' | 'cancelled'`; DEFAULT `'pending'`
- `orders.updated_at` — auto-updated by trigger on every UPDATE
- No UNIQUE constraint on `(guest_token_id, service_id)` — multiple orders per service are allowed by the schema; duplicate-pending guard is enforced in app code

## Desired End State

A guest with a valid session opens the panel → add-on rows each show an "Order" button with the service price. Clicking Order → spinner → ⏳ Pending badge + Cancel button appears inline (no page reload). Clicking Cancel → ✕ Cancelled badge + Order button reappears (re-orderable). Services with a `fulfilled` order show ✓ Fulfilled badge only (no button). Staff opens `/dashboard` → nav bar shows "Orders (N)" badge; dashboard shows a pending count card. The full order management UI (list, mark fulfilled/cancelled) is S-04.

### Key Discoveries

- `context.locals.guestToken` carries `{ tokenId, packageId, roomNumber }` — guest API routes read this directly; no extra JWT verification needed (`src/middleware.ts:26-42`)
- `createServiceRoleClient()` is the correct client for guest endpoints — same pattern as S-02 pages (`src/lib/supabase.ts:6-19`)
- `package_services` has a unique `(package_id, service_id)` constraint — a single row lookup confirms whether the service is an add-on for the guest's package
- `services.price_pln` exists in the schema but is not fetched in the current panel query — needs to be added
- `orders` query in `panel.astro` currently fetches `service_id, status` only — needs `id` and `created_at` so the island can reference orderId for cancellation and sort by recency
- `StaffLayout.astro` has direct access to `Astro.request` and `Astro.cookies` (it's an Astro component) — can query the DB for pending count without prop threading
- `staff_read_orders` RLS policy is `FOR SELECT TO authenticated USING (true)` — authenticated staff can count all pending orders

## What We're NOT Doing

- Email notifications to reception (replaced by the staff dashboard badge; email is permanently out of scope for this slice)
- Guest re-ordering a `fulfilled` service — fulfilled means reception delivered it; no re-order for MVP
- Order notes field (exists in schema, not exposed in UI)
- Reception order management UI — list, mark fulfilled/cancelled (S-04)
- Supabase Realtime / WebSocket on the guest panel (polling or manual refresh left to S-04)

## Implementation Approach

Three sequential phases. Phase 1 adds the two guest API endpoints (place and cancel). Phase 2 converts the static add-ons section of `panel.astro` into a React island that manages local order state and calls the Phase 1 endpoints. Phase 3 wires the pending-order count into `StaffLayout.astro` and `dashboard.astro`.

Guest auth in API routes: `context.locals.guestToken` from middleware — no JWT re-verification.
Guest DB operations: `createServiceRoleClient()` with explicit `WHERE guest_token_id = tokenId` guards.
Staff DB operations: `createClient(Astro.request.headers, Astro.cookies)` — standard authenticated client with existing `staff_read_orders` RLS policy.

## Critical Implementation Details

**Multiple orders per service**: Re-ordering after cancellation inserts a new row — multiple rows can exist for the same `(guest_token_id, service_id)` pair. The island resolves "current status" by taking the most recent order per service (orders query must be sorted `created_at DESC`; the initial state map takes the first occurrence per `service_id` in the sorted array).

**Service role client for INSERT + SELECT**: The `orders` `INSERT` in the POST endpoint uses `createServiceRoleClient()`, which bypasses RLS entirely — the lesson about `.insert().select()` requiring both INSERT and SELECT policies applies only to the authenticated (anon/JWT) client, not the service role client. No additional migration needed.

---

## Phase 1: Guest Order API Endpoints

### Overview

Add `POST /api/guest/orders` (place order) and `PATCH /api/guest/orders/[id]` (cancel order). Both use `createServiceRoleClient()` and authenticate the guest via `context.locals.guestToken`.

### Changes Required

#### 1. Place-order endpoint

**File**: `src/pages/api/guest/orders/index.ts`

**Intent**: Accept a `serviceId`, verify it is an add-on for the guest's package, prevent duplicate pending orders, insert a new order row, and return the new order ID.

**Contract**: `export const prerender = false`. Export `POST: APIRoute`. Request body: `{ serviceId: string }` (zod-validated UUID). Logic sequence:
1. `context.locals.guestToken` absent → 401.
2. Validate body; invalid `serviceId` → 400.
3. Query `package_services WHERE package_id = $packageId AND service_id = $serviceId AND inclusion_type = 'addon'` using service role; not found → 403 (`"Service not available"`).
4. Query `orders WHERE guest_token_id = $tokenId AND service_id = $serviceId AND status = 'pending'` using service role; row found → 409 (`"Order already pending"`).
5. Insert `{ guest_token_id: tokenId, service_id: serviceId }` (status defaults to `'pending'`); use `.insert().select("id").single()`; DB error → 500.
6. Return 201 `{ orderId: row.id, status: "pending" }`.

#### 2. Cancel-order endpoint

**File**: `src/pages/api/guest/orders/[id].ts`

**Intent**: Transition a single pending order owned by this guest to `cancelled`. Refuses if the order is already fulfilled or cancelled (preventing double-cancel and fulfilled-cancel).

**Contract**: `export const prerender = false`. Export `PATCH: APIRoute`. `Astro.params.id` is the order UUID. Logic sequence:
1. `context.locals.guestToken` absent → 401.
2. Validate `id` is a UUID; invalid → 400.
3. Query `orders WHERE id = $id AND guest_token_id = $tokenId` (ownership check); not found → 404.
4. `order.status !== 'pending'` → 409 (`"Order cannot be cancelled"`).
5. `UPDATE orders SET status = 'cancelled' WHERE id = $id AND status = 'pending'` (double-guard against race); DB error → 500.
6. Return 200 `{ status: "cancelled" }`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification

- `POST /api/guest/orders` with valid guest cookie and an add-on serviceId returns 201 `{ orderId, status: "pending" }`; row visible in Supabase
- `POST /api/guest/orders` with same serviceId a second time returns 409
- `POST /api/guest/orders` with an included (non-addon) serviceId returns 403
- `PATCH /api/guest/orders/:id` with the pending orderId returns 200 `{ status: "cancelled" }`; row updated in Supabase
- `PATCH /api/guest/orders/:id` on an already-cancelled orderId returns 409
- All endpoints return 401 when called without a valid `guest_session` cookie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Guest Panel React Island

### Overview

Update `panel.astro` to fetch `id`, `created_at`, and `price_pln` from the DB, then replace the static add-ons section with a `AddonList` React island. The island owns order state and calls the Phase 1 endpoints.

### Changes Required

#### 1. Updated panel queries

**File**: `src/pages/guest/panel.astro`

**Intent**: Extend the two existing queries so the React island has the data it needs: price for the Order button label and order ID + creation time for cancel targeting and recency-based state resolution.

**Contract**:
- `package_services` select: change `services(id, name, description, active)` → `services(id, name, description, active, price_pln)`
- Filter nulls in the addon mapping: `.filter(r => r.inclusion_type === "addon" && r.services !== null).map(r => r.services!)`
- `orders` select: change `"service_id, status"` → `"id, service_id, status, created_at"`, add `.order("created_at", { ascending: false })`
- Remove the `orderMap` build (moved into the island)
- Replace the static add-ons `<ul>` with `<AddonList client:load addons={addons} initialOrders={ordersRows ?? []} />`

#### 2. AddonList React island

**File**: `src/components/guest/AddonList.tsx`

**Intent**: Render the add-ons list with interactive Order/Cancel buttons. Manage order state locally (no page reload). Show per-row loading spinners and inline error messages.

**Contract**: Props interface:
```ts
interface Addon { id: string; name: string; description: string | null; price_pln: number | null; }
interface OrderRecord { id: string; service_id: string; status: string; created_at: string; }
interface Props { addons: Addon[]; initialOrders: OrderRecord[]; }
```

State: `orders: Record<serviceId, { orderId: string; status: string }>` — built on mount from `initialOrders` sorted DESC (first occurrence per `service_id` wins). `loading: Record<serviceId, boolean>`. `errors: Record<serviceId, string | null>`.

Row rendering per addon:
- Latest order absent OR status `'cancelled'`: show price label + **Order** button (and ✕ Cancelled badge if cancelled)
- Status `'pending'`: show ⏳ Pending badge + **Cancel** button
- Status `'fulfilled'`: show ✓ Fulfilled badge only (no button)

Order handler: `POST /api/guest/orders` → on 201 set `orders[serviceId] = { orderId: body.orderId, status: 'pending' }` → on error set `errors[serviceId]`.

Cancel handler: `PATCH /api/guest/orders/${orderId}` → on 200 set `orders[serviceId].status = 'cancelled'` → on error set `errors[serviceId]`.

Error display: small red text below the button, re-enables button on error. Loading: button disabled with spinner text ("Ordering…" / "Cancelling…") during fetch.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Add-ons section renders with Order button + price for each add-on with no existing order
- Clicking Order shows spinner → ⏳ Pending badge + Cancel button appears without page reload
- Clicking Cancel on a pending order shows spinner → ✕ Cancelled badge + Order button appears without page reload
- After cancel, clicking Order again places a new order (new orderId); both rows visible in Supabase
- A service with a `fulfilled` order (set manually in Supabase) shows ✓ Fulfilled badge only — no button
- A service with a `pending` order shows no Order button (duplicate blocked at API level, but Order button is also absent in UI)
- On simulated API error (e.g., temporarily break the endpoint), inline error text appears and button re-enables
- Refreshing the page after placing/cancelling an order reflects the persisted state correctly (SSR initialOrders matches)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Staff Dashboard Badge

### Overview

Add a pending-order count to the staff experience: a numbered badge in the `StaffLayout.astro` nav bar (visible on all staff pages) and a summary card on `/dashboard`. Both query independently using the authenticated staff client.

### Changes Required

#### 1. Pending count badge in nav

**File**: `src/layouts/StaffLayout.astro`

**Intent**: Show reception staff the live count of pending orders on every page they visit, without requiring navigation to a specific orders page. The badge will link to the future S-04 orders panel; for now the link target is `/dashboard`.

**Contract**: Add a server-side block that creates `createClient(Astro.request.headers, Astro.cookies)` and queries `orders` with `{ count: "exact", head: true }` filtered to `status = 'pending'`. Assign result to `pendingCount` (default 0 on error or null). In the nav, add an "Orders" anchor after the existing "Generate Token" link; when `pendingCount > 0`, render a small rounded badge (red background, white text) with the number inline.

#### 2. Pending orders card on dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Give staff a visible at-a-glance summary of pending orders on the landing page, so the dashboard feels operational rather than just a placeholder.

**Contract**: Add a server-side pending count query (same pattern as StaffLayout — independent query, not a prop). Replace the current single centered card with a two-card layout (or add the orders card below the welcome card). The orders card shows: heading "Pending Orders", the count prominently, and a short label "orders awaiting fulfillment". Style consistent with the existing glassmorphism card (`rounded-2xl border border-white/10 bg-white/10`).

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Staff nav shows "Orders (N)" badge when N pending orders exist; badge absent when count is 0
- Dashboard card shows the correct pending order count
- Count updates on page reload after a guest places or cancels an order
- No regressions on `/dashboard/generate-token` (StaffLayout still renders correctly)
- Guest panel, QR verify, and QR room pages still work end-to-end

**Implementation Note**: After completing this phase and all automated verification passes, the full S-03 slice is complete.

---

## Testing Strategy

### Manual Testing Steps

1. Generate a guest token via `/dashboard/generate-token`; complete the two-step QR flow to land on `/guest/panel`
2. Confirm add-ons show Order button with price; click Order → verify ⏳ Pending badge + Cancel button appear inline
3. Click Cancel → verify ✕ Cancelled badge + Order button appear inline
4. Click Order again → verify new pending order; check Supabase `orders` table: two rows for same service (one cancelled, one pending)
5. In Supabase, manually update second order to `fulfilled`; refresh panel → verify ✓ Fulfilled badge with no button
6. In another tab, open `/dashboard` as staff → verify pending count card shows correct number
7. Place an order → refresh staff dashboard → verify count increments
8. Cancel the order → refresh staff dashboard → verify count decrements
9. Test duplicate blocking: with a pending order, directly call `POST /api/guest/orders` with the same serviceId → 409
10. Test unauthorised access: call order endpoints without `guest_session` cookie → 401

### Performance Considerations

The `StaffLayout.astro` count query runs on every staff page load. For MVP with a single pilot hotel (low order volume), this is negligible. If order volume grows, this can be replaced with a cached Supabase RPC or a 10-second polling interval aligned with the S-04 polling loop.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-008, FR-009, US-02)
- Prerequisite plan: `context/changes/guest-qr-auth-panel/plan.md`
- Panel page: `src/pages/guest/panel.astro`
- Supabase client helpers: `src/lib/supabase.ts`
- Middleware (guestToken): `src/middleware.ts:26-42`
- Schema: `supabase/migrations/20260528000001_schema.sql` (orders table)
- RLS: `supabase/migrations/20260528000002_rls.sql` (orders policies)
- Lessons: `context/foundation/lessons.md` — INSERT+SELECT RLS note (service role bypasses; not applicable here)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Guest Order API Endpoints

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — ac54dd2
- [x] 1.2 Linting passes: `npm run lint` — ac54dd2

#### Manual

- [ ] 1.3 POST /api/guest/orders with valid add-on returns 201 `{ orderId, status: "pending" }`
- [ ] 1.4 POST duplicate pending returns 409
- [ ] 1.5 POST with non-addon service returns 403
- [ ] 1.6 PATCH /api/guest/orders/:id cancels pending order, returns 200 `{ status: "cancelled" }`
- [ ] 1.7 PATCH on already-cancelled order returns 409
- [ ] 1.8 All endpoints return 401 without valid guest_session cookie

### Phase 2: Guest Panel React Island

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — 7426272
- [x] 2.2 Linting passes: `npm run lint` — 7426272
- [x] 2.3 Build succeeds: `npm run build` — 7426272

#### Manual

- [ ] 2.4 Add-ons render with Order button + price when no order exists
- [ ] 2.5 Clicking Order → ⏳ Pending + Cancel inline (no page reload)
- [ ] 2.6 Clicking Cancel → ✕ Cancelled + Order inline (no page reload)
- [ ] 2.7 Re-ordering after cancel places a new row in Supabase
- [ ] 2.8 Fulfilled order shows ✓ Fulfilled badge only
- [ ] 2.9 Inline error appears and button re-enables on API failure
- [ ] 2.10 Page refresh reflects persisted order state correctly

### Phase 3: Staff Dashboard Badge

#### Automated

- [x] 3.1 Type checking passes: `npx astro check` — 10fd963
- [x] 3.2 Linting passes: `npm run lint` — 10fd963
- [x] 3.3 Build succeeds: `npm run build` — 10fd963

#### Manual

- [ ] 3.4 Nav shows "Orders (N)" badge when N > 0 pending orders exist
- [ ] 3.5 Badge absent when no pending orders
- [ ] 3.6 Dashboard card shows correct pending count
- [ ] 3.7 Count updates on page reload after order state changes
- [ ] 3.8 No regressions on generate-token page, guest panel, QR flows

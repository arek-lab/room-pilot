# Reception Order Panel Implementation Plan

## Overview

Add a live, self-refreshing reception order panel to the staff dashboard: two new staff API endpoints, an `OrderList` React island that polls every 10 s and confirms actions via a dialog, and a live nav badge driven by a CustomEvent. Closes the self-service loop — staff can see every pending guest order and mark it fulfilled or cancelled without refreshing the page.

## Current State Analysis

- `src/pages/dashboard.astro` — placeholder page with a static pending-count card; no order list, no polling.
- `src/layouts/StaffLayout.astro:12-16` — badge is server-rendered conditionally; no DOM `id`; no client-side update path.
- No staff-facing orders API exists. Only guest endpoints: `src/pages/api/guest/orders/index.ts` and `src/pages/api/guest/orders/[id].ts`.
- `orders` table: `id, guest_token_id (→ guest_tokens), service_id (→ services), status ('pending'/'fulfilled'/'cancelled'), created_at, updated_at`. Indexes on `guest_token_id` and `status`.
- RLS already grants authenticated staff `FOR SELECT` and `FOR UPDATE` on `orders` (`supabase/migrations/20260528000002_rls.sql:24-31`).
- `AddonList.tsx` — guest-side pattern to follow: optimistic state updates, simple fetch calls, no polling.
- shadcn/ui: only `button.tsx` installed; `AlertDialog` must be added.

## Desired End State

Staff opens `/dashboard`, sees a live list of pending orders (guest name, room, service, elapsed time) sorted oldest-first, auto-refreshing every 10 s. Clicking **Fulfill** or **Cancel** opens a confirmation dialog; confirming sends a PATCH and removes the row from the list. The nav badge updates in sync with the list count. When all orders are closed the list shows "All clear. All guests are happy!" Status changes are immediately visible to the guest panel via its existing 20 s polling (no extra work needed on the guest side).

### Key Discoveries

- Staff API must use `createClient(context.request.headers, context.cookies)` (not service role) so Supabase Auth JWT enforces RLS — `context.locals.user` is the auth guard at application level.
- Supabase PostgREST join syntax: `.select("id, created_at, guest_tokens!inner(guest_name, room_number), services!inner(name)")` — `!inner` ensures only orders with valid FK relations are returned.
- PATCH guard: `.update({ status }).eq("id", id).eq("status", "pending")` — 0 rows updated means the order is already closed; return 409 to prevent double-processing.
- Badge live update: the badge span in `StaffLayout.astro` is conditionally rendered — it may not exist in the DOM when count is 0 at page load. Must always render the span (with `hidden` class when count=0) and add `id="pending-badge"` before the CustomEvent listener can reliably find it.
- Lesson applied (`supabase_rls_insert_select`): this plan has no `INSERT … RETURNING` calls, so no dual-policy risk.

## What We're NOT Doing

- No fulfilled/history view — pending orders only (PRD FR-012 scope).
- No undo / reopen of fulfilled or cancelled orders.
- No price display on order cards — not mentioned in PRD US-03.
- No pagination — MVP single-hotel scale; pending list stays small.
- No separate `/dashboard/orders` route — the "Orders" nav link already targets `/dashboard`.
- No WebSocket / SSE — polling at ≤10 s is the PRD-accepted approach for MVP.

## Implementation Approach

Three sequential phases ordered by dependency: API first (provides the endpoints the component calls), then the React island (needs the API + `AlertDialog` component), then page + layout wiring (needs the island). Each phase is independently verifiable before proceeding.

## Critical Implementation Details

**Badge always-render requirement**: The `StaffLayout.astro` badge is currently inside a conditional `{pendingCount > 0 && (...)}`. If 0 orders exist at page load, the span is absent from the DOM and the CustomEvent listener has nothing to update. Change to always render the span, using `class:list` to toggle a `hidden` class. The `id="pending-badge"` attribute lets the script find it without a selector sweep.

**Supabase join result flattening**: The Supabase client returns nested objects for joined tables (`{ guest_tokens: { guest_name, room_number }, services: { name } }`). The GET endpoint must flatten these into a plain DTO before returning JSON — the React component should not handle nested shapes.

---

## Phase 1: Staff Orders API

### Overview

Create two new API route files under `src/pages/api/staff/orders/`. These are the only server-side changes in this plan — no migrations, no schema changes.

### Changes Required

#### 1. GET /api/staff/orders

**File**: `src/pages/api/staff/orders/index.ts`

**Intent**: Return all pending orders enriched with guest name, room number, and service name, sorted oldest-first. Staff auth guard prevents unauthenticated access.

**Contract**:
- Export `const prerender = false` and `export const GET: APIRoute`.
- Auth: `context.locals.user` — return 401 if absent.
- Client: `createClient(context.request.headers, context.cookies)`.
- Query: `.from("orders").select("id, created_at, guest_tokens!inner(guest_name, room_number), services!inner(name)").eq("status", "pending").order("created_at", { ascending: true })`.
- Flatten each row into `{ id, created_at, guest_name, room_number, service_name }`.
- Response: `200 application/json` — array of flattened DTOs (empty array when no pending orders).

---

#### 2. PATCH /api/staff/orders/[id]

**File**: `src/pages/api/staff/orders/[id].ts`

**Intent**: Update a single order's status to `'fulfilled'` or `'cancelled'`. Guards against acting on already-closed orders.

**Contract**:
- Export `const prerender = false` and `export const PATCH: APIRoute`.
- Auth: `context.locals.user` — return 401 if absent.
- Route param: `context.params.id` — validate UUID format with the same regex used in the guest API.
- Body schema (zod): `{ status: z.enum(["fulfilled", "cancelled"]) }`.
- Client: `createClient(context.request.headers, context.cookies)`.
- Update query: `.update({ status }).eq("id", id).eq("status", "pending").select("id, status").single()`.
- If `error.code === "PGRST116"` (no rows matched) or data is null → return 409 `{ error: "Order is not pending" }`.
- Response: `200 application/json` — `{ id, status }`.

### Success Criteria

#### Automated Verification

- TypeScript type-check passes: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- `GET /api/staff/orders` with staff session returns pending orders array (test via browser devtools network tab or a REST client).
- `PATCH /api/staff/orders/:id` with `{ "status": "fulfilled" }` returns 200 and updated status.
- `PATCH /api/staff/orders/:id` on an already-fulfilled order returns 409.
- Both endpoints return 401 without a staff session.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: AlertDialog + OrderList React Island

### Overview

Install the shadcn `alert-dialog` component, then build `OrderList.tsx` — the React island that drives the entire reception panel: 10 s polling, confirmation dialogs, and CustomEvent badge sync.

### Changes Required

#### 1. Install AlertDialog

**File**: `src/components/ui/alert-dialog.tsx` (generated)

**Intent**: Add the shadcn AlertDialog component so `OrderList` can render native confirmation dialogs without building a modal from scratch.

**Contract**: Run `npx shadcn@latest add alert-dialog`. This adds `src/components/ui/alert-dialog.tsx` and may update `package.json` with `@radix-ui/react-alert-dialog`.

---

#### 2. OrderList React Component

**File**: `src/components/staff/OrderList.tsx`

**Intent**: Render the live order list with 10 s polling, per-action confirmation dialogs, and badge sync via CustomEvent. This is the primary interactive surface for reception staff.

**Contract**:

Exported interface (for `dashboard.astro` to type the `initialOrders` prop):
```typescript
export interface StaffOrder {
  id: string;
  guest_name: string;
  room_number: string;
  service_name: string;
  created_at: string;
}
```

Props: `{ initialOrders: StaffOrder[] }`.

State:
- `orders: StaffOrder[]` — initialised from prop.
- `loading: Set<string>` — order IDs currently being processed.
- `confirmTarget: { orderId: string; action: "fulfilled" | "cancelled" } | null`.

Polling lifecycle:
- `useEffect` sets up `setInterval(() => fetchOrders(), 10_000)` on mount; clears on unmount.
- `fetchOrders` calls `GET /api/staff/orders` and replaces `orders` state on success.
- After every `orders` state update (via a separate `useEffect` watching `orders`), fire:
  `window.dispatchEvent(new CustomEvent("pending-count-update", { detail: orders.length }))`.

Action flow:
- Fulfill/Cancel button click → set `confirmTarget`; `AlertDialog` opens automatically (`open={!!confirmTarget && confirmTarget.orderId === order.id && confirmTarget.action === action}`).
- Dialog confirm → PATCH `/api/staff/orders/${confirmTarget.orderId}` with `{ status: confirmTarget.action }`.
- On success → remove the order from `orders` state; reset `confirmTarget`.
- Dialog cancel → reset `confirmTarget`.
- In-flight guard: disable both action buttons for the order whose `id` is in `loading`.

Elapsed time display: a simple helper `elapsedLabel(created_at: string): string` that returns `"X min ago"` for <60 min, `"X h ago"` for longer.

Empty state (when `orders.length === 0`): centred `<p>` reading `"All clear. All guests are happy!"` with a `✓` icon.

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` passes (no type errors in the new component).
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification

- AlertDialog component file exists at `src/components/ui/alert-dialog.tsx`.
- On a test page the OrderList renders the initial orders passed as prop.
- After 10 s, the component re-fetches (visible in network tab).
- Clicking Fulfill on an order opens the confirmation dialog.
- Confirming removes the order from the UI; a `pending-count-update` CustomEvent fires (verify in browser console: `window.addEventListener('pending-count-update', console.log)`).

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Dashboard Page + Nav Badge Integration

### Overview

Replace the `dashboard.astro` placeholder content with the `OrderList` island and wire up the nav badge so it responds to `pending-count-update` events.

### Changes Required

#### 1. Replace Dashboard Page Content

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the welcome card and pending-count card with an `OrderList` island that receives the server-fetched pending orders as `initialOrders`. The server-side fetch eliminates a loading flash on first render.

**Contract**:
- Remove the local `pendingCount` query (StaffLayout already fetches it for the badge).
- Add a server-side query using `createClient` that mirrors the GET endpoint: join orders with guest_tokens and services, filter `status = 'pending'`, order `created_at ASC`.
- Flatten results into `StaffOrder[]` (same shape as the API DTO).
- Mount `<OrderList client:load initialOrders={orders} />`.
- Wrap in `StaffLayout` with `title="Orders"`.

---

#### 2. Nav Badge — Always-Render + CustomEvent Listener

**File**: `src/layouts/StaffLayout.astro`

**Intent**: Make the pending-count badge always present in the DOM (so the CustomEvent listener can find it by `id`) and add a `<script>` that updates it from `OrderList` polling events.

**Contract**:

Badge span changes:
- Add `id="pending-badge"` to the span.
- Change the conditional render to always render the span; use `class:list` to add `hidden` when `pendingCount === 0`.

Script addition (inline `<script>` tag at the bottom of the component, before `</Layout>`):
```javascript
window.addEventListener("pending-count-update", (e) => {
  const badge = document.getElementById("pending-badge");
  if (!badge) return;
  const count = e.detail;
  badge.textContent = String(count);
  badge.classList.toggle("hidden", count === 0);
});
```

### Success Criteria

#### Automated Verification

- `npm run build` passes with no errors.
- `npm run lint` passes.
- `npx tsc --noEmit` passes.

#### Manual Verification

- `/dashboard` shows the live order list (not the old welcome + count cards).
- With pending orders present: each card shows guest name, room number, service name, elapsed time, and Fulfill / Cancel buttons.
- Clicking Fulfill → confirmation dialog → Confirm → row disappears; nav badge decrements.
- Clicking Cancel → confirmation dialog → Confirm → row disappears; nav badge decrements.
- When all orders fulfilled: "All clear. All guests are happy!" is displayed.
- After 10 s: new orders placed by a guest appear automatically (test by placing an order from the guest panel in another browser tab).
- On `/dashboard/generate-token` page: badge shows correct count at page load (server-rendered); badge does not update live on this page — acceptable per MVP scope.
- No console errors; no 401s in network tab.

**Implementation Note**: Pause here for manual confirmation from the human that the full end-to-end flow works before considering S-04 complete.

---

## Testing Strategy

### Unit Tests

- None required — no isolated business logic beyond what the API guards express.

### Integration Tests

- None additional — existing CI runs `npm run build` + `npm run lint`.

### Manual Testing Steps

1. Start dev server (`npm run dev`).
2. Log in as staff; confirm `/dashboard` shows the live order list.
3. In a second browser (or incognito), use the guest panel to place an add-on order.
4. Within 10 s the order appears in the reception panel without a page refresh.
5. Click **Fulfill** → confirm dialog appears → confirm → row disappears from list; nav badge decrements.
6. Return to guest panel: within 20 s the guest sees the order status change to "✓ Fulfilled" (existing polling).
7. Repeat with **Cancel** action.
8. Fulfill all orders; confirm "All clear. All guests are happy!" empty state.
9. Check network tab: polling requests fire every ~10 s; no 401 or 5xx errors.

## Performance Considerations

The GET `/api/staff/orders` query filters by `status = 'pending'` and joins two tables. The `orders(status)` index is already in place (`supabase/migrations/20260528000001_schema.sql`). At pilot-hotel scale (tens of orders) there is no performance concern.

## Migration Notes

No new migrations. All required schema changes (orders table, RLS policies, indexes) were delivered in F-01.

## References

- Roadmap: `context/foundation/roadmap.md` — S-04 section
- PRD: `context/foundation/prd.md` — FR-012, FR-013, FR-015, US-03
- DB schema: `context/archive/2026-05-28-db-schema-supabase/plan.md`
- Related guest-side implementation: `src/components/guest/AddonList.tsx`, `src/pages/api/guest/orders/index.ts`
- Staff layout: `src/layouts/StaffLayout.astro`
- Current dashboard: `src/pages/dashboard.astro`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Staff Orders API

#### Automated

- [x] 1.1 TypeScript type-check passes: `npx tsc --noEmit` — 1627f7f
- [x] 1.2 Lint passes: `npm run lint` — 1627f7f
- [x] 1.3 Build passes: `npm run build` — 1627f7f

#### Manual

- [ ] 1.4 GET /api/staff/orders returns pending orders array with a staff session
- [ ] 1.5 PATCH /api/staff/orders/:id with `{ "status": "fulfilled" }` returns 200
- [ ] 1.6 PATCH on already-fulfilled order returns 409
- [ ] 1.7 Both endpoints return 401 without a staff session

### Phase 2: AlertDialog + OrderList React Island

#### Automated

- [x] 2.1 `npx tsc --noEmit` passes — ab6de28
- [x] 2.2 `npm run lint` passes — ab6de28
- [x] 2.3 `npm run build` passes — ab6de28

#### Manual

- [ ] 2.4 `src/components/ui/alert-dialog.tsx` exists
- [ ] 2.5 OrderList renders initial orders passed as prop
- [ ] 2.6 After 10 s OrderList re-fetches (visible in network tab)
- [ ] 2.7 Clicking Fulfill opens confirmation dialog
- [ ] 2.8 Confirming fires `pending-count-update` CustomEvent with decremented count

### Phase 3: Dashboard Page + Nav Badge

#### Automated

- [x] 3.1 `npm run build` passes — 24da47f
- [x] 3.2 `npm run lint` passes — 24da47f
- [x] 3.3 `npx tsc --noEmit` passes — 24da47f

#### Manual

- [ ] 3.4 /dashboard shows live order list (not old placeholder cards)
- [ ] 3.5 Each card shows guest name, room number, service name, elapsed time, Fulfill/Cancel buttons
- [ ] 3.6 Fulfill flow: dialog → confirm → row removed; badge decrements
- [ ] 3.7 Cancel flow: dialog → confirm → row removed; badge decrements
- [ ] 3.8 Empty state "All clear. All guests are happy!" shown when no pending orders
- [ ] 3.9 New guest order appears in panel within 10 s without page refresh
- [ ] 3.10 No console errors; no 401/5xx in network tab

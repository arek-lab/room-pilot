# Staff Login and Guest QR Token Generation — Implementation Plan

## Overview

Build the staff token-generation flow (S-01): a shared staff layout component, a dedicated `/dashboard/generate-token` page with a React form, a `POST /api/staff/generate-token` endpoint, and a client-side QR display with browser print. Staff login is already functional; this slice layers the guest-token creation UI and API on top of the existing auth foundation.

## Current State Analysis

- Staff login (email+password via Supabase Auth) works end-to-end: `/auth/signin` → Supabase Auth → `/dashboard` (protected by `PROTECTED_ROUTES = ["/dashboard"]` in `src/middleware.ts:6`)
- `guest_tokens` table, RLS policies, and seed data are in place (F-01 done — `supabase/migrations/20260528000001_schema.sql`, `20260528000002_rls.sql`, `20260528000003_seed.sql`)
- Active packages (3) and rooms (10: 101–110) are seeded and selectable
- `context.locals.user` is set on every request by middleware; no additional auth middleware needed
- `/dashboard` is a bare-bones placeholder — no staff navigation, no form
- No QR generation library or Zod validation library is installed yet

### Key Discoveries

- `src/middleware.ts:20` — `PROTECTED_ROUTES.some((route) => pathname.startsWith(route))` already covers all `/dashboard/*` sub-routes, so no middleware change is needed for the new page
- `src/lib/supabase.ts` — `createClient(requestHeaders, cookies)` returns the SSR client authenticated under the staff's Supabase session; when staff is logged in, queries run under the `authenticated` RLS role, which has full access to `guest_tokens` (F-01 RLS: "Staff full access — authenticated, all ops")
- `src/types.ts` — `Tables<'guest_tokens'>` and `Tables<'packages'>` and `Tables<'room_qr_codes'>` are auto-generated and ready to use
- `jose` (v6.2.2) is already installed — no additional JWT library needed
- `crypto.randomUUID()` is a Web Standard API available natively on Cloudflare Workers — no polyfill needed
- `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `ServerError.tsx` — reusable form primitives for the new staff form

## Desired End State

A logged-in staff member navigates to `/dashboard/generate-token`, fills in guest name, room (dropdown from DB), package (dropdown from DB), check-in and check-out dates, submits the form, and sees a QR code rendered inline. The QR encodes `<origin>/guest/verify?token=<uuid>` — the URL that S-02 will implement as the guest verification endpoint. Staff clicks Print and the browser print dialog shows the QR + guest name + room + dates; the nav header is hidden on print. Clicking "Generate Another" resets to the blank form.

Verifiable end state:
- Scanning the generated QR with a phone opens `<origin>/guest/verify?token=<uuid>` (a 404 until S-02 is built — expected)
- The `guest_tokens` table gains a new row after each successful submission with `created_by = user.id`
- Navigating to `/dashboard/generate-token` without a staff session redirects to `/auth/signin`

### Key Discoveries

- `src/pages/dashboard.astro` — uses `Layout.astro` directly; will be updated to use the new `StaffLayout.astro`
- `src/layouts/Layout.astro` — base layout wrapping `<slot/>`; `StaffLayout` will wrap it or compose alongside it

## What We're NOT Doing

- Guest session cookie issuance — that's `/guest/verify` in S-02
- Staff account creation — handled out-of-band by administrator (PRD §Access Control)
- Token listing / history view — out of scope for S-01; belongs to S-04 or post-MVP
- Package/service CRUD — parked in roadmap (PRD §Non-Goals)
- Download as PNG/SVG file — browser print dialog covers the requirement; file download is post-MVP
- Email delivery of QR tokens — no PMS integration in MVP scope

## Implementation Approach

Three sequential phases mirror three concern areas: (1) shared layout with nav, (2) backend endpoint with validation, (3) frontend page and interactive QR component. Each phase is independently verifiable before the next begins.

Staff DB access uses the existing SSR Supabase client (anon key + Supabase Auth session cookie) — no `SUPABASE_SERVICE_ROLE_KEY` needed here. That key is deferred to S-02 which serves guest requests that must bypass RLS.

## Critical Implementation Details

**QR URL contract for S-02**: The QR must encode exactly `${window.location.origin}/guest/verify?token=${tokenValue}` (assembled client-side in the React component using `window.location.origin`). The path `/guest/verify` and query param name `token` are the interface S-02 depends on — do not change them during implementation.

**Zod cross-field date validation**: The endpoint's Zod schema must include a `.refine()` that checks `checkOutDate > checkInDate` (string comparison works for ISO 8601 `YYYY-MM-DD` format). This is the only cross-field rule; all other field validations are independent.

---

## Phase 1: Staff Layout

### Overview

Create `StaffLayout.astro` — a persistent top nav (logo placeholder, "Generate Token" link, Sign out button) that wraps all staff pages. Apply it to the existing `/dashboard`. The nav must carry `print:hidden` so QR print layouts are clean.

### Changes Required

#### 1. New staff layout component

**File**: `src/layouts/StaffLayout.astro`

**Intent**: Shared layout for all staff pages. Renders a top nav bar with navigation links and a Sign Out form button, then yields `<slot/>` for page content.

**Contract**: Props: `{ title: string }`. Nav contains: a logo/name placeholder (`RoomPilot`), an `<a href="/dashboard/generate-token">` link labelled "Generate Token", and a `<form method="POST" action="/api/auth/signout">` Sign Out button. The `<nav>` element carries a `print:hidden` Tailwind class. The layout wraps an existing or inline `<head>` with the title; mirrors the structural pattern of `src/layouts/Layout.astro`.

#### 2. Update existing dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the generic `Layout` import with `StaffLayout` so the dashboard gains consistent staff navigation.

**Contract**: Swap `import Layout from "@/layouts/Layout.astro"` → `import StaffLayout from "@/layouts/StaffLayout.astro"`, rename tag usage accordingly. No other changes to the file.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run build` (Astro type-checks all `.astro` files)
- Linting passes: `npm run lint`

#### Manual Verification

- `/dashboard` shows the staff nav header with "Generate Token" link and Sign Out button
- Clicking Sign Out still works (form POST to `/api/auth/signout`)
- Using browser Print Preview on `/dashboard` shows the nav hidden

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Token Generation API Endpoint

### Overview

Add Zod as a dependency, then create `POST /api/staff/generate-token` — the endpoint that validates the request, generates a UUID token, inserts a `guest_tokens` row, and returns the token data as JSON.

### Changes Required

#### 1. Install Zod

**File**: `package.json` (via `npm install zod`)

**Intent**: Add Zod for request body validation in the new API route, following the convention stated in CLAUDE.md ("validate with zod").

**Contract**: Adds `"zod": "^3.x.x"` to `dependencies`. Run: `npm install zod`.

#### 2. Token generation endpoint

**File**: `src/pages/api/staff/generate-token.ts`

**Intent**: Staff-only POST endpoint that creates a guest token in the DB and returns the token value needed for QR rendering. Enforces auth, validates all fields, and uses `crypto.randomUUID()` for the opaque token value.

**Contract**:
- Exports `export const prerender = false` and `export async function POST(context: APIContext)`
- Auth guard: if `context.locals.user` is null, return `Response` with status 401 and JSON `{ error: "Unauthorized" }`
- Parses JSON body; validates with a Zod schema covering: `guestName` (string, min 1), `roomNumber` (string, min 1), `packageId` (string UUID), `checkInDate` (string matching `YYYY-MM-DD`), `checkOutDate` (string matching `YYYY-MM-DD`); cross-field `.refine()` that `checkOutDate > checkInDate`
- On validation failure: return status 400 JSON `{ error: string }`
- On success: generate `tokenValue = crypto.randomUUID()`, call `createClient(context.request.headers, context.cookies)` to get the SSR Supabase client, insert into `guest_tokens` with columns `{ token_value: tokenValue, guest_name, room_number, package_id, check_in_date, check_out_date, created_by: context.locals.user.id }`
- On DB error: return status 500 JSON `{ error: "Failed to create token" }`
- On DB success: return status 200 JSON `{ tokenValue, tokenId: insertedRow.id, guestName, roomNumber, checkInDate, checkOutDate }`

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- `POST /api/staff/generate-token` with a valid staff auth cookie and valid JSON body returns 200 with `tokenValue` UUID
- A new row appears in the `guest_tokens` table with `created_by` matching the staff user's ID
- Same request without a session cookie returns 401
- Request with `checkOutDate` equal to or before `checkInDate` returns 400

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Generate Token Page and QR Display

### Overview

Add `react-qr-code`, create the Astro SSR page that fetches packages and rooms server-side, and build the `TokenGeneratorForm` React component with two states: form input and QR display.

### Changes Required

#### 1. Install react-qr-code

**File**: `package.json` (via `npm install react-qr-code`)

**Intent**: Add the browser/React-native QR code library. Pure SVG output, no Node.js or canvas dependencies — compatible with Cloudflare Workers V8 isolate.

**Contract**: Adds `"react-qr-code": "^2.x.x"` to `dependencies`.

#### 2. Generate Token Astro page

**File**: `src/pages/dashboard/generate-token.astro`

**Intent**: Staff-only SSR page that fetches active packages and rooms from Supabase in the server frontmatter and mounts the interactive React form.

**Contract**:
- `export const prerender = false`
- Frontmatter: check `Astro.locals.user`; if null, `return Astro.redirect("/auth/signin")`
- Fetch active packages: `SELECT id, name FROM packages WHERE active = true ORDER BY name` using the SSR Supabase client
- Fetch active rooms: `SELECT id, room_number FROM room_qr_codes WHERE active = true ORDER BY room_number`
- Uses `StaffLayout` with `title="Generate Guest Token"`
- Mounts `<TokenGeneratorForm packages={packages} rooms={rooms} client:load />` — passes typed arrays derived from the DB results

#### 3. Token generator form component

**File**: `src/components/staff/TokenGeneratorForm.tsx`

**Intent**: Two-state React component. In `form` state: collects guest data and submits to the API. In `generated` state: renders the QR code SVG, guest summary, Print button, and "Generate Another" reset button.

**Contract**:
- Props: `{ packages: Array<{ id: string; name: string }>; rooms: Array<{ id: string; room_number: string }> }`
- Internal state: `view: "form" | "generated"`, field values, loading flag, error string, and a `generated` object `{ tokenValue, guestName, roomNumber, checkInDate, checkOutDate }` for the second state
- Client validation before submit: all fields required; `checkOutDate > checkInDate` (if not, set error without hitting the API)
- Submit: `fetch("/api/staff/generate-token", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(fields) })`; on non-OK response parse error JSON and display; on success switch to `generated` view
- `generated` view renders: `<QRCode value={`${window.location.origin}/guest/verify?token=${tokenValue}`} size={200} />` (from `react-qr-code`), guest name, room number, check-in → check-out dates, a Print button (`window.print()`), and a "Generate Another" button that resets state to `form` with empty fields
- Follows `FormField` / `SubmitButton` / `ServerError` component patterns from `src/components/auth/`
- The `generated` view container carries a `print:block` class (or is always rendered but toggled with conditional logic); non-QR UI elements should not appear in print — relies on the `print:hidden` in `StaffLayout`

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- Navigating to `/dashboard/generate-token` without auth redirects to `/auth/signin`
- As authenticated staff: form shows room dropdown (10 rooms from DB) and package dropdown (3 packages from DB)
- Submitting valid guest data switches to the QR view; guest summary matches entered data
- QR code encodes `<origin>/guest/verify?token=<uuid>` — verify by inspecting the SVG `value` prop or scanning with a QR reader
- "Generate Another" button resets the form to blank state
- Browser Print Preview shows: QR code + guest name + room + dates visible; staff nav header is hidden
- Submitting with `checkOutDate ≤ checkInDate` shows a client-side validation error without hitting the network

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

No unit tests required for this slice — the logic is thin (UUID generation, date comparison) and covered by manual verification of the API contract.

### Integration Tests

- POST to `/api/staff/generate-token` with valid payload and valid session cookie → 200 + row in DB
- POST without session → 401
- POST with invalid dates → 400

### Manual Testing Steps

1. Sign in as staff at `/auth/signin`
2. Navigate to `/dashboard` → verify nav header visible with "Generate Token" link
3. Navigate to `/dashboard/generate-token` → verify form loads with room and package dropdowns populated
4. Fill in: guest name = "Jan Kowalski", room = "101", package = "Standard", check-in = today, check-out = tomorrow
5. Submit → QR view appears; confirm guest summary matches input
6. Open Supabase dashboard → `guest_tokens` table → confirm new row with correct data and `created_by` field
7. Scan the QR code → browser opens `<origin>/guest/verify?token=<uuid>` (404 expected — S-02 not built yet)
8. Click Print → browser print dialog; verify nav is hidden and QR + summary is visible
9. Click "Generate Another" → form resets to blank
10. Open incognito window → navigate to `/dashboard/generate-token` → confirm redirect to `/auth/signin`

## Addendum: Undocumented Changes (discovered during impl-review)

The following files were modified during implementation but not listed in the original plan. Both changes are benign and backwards-compatible.

**`src/lib/supabase.ts`** — Added `Database` type parameter to `createServerClient<Database>(...)`. Required to enable typed Supabase query results in the new API endpoint and page.

**`src/components/auth/FormField.tsx`** — Added optional `min?: string` and `max?: string` props wired to the underlying `<input>`. Required for date-field constraints (`min={today}`) in `TokenGeneratorForm`.

---

## Migration Notes

No schema changes in this slice. All DB tables used here were created in F-01.

## References

- Related DB schema: `supabase/migrations/20260528000001_schema.sql`
- RLS policies: `supabase/migrations/20260528000002_rls.sql`
- Auth form pattern: `src/components/auth/SignInForm.tsx`
- Auth API pattern: `src/pages/api/auth/signin.ts`
- Existing middleware: `src/middleware.ts`
- Roadmap S-01: `context/foundation/roadmap.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Staff Layout

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — 491e3b4
- [x] 1.2 Linting passes: `npm run lint` — 491e3b4

#### Manual

- [x] 1.3 `/dashboard` shows staff nav header with "Generate Token" link and Sign Out button — 491e3b4
- [x] 1.4 Clicking Sign Out still works — 491e3b4
- [x] 1.5 Browser Print Preview on `/dashboard` shows nav hidden — 491e3b4

### Phase 2: Token Generation API Endpoint

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — 72b7e97
- [x] 2.2 Linting passes: `npm run lint` — 72b7e97

#### Manual

- [x] 2.3 POST with valid auth + valid body returns 200 with tokenValue UUID — 72b7e97
- [x] 2.4 New row appears in `guest_tokens` with correct `created_by` — 72b7e97
- [x] 2.5 POST without session cookie returns 401 — 72b7e97
- [x] 2.6 POST with checkOutDate ≤ checkInDate returns 400 — 72b7e97

### Phase 3: Generate Token Page and QR Display

#### Automated

- [x] 3.1 Type checking passes: `npm run build` — 8548447
- [x] 3.2 Linting passes: `npm run lint` — 8548447

#### Manual

- [x] 3.3 Unauthenticated access to `/dashboard/generate-token` redirects to `/auth/signin` — 8548447
- [x] 3.4 Form shows room dropdown (10 rooms) and package dropdown (3 packages) — 8548447
- [x] 3.5 Valid submission switches to QR view with correct guest summary — 8548447
- [x] 3.6 QR encodes `<origin>/guest/verify?token=<uuid>` — 8548447
- [x] 3.7 "Generate Another" resets form to blank — 8548447
- [x] 3.8 Print Preview shows QR + summary; nav is hidden — 8548447
- [x] 3.9 Invalid date range shows client-side error without network request — 8548447

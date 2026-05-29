# Guest QR Auth and Service Panel — Plan Brief

> Full plan: `context/changes/guest-qr-auth-panel/plan.md`

## What & Why

Build S-02: give guests frictionless, self-service access to their hotel panel through a two-step QR flow (token QR from reception → room QR on the wall), and show them their package (included services, available add-ons, order statuses). This is the prerequisite for every guest-facing slice (S-03 ordering, S-05 concierge) and is on the direct path to the north star (S-04).

## Starting Point

S-01 is complete: staff can generate guest tokens and download a printable QR that encodes `/guest/verify?token=<uuid>`. That URL currently returns a 404. The DB schema, seed data (3 packages, 10 rooms, 8 services), and room QR codes are live. The middleware already extracts a `guest_session` JWT cookie into `context.locals.guestToken` — partial S-02 scaffolding is in place. `GUEST_SESSION_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are both declared in the env schema.

## Desired End State

A guest scans the reception QR, sees a "now scan room QR" instruction screen, scans the room wall QR, and lands on their service panel — no staff interaction. The panel shows included services (read-only ✓ badges) and available add-ons (status badges if ordered, plain list if not). Expired token shows a readable message; invalid token shows a generic one. The two-step cookie state machine (pending_guest → guest_session) is clean and stateless.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Room QR URL format | `/qr/room/<qr_token>` (UUID) | Matches `room_qr_codes.qr_token` column; room UUIDs can't be guessed, unlike room numbers. |
| Guest DB access | Service role key + app-level WHERE guards | No new migrations needed; pragmatic for one-hotel MVP with explicit query guards. |
| Two-step state | Short-lived `pending_guest` JWT cookie (10 min) | Stateless server; survives brief navigation; consistent with the existing `guest_session` cookie pattern. |
| Panel layout | Two vertical sections (Included / Add-ons) | All services visible on scroll — best for mobile, matches PRD FR-010 "dashboard" framing. |
| Token expiry check | DB check on every panel load | DB (`check_out_date`) is authoritative; staff could extend a stay by updating the DB row. |
| Error UX | Expired vs generic invalid (two messages) | Expired is actionable; all other failures map to generic to avoid UUID enumeration. |
| Guest layout | `GuestLayout.astro` with slim header | Mirrors `StaffLayout.astro` pattern; S-05 can extend it with minimal changes. |
| Re-auth on re-scan | Redirect to panel silently | Zero friction for guests who re-scan; consistent with how staff auth handles repeat sign-in. |

## Scope

**In scope:**
- `createServiceRoleClient()` helper in `src/lib/supabase.ts`
- `/guest/verify` SSR page — token validation, `pending_guest` cookie, instruction screen
- `/guest/error` SSR page — shared expired/invalid error states
- `/qr/room/[qr_token]` SSR page — room validation, full `guest_session` cookie issuance
- `GuestLayout.astro` with slim header (room, name, check-out date)
- `/guest/panel` SSR page — reads package_services + orders, renders two-section layout

**Out of scope:**
- Add-on order placement (S-03)
- AI concierge (S-05)
- Guest-specific Supabase RLS policies
- Token revocation / early logout
- Multiple device support per stay

## Architecture / Approach

Three sequential SSR Astro pages — no React islands (S-02 is read-only). JWT signing uses `jose`'s `SignJWT` builder with `GUEST_SESSION_SECRET`. The `pending_guest` cookie carries only `tokenId`; the full `guest_session` carries `tokenId + roomNumber + packageId`. Middleware already handles `guest_session` extraction; `pending_guest` is read and cleared only in the room QR page. All DB access via service role client with explicit WHERE guards.

```
Guest scans token QR
  → /guest/verify?token=<uuid>
      validates DB → sets pending_guest cookie (10 min)
      → renders "scan room QR" screen
  
Guest scans room QR (new URL, top-level navigation)
  → /qr/room/<qr_token>
      reads pending_guest cookie
      validates room_qr_codes + cross-checks room_number
      → issues guest_session cookie (exp = check_out_date 23:59 UTC)
      → clears pending_guest
      → redirect /guest/panel

/guest/panel
  → reads context.locals.guestToken (set by middleware)
  → DB expiry re-check
  → queries package_services + orders
  → renders Included / Add-ons sections
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Token QR Verification | `/guest/verify` + `/guest/error` + service role helper | `pending_guest` JWT signing — `SignJWT` builder pattern not yet in codebase |
| 2. Room QR Verification | `/qr/room/[qr_token]` + `guest_session` cookie issuance | `sameSite: "lax"` required so camera-opened URL carries the pending cookie |
| 3. Guest Panel | `GuestLayout.astro` + `/guest/panel` with package/order data | Service JOIN query (package_services + services) — verify inclusion_type filter |

**Prerequisites:** S-01 done (confirmed). Supabase running locally or cloud linked. `SUPABASE_SERVICE_ROLE_KEY` and `GUEST_SESSION_SECRET` added to `.env` / `.dev.vars`. A staff user account exists to generate a test token.

**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- `jose` is installed (confirmed in middleware imports), but `SignJWT` has not been used — the builder pattern is easy to misuse; the plan includes the correct snippet.
- Room QR codes are static (seeded). Physical QR codes on hotel room walls encode `/qr/room/<qr_token>` — if the pilot hotel needs regenerable room QRs, the `room_qr_codes` table design supports it (just re-seed `qr_token`), but no UI for this is in scope.
- The panel displays order statuses but has no order-placement button — guests will see the add-on list without a way to order until S-03 ships.

## Success Criteria (Summary)

- A guest can complete the full two-step QR flow and reach their service panel without staff assistance
- Expired token shows a helpful "contact reception" message; scanning the wrong room QR shows a generic error
- Staff login, dashboard, and QR generation are unaffected

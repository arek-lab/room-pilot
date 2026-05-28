# Database Schema and Supabase Configuration Implementation Plan

## Overview

Create the foundational Postgres schema for RoomPilot inside the cloud Supabase project: 6 tables, RLS policies for staff (Supabase Auth JWT), application-level isolation for guests (service role + WHERE clause), seed data for the pilot hotel, and the TypeScript/middleware contract that all downstream slices will depend on.

## Current State Analysis

A cloud Supabase project exists and is reachable — `SUPABASE_URL` and `SUPABASE_KEY` are already in `.env`. `src/lib/supabase.ts` provides an SSR cookie-based client, and `src/middleware.ts` resolves staff users via `supabase.auth.getUser()`. No migrations directory, no `src/types.ts`. Only Supabase Auth's built-in `auth.users` table is in use; no custom tables yet.

The unique constraint this schema must satisfy: guests have **no Supabase Auth account**. Their DB access goes through server-side API routes that use the Supabase service role key — RLS is bypassed intentionally, and isolation is enforced at application level (`WHERE guest_token_id = $1`). Staff access uses Supabase Auth JWT with standard RLS. Guest session cookies are signed with a separate `GUEST_SESSION_SECRET` that has no dependency on Supabase's JWT infrastructure.

## Desired End State

After this plan completes:
- `npx supabase db push` applies three migrations cleanly to the cloud project and seeds the pilot hotel catalog
- All 6 tables visible in the Supabase dashboard with RLS enabled and policies per table
- `src/types.ts` contains generated Supabase TypeScript types
- `context.locals.guestToken` is populated in middleware when a valid `guest_session` cookie is present
- S-01 (staff token generation) and S-02 (guest QR auth) can begin implementing their API routes without schema changes

### Key Discoveries

- `SUPABASE_URL` and `SUPABASE_KEY` (anon) are already in `.env` — no connection setup needed
- `SUPABASE_SERVICE_ROLE_KEY` is in Supabase dashboard → Settings → API → Project API keys → `service_role`; add it to `.env` and `.dev.vars` — never expose to client
- `GUEST_SESSION_SECRET` is a self-generated random string (32+ bytes); no relation to Supabase; generated once with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `astro.config.mjs` uses `envField` schema — both new secrets follow the same pattern as existing ones
- `jose` is not yet installed; `jsonwebtoken` is Node.js-only and won't run on Cloudflare Workers
- `@astrojs/cloudflare` adapter is already set to `imageService: "compile"` (no Cloudflare Images binding required)
- Seed data goes into a third migration file (`20260528000003_seed.sql`) — `supabase db push` only runs migration files, not `seed.sql`

## What We're NOT Doing

- No staff user accounts (created out-of-band; not seeded here)
- No guest-specific RLS policies — guest isolation is enforced by application code (service role + WHERE clause), not DB policies
- No QR code image generation — that's S-01 scope
- No API routes for reading/writing these tables — those are S-01 through S-04
- No `room_qr_codes` write policies via the app — rooms are managed through migrations/seed only
- No CRUD panel for services or packages (parked in roadmap)
- No `fulfilled_at` / `cancelled_at` columns — `updated_at` + `status` provides sufficient audit trail for MVP

## Implementation Approach

Three sequential phases: (1) schema + RLS as two Supabase migration files, (2) seed data as a third migration file (so `db push` applies everything in one command), (3) TypeScript contract — generated types, env schema extension, App.Locals + middleware update. Phases are ordered by dependency: types can only be generated after migrations are applied to the cloud project; middleware can only be typed after `src/env.d.ts` is updated.

## Critical Implementation Details

**Guest access model — service role, not JWT**: All guest-facing API routes create a Supabase client with the service role key (`SUPABASE_SERVICE_ROLE_KEY`). This bypasses RLS. Isolation is enforced in application code: every query filters `WHERE guest_token_id = $1` where `$1` comes from the verified `guest_session` cookie. The service role key must never leave the server (never passed to client, never in a public env var).

**`GUEST_SESSION_SECRET` is independent of Supabase**: The `guest_session` HttpOnly cookie is a JWT signed with `GUEST_SESSION_SECRET` using HS256 via `jose`. This secret has zero dependency on Supabase's JWT infrastructure — algorithm changes on the Supabase side don't affect it. Cookie claims: `tokenId`, `roomNumber`, `packageId`, `exp`.

**`jose` for Workers-compatible cookie verification**: The middleware uses `jose` (ESM, no Node.js crypto) to verify the `guest_session` cookie with `GUEST_SESSION_SECRET`. No Supabase calls in middleware — pure local signature check.

---

## Phase 1: Schema & RLS Migrations

### Overview

Create the `supabase/migrations/` directory and two SQL migration files: one for the table definitions and one for RLS policies. Running `npx supabase db push` at the end of this phase applies both migrations to the cloud project.

### Changes Required:

#### 1. Create migrations directory

**File**: `supabase/migrations/` (new directory)

**Intent**: Supabase CLI looks for migration files here by convention. The directory doesn't exist yet and must be created before adding migration files.

---

#### 2. Schema migration

**File**: `supabase/migrations/20260528000001_schema.sql`

**Intent**: Define all six tables with their columns, constraints, foreign keys, and indexes. Also create the `update_updated_at()` trigger function and attach it to `orders`.

**Contract**:

Tables and their columns (all in `public` schema):

| Table | Key columns | Constraints |
|---|---|---|
| `services` | `id uuid PK`, `name text NOT NULL`, `description text`, `category text NOT NULL`, `price_pln numeric(10,2)`, `active bool DEFAULT true`, `created_at timestamptz` | — |
| `packages` | `id uuid PK`, `name text NOT NULL`, `description text`, `active bool DEFAULT true`, `created_at timestamptz` | — |
| `package_services` | `id uuid PK`, `package_id → packages`, `service_id → services`, `inclusion_type text` | `CHECK inclusion_type IN ('included','addon')`, `UNIQUE(package_id, service_id)`, both FKs `ON DELETE CASCADE` |
| `room_qr_codes` | `id uuid PK`, `room_number text NOT NULL UNIQUE`, `qr_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text`, `active bool DEFAULT true`, `created_at timestamptz` | — |
| `guest_tokens` | `id uuid PK`, `token_value uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()`, `guest_name text NOT NULL`, `room_number text → room_qr_codes(room_number)`, `package_id → packages`, `check_in_date date NOT NULL`, `check_out_date date NOT NULL`, `created_by → auth.users(id)`, `created_at timestamptz` | `CHECK (check_out_date > check_in_date)` |
| `orders` | `id uuid PK`, `guest_token_id → guest_tokens(id)`, `service_id → services(id)`, `status text DEFAULT 'pending'`, `notes text`, `created_at timestamptz`, `updated_at timestamptz` | `CHECK status IN ('pending','fulfilled','cancelled')` |

Additional:
- Indexes (not auto-created for FKs in Postgres): `CREATE INDEX ON orders(guest_token_id)`, `CREATE INDEX ON orders(status)`, `CREATE INDEX ON guest_tokens(token_value)`, `CREATE INDEX ON room_qr_codes(qr_token)`
- Trigger function `update_updated_at()` (RETURNS TRIGGER, sets `NEW.updated_at = now()`, language plpgsql)
- `BEFORE UPDATE` trigger `orders_updated_at` on `orders` executing `update_updated_at()`

---

#### 3. RLS migration

**File**: `supabase/migrations/20260528000002_rls.sql`

**Intent**: Enable RLS on all six tables and create policies for staff access (via Supabase Auth JWT, `authenticated` role). Guests access all tables via the service role key (bypasses RLS by design) — no guest-specific policies are needed.

**Contract**: Policies per table:

**`services`, `packages`, `package_services`** — read-only catalog for staff; guests read via service role:
```sql
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_services" ON public.services
  FOR SELECT TO authenticated USING (active = true);
-- repeat for packages (active = true) and package_services (USING true)
```

**`room_qr_codes`** — staff read only:
```sql
ALTER TABLE public.room_qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_read_room_qr_codes" ON public.room_qr_codes
  FOR SELECT TO authenticated USING (true);
```

**`guest_tokens`** — staff full access (generate tokens, view guest list):
```sql
ALTER TABLE public.guest_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_guest_tokens" ON public.guest_tokens
  TO authenticated USING (true) WITH CHECK (true);
```

**`orders`** — staff read all + update (fulfill/cancel); guests interact via service role API:
```sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_orders" ON public.orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff_update_orders" ON public.orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
```

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db push` exits 0
- Migration count: `npx supabase migration list` shows exactly 2 applied migrations
- Build still passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- All 6 tables visible in Supabase dashboard → Table Editor
- RLS enabled on all 6 tables (Authentication → Policies shows "RLS enabled" per table)
- `orders` has 2 policies (staff read + staff update), all other tables have 1 policy each
- `package_services` UNIQUE constraint visible in dashboard → Database → Tables → Constraints

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Seed Data

### Overview

Create a third migration file containing the pilot hotel's static catalog: 8 services, 3 packages, 19 package_services junction rows, and 10 room QR codes. Putting seed data in a migration (not `seed.sql`) means `npx supabase db push` applies everything in one command — no separate seeding step.

### Changes Required:

#### 1. Create seed migration

**File**: `supabase/migrations/20260528000003_seed.sql`

**Intent**: Insert the complete pilot hotel catalog and room QR codes with fixed UUIDs so they're tracked as a migration and applied once to the cloud project. Uses `ON CONFLICT DO NOTHING` for safety if the migration is somehow re-run.

**Contract**:

Services (8 rows):

| name | category | price_pln |
|---|---|---|
| WiFi | facilities | null |
| Śniadanie | food | 35.00 |
| Basen | wellness | 40.00 |
| Parking | facilities | 30.00 |
| Masaż / SPA | wellness | 180.00 |
| Późne wymeldowanie | convenience | 60.00 |
| Room service | food | null |
| Dodatkowe ręczniki | convenience | 15.00 |

Packages (3 rows): Basic, Standard, Premium

Package_services (19 rows):

| Package | Service | inclusion_type |
|---|---|---|
| Basic | WiFi | included |
| Basic | Śniadanie | included |
| Basic | Basen | addon |
| Basic | Parking | addon |
| Basic | Masaż / SPA | addon |
| Standard | WiFi | included |
| Standard | Śniadanie | included |
| Standard | Basen | included |
| Standard | Parking | included |
| Standard | Masaż / SPA | addon |
| Standard | Późne wymeldowanie | addon |
| Premium | WiFi | included |
| Premium | Śniadanie | included |
| Premium | Basen | included |
| Premium | Parking | included |
| Premium | Masaż / SPA | included |
| Premium | Późne wymeldowanie | included |
| Premium | Room service | addon |
| Premium | Dodatkowe ręczniki | addon |

Room QR codes (10 rows): room_number '101' through '110', each with a unique `qr_token` UUID (hardcoded in the seed for stability).

Use fixed UUIDs throughout (e.g., `'00000000-0000-0000-0001-000000000001'` style) so IDs are predictable for testing and future migrations that may need to reference them.

### Success Criteria:

#### Automated Verification:

- Migration applies: `npx supabase db push` exits 0
- `npx supabase migration list` shows exactly 3 applied migrations
- Row counts via dashboard SQL editor: `SELECT count(*) FROM services` = 8, `SELECT count(*) FROM packages` = 3, `SELECT count(*) FROM room_qr_codes` = 10, `SELECT count(*) FROM package_services` = 19

#### Manual Verification:

- All 8 services visible in dashboard Table Editor with correct names and categories
- Package "Premium" has 6 included services and 2 addon services in `package_services`
- Room QR codes for rooms 101–110 present, each with a non-null unique `qr_token`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: TypeScript Types + Environment Contract

### Overview

Generate TypeScript types from the applied schema, add `SUPABASE_JWT_SECRET` to the env schema, extend `App.Locals` with a `guestToken` field, and update middleware to detect and validate the `guest_session` JWT cookie. Installing `jose` is the first step since the middleware depends on it.

### Changes Required:

#### 1. Install jose

**File**: `package.json` (updated via npm)

**Intent**: Add the `jose` library — the only JWT implementation compatible with Cloudflare Workers' V8 isolate environment. `jsonwebtoken` uses Node.js `crypto` which is not available even with `nodejs_compat`.

**Contract**: `npm install jose` — adds `jose` to `dependencies`.

---

#### 2. Add GUEST_SESSION_SECRET and SUPABASE_SERVICE_ROLE_KEY to env schema

**File**: `astro.config.mjs`

**Intent**: Declare both new server-only secrets alongside the existing `SUPABASE_URL` and `SUPABASE_KEY` entries so they're importable from `astro:env/server` and never bundled into the client.

**Contract**: Add inside the existing `env.schema` object:
```typescript
SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
GUEST_SESSION_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
```

---

#### 3. Update .env.example

**File**: `.env.example`

**Intent**: Add placeholders for both new secrets.

**Contract**: Add two lines:
```
SUPABASE_SERVICE_ROLE_KEY=###   # Settings → API → service_role key
GUEST_SESSION_SECRET=###        # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

#### 4. Generate TypeScript types

**File**: `src/types.ts` (new file, generated)

**Intent**: Auto-generate fully-typed Supabase database types so all API routes and components have compile-time guarantees on table shapes. Requires Phase 1+2 migrations to be applied to the cloud project and the project to be linked.

**Contract**: Run `npx supabase gen types typescript --linked > src/types.ts` from the project root. The output contains a `Database` type with `Tables`, `Views`, `Functions`, and `Enums` namespaces. Downstream code imports like `import type { Database } from '@/types'`. Add `src/types.ts` to `.gitignore` only if it contains sensitive data — it doesn't, so commit it.

---

#### 5. Update App.Locals interface

**File**: `src/env.d.ts`

**Intent**: Add `guestToken` to `App.Locals` so Astro pages and API routes have typed access to the resolved guest session alongside the existing `user` field.

**Contract**:
```typescript
interface GuestTokenLocals {
  tokenId: string;      // guest_tokens.id
  roomNumber: string;   // e.g. '101'
  packageId: string;    // packages.id
  exp: number;          // Unix timestamp matching check_out_date
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    guestToken: GuestTokenLocals | null;
  }
}
```

---

#### 6. Extend middleware for guest JWT detection

**File**: `src/middleware.ts`

**Intent**: After resolving the Supabase staff user (existing logic), additionally check for a `guest_session` HttpOnly cookie. If present, verify it with `jose` using `SUPABASE_JWT_SECRET`. On success, populate `context.locals.guestToken`; on any failure (missing, expired, invalid signature), set it to `null` silently — an invalid cookie means the guest is unauthenticated, not an error condition.

**Contract**: 
- Cookie name: `guest_session`
- Import `jwtVerify` from `jose`
- Verification: `jwtVerify(cookieValue, secret, { algorithms: ['HS256'] })` where `secret = new TextEncoder().encode(GUEST_SESSION_SECRET)`
- Payload claims used: `tokenId: string`, `roomNumber: string`, `packageId: string` (top-level claims)
- Wrap the entire verification in try/catch; any exception → `guestToken = null`
- `GUEST_SESSION_SECRET` is imported from `astro:env/server`

```typescript
// Pseudocode showing the addition to the existing middleware
const guestCookie = context.cookies.get("guest_session")?.value;
if (guestCookie && GUEST_SESSION_SECRET) {
  try {
    const secret = new TextEncoder().encode(GUEST_SESSION_SECRET);
    const { payload } = await jwtVerify(guestCookie, secret, { algorithms: ["HS256"] });
    context.locals.guestToken = {
      tokenId: payload.tokenId as string,
      roomNumber: payload.roomNumber as string,
      packageId: payload.packageId as string,
      exp: payload.exp as number,
    };
  } catch {
    context.locals.guestToken = null;
  }
} else {
  context.locals.guestToken = null;
}
```

### Success Criteria:

#### Automated Verification:

- `npm run build` passes with no type errors
- `npm run lint` passes
- TypeScript type-check passes: `npx tsc --noEmit`
- `src/types.ts` exists and is non-empty

#### Manual Verification:

- `src/types.ts` contains `export type Database = { ... }` with Tables for all 6 tables
- Setting a valid `guest_session` cookie in browser dev tools → middleware sets `guestToken` (verify via a temporary debug log or a test endpoint)
- Setting an expired or tampered cookie → `guestToken` is `null`, no 500 error

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None required for this change — it is pure schema + configuration with no business logic

### Integration Tests:

- Covered by Supabase Studio manual verification in each phase
- RLS policies are verified by attempting queries with guest vs staff clients (manual in Phase 1)

### Manual Testing Steps:

1. Run `npx supabase db push` — verify it exits 0 and all 3 migrations show as applied in `migration list`
2. In Supabase dashboard → Authentication → Policies, verify each table has the correct policy count
3. Test RLS discrimination: using the dashboard SQL editor, run `SET LOCAL role = authenticated; SET LOCAL request.jwt.claims = '{"is_guest":"true","sub":"<a uuid>"}'; SELECT * FROM orders;` — should return 0 rows. Staff version (omit `is_guest`) should return all rows.
4. After Phase 3: start dev server with `npm run dev`, open browser devtools, manually set a `guest_session` cookie to a valid HS256 JWT signed with `GUEST_SESSION_SECRET` → reload a page and verify `guestToken` is populated in server logs

## Performance Considerations

All indexes are created in Phase 1. The key query patterns for MVP (orders by token_id, orders by status for badge count, token lookup by token_value) are each covered by an index. No further optimization needed at this scale.

## Migration Notes

- `npx supabase db push` applies all unapplied migration files to the linked cloud project and is safe to run repeatedly — already-applied migrations are skipped.
- Link the project once before first push: `npx supabase link --project-ref <ref>` (the `<ref>` is the project ID from the Supabase dashboard URL).
- Seed data lives in `20260528000003_seed.sql` (a migration), not in `seed.sql`. This means it is applied exactly once via `db push` and tracked in `supabase_migrations.schema_migrations`. Do not use `supabase db reset` in production.
- To re-seed during development (e.g., after manually deleting rows), apply the seed rows via the dashboard SQL editor — do not delete and re-apply the migration.

## References

- Roadmap: `context/foundation/roadmap.md` — F-01 section
- PRD: `context/foundation/prd.md` — §Access Control, §Business Logic
- Supabase SSR client: `src/lib/supabase.ts`
- Existing middleware: `src/middleware.ts`
- Astro env schema: `astro.config.mjs`
- Supabase custom JWT docs: https://supabase.com/docs/guides/auth/jwts

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS Migrations

#### Automated

- [x] 1.1 Migrations apply cleanly: `npx supabase db push` exits 0 — 307b7e4
- [x] 1.2 Migration count: `npx supabase migration list` shows exactly 2 applied migrations — 307b7e4
- [x] 1.3 Build still passes: `npm run build` — 307b7e4
- [x] 1.4 Lint passes: `npm run lint` — 307b7e4

#### Manual

- [x] 1.5 All 6 tables visible in Supabase dashboard → Table Editor — 307b7e4
- [x] 1.6 RLS enabled on all 6 tables (Authentication → Policies shows "RLS enabled" per table) — 307b7e4
- [x] 1.7 `orders` has 2 policies (staff read + staff update), all other tables have 1 policy each — 307b7e4
- [x] 1.8 `package_services` UNIQUE constraint visible in Studio → Database → Tables → Constraints — 307b7e4

### Phase 2: Seed Data

#### Automated

- [x] 2.1 Seed migration applies: `npx supabase db push` exits 0 — f7b2b96
- [x] 2.2 `npx supabase migration list` shows exactly 3 applied migrations — f7b2b96
- [x] 2.3 Row counts correct: 8 services, 3 packages, 10 room_qr_codes, 19 package_services — f7b2b96

#### Manual

- [x] 2.4 All 8 services visible in Studio Table Editor with correct names and categories — f7b2b96
- [x] 2.5 Package "Premium" has 6 included services and 2 addon services in package_services — f7b2b96
- [x] 2.6 Room QR codes for rooms 101–110 present with unique non-null qr_token values — f7b2b96

### Phase 3: TypeScript Types + Environment Contract

#### Automated

- [x] 3.1 `npm run build` passes with no type errors — 8d5f7a1
- [x] 3.2 `npm run lint` passes — 8d5f7a1
- [x] 3.3 TypeScript type-check passes: `npx tsc --noEmit` — 8d5f7a1
- [x] 3.4 `src/types.ts` exists and is non-empty — 8d5f7a1

#### Manual

- [x] 3.5 `src/types.ts` contains `export type Database` with Tables for all 6 tables — 8d5f7a1
- [x] 3.6 Valid `guest_session` cookie (signed with GUEST_SESSION_SECRET) → middleware populates `guestToken` — 8d5f7a1
- [x] 3.7 Expired/tampered cookie → `guestToken` is null, no 500 error — 8d5f7a1

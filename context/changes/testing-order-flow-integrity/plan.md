# Order Flow Integrity — Integration Tests Implementation Plan

## Overview

Wdrażamy testy integracyjne (Phase 2 z `context/foundation/test-plan.md`) pokrywające ryzyka #4, #5 i #6: maszynę stanów zamówień, autoryzację usług per pakiet oraz izolację gość-do-gościa (IDOR). Testy uderzają w prawdziwy lokalny Supabase — baza danych nie jest mockowana. Wynikiem jest jeden plik testowy (~11 nowych testów) gotowy do uruchomienia przez `npm test`.

## Current State Analysis

Infrastruktura testów istnieje z Phase 1 (`context/changes/testing-runner-qr-auth-path/`):
- Vitest skonfigurowany w `vitest.config.ts` (Node env, globals, glob `src/__tests__/**/*.test.ts`)
- 7 testów przechodzi: 1 smoke + 5 middleware + 2 QR-auth
- Wzorzec Phase 1: `vi.mock("astro:env/server")` z hardcoded wartościami + bezpośrednie wywołanie handlera z mock context
- Brak ładowania `.env` — Phase 1 nie potrzebuje prawdziwych credentials

Endpointy zamówień (kompletne, gotowe do testowania):
- `GET /api/guest/orders` — `src/pages/api/guest/orders/index.ts:13–36`
- `POST /api/guest/orders` — `src/pages/api/guest/orders/index.ts:38–100`
- `PATCH /api/guest/orders/[id]` — `src/pages/api/guest/orders/[id].ts:8–53`

Wszystkie trzy guest endpointy używają `createServiceRoleClient()` wewnętrznie — wystarczy nie mockować `@/lib/supabase` i dostarczyć prawdziwe credentials przez `astro:env/server`.

Seed data ma stałe UUID-y (services, packages, rooms) — deterministyczne dla testów.

## Desired End State

Po ukończeniu planu:
- `npm test` uruchamia wszystkie testy (istniejące 7 + nowe ~11) bez regresjii
- Plik `src/__tests__/orders.integration.test.ts` zawiera oddzielne describe-bloki dla każdego ryzyka (#4, #5, #6) i 3 testy 401-guard
- Lokalny Supabase (`supabase start`) jest wymagany do uruchomienia testów; CI (Phase 4) skonfiguruje `supabase start` w GitHub Actions
- Po przebiegu testów baza nie zawiera śmieciowych danych (cleanup działa)

### Key Discoveries:

- `createServiceRoleClient()` w `src/lib/supabase.ts:6–19` — używa `SUPABASE_SERVICE_ROLE_KEY` z `astro:env/server`; ustawia `auth: { persistSession: false }`. Nie wymaga prawdziwej sesji auth — działa czysto w Node.
- Seed `supabase/migrations/20260528000003_seed.sql` — stałe UUID usług i pakietów. Basic package: addony to Basen (`...0001-000000000003`), Parking (`...004`), SPA (`...005`). WiFi (`...001`) i Śniadanie (`...002`) są `included` (nie addon). Room service (`...007`) jest addonem TYLKO w Premium.
- IDOR guard w PATCH `[id].ts:26–31` — `SELECT WHERE id = ? AND guest_token_id = ?`; brak matchowania → 404 (nie 403). Test musi sprawdzić właśnie 404, nie 403.
- Status CHECK constraint w `supabase/migrations/20260528000001_schema.sql:58` — akceptuje wartości `pending|fulfilled|cancelled`; nie wymusza przejść. Direct INSERT z `status='fulfilled'` jest poprawny SQL — nie narusza constraintu.
- FK `orders.guest_token_id → guest_tokens.id` bez ON DELETE CASCADE — cleanup musi usunąć orders PRZED guest_tokens.
- `context.locals.guestToken` w testach przyjmuje kształt `{ tokenId, roomNumber, packageId, checkOutDate, exp }` — zdefiniowany w `src/env.d.ts`.

## What We're NOT Doing

- Nie testujemy staff API endpointów (GET /api/staff/orders, PATCH /api/staff/orders/[id]) w tej fazie — zakres Phase 2 to guest-side risks #4-6.
- Nie testujemy wranglera ani zachowania Cloudflare Workers Runtime — per test-plan §7.
- Nie testujemy auth pages ani shadcn/ui komponentów — per test-plan §7.
- Nie modyfikujemy `ci.yml` — wiring CI jest zakresem Phase 4.
- Nie tworzymy osobnych plików per ryzyko — jeden plik z describe-blokami.

## Implementation Approach

**Phase 1** to zmiana jednej linii w `vitest.config.ts` ładująca `.env` do `process.env` zanim ruszą testy. Phase 1 testy (hardcoded mock values) są nietkniete — ich `vi.mock` ignoruje `process.env`.

**Phase 2** to nowy plik `orders.integration.test.ts`:
1. `vi.mock("astro:env/server")` fabryka czyta `process.env` (wartości z `.env`)
2. Stałe seed UUIDs (pakiety, usługi) zdefiniowane na górze pliku
3. `beforeAll` tworzy 2 guest_tokens (A: Basic, B: Standard) przez service role client
4. `afterAll` usuwa wszystkie orders dla test-guestów (safety net), potem guest_tokens
5. `afterEach` usuwa orders dodanych w danym teście (tracked IDs → czyste state między testami)
6. Testy bezpośrednio importują i wywołują handlery `GET`, `POST`, `PATCH` z mock APIContext
7. Mock APIContext (`makeGuestApiContext`) dostarcza `locals.guestToken`, `request` (realny `Request` object z JSON body), `params`, `cookies`

## Critical Implementation Details

**Kolejność cleanup**: `afterEach` usuwa tracked order IDs; `afterAll` usuwa ALL orders WHERE guest_token_id IN testowych tokenów (safety net), dopiero potem DELETE guest_tokens. Odwrotna kolejność narusza FK constraint.

**`Request` object**: Zamiast mockować `context.request.json()`, przekazuj realny `new Request(url, { method, body: JSON.stringify(data), headers: { "Content-Type": "application/json" } })` — działa w Node 22 bez polyfilla.

**IDOR 404 vs 403**: Test Risk #6 PATCH (gość A wywołuje cancel na zamówieniu gościa B) powinien oczekiwać `404` — handler zwraca 404 gdy `SELECT WHERE id = ? AND guest_token_id = ?` nie zwraca wiersza (`[id].ts:33–35`).

---

## Phase 1: Env Loading w Vitest

### Overview

Dodajemy ładowanie `.env` do `process.env` zanim uruchomią się testy. Wymaga zmiany jednej linii w vitest.config.ts. Istniejące testy Phase 1 nie są dotknięte.

### Changes Required:

#### 1. vitest.config.ts — dotenv import

**File**: `vitest.config.ts`

**Intent**: Dodać `import "dotenv/config"` na górze pliku aby Vitest ładował `.env` do `process.env` przed uruchomieniem jakichkolwiek testów. Testy Phase 2 będą czytać `process.env.SUPABASE_URL` i `process.env.SUPABASE_SERVICE_ROLE_KEY` wewnątrz fabryki `vi.mock("astro:env/server")`.

**Contract**: Import na poziomie modułu przed `defineConfig`. Phase 1 testy używają hardcoded mock values w `vi.mock("astro:env/server", () => ({ GUEST_SESSION_SECRET: "a".repeat(64), ... }))` — nie odwołują się do `process.env`, więc są nietkniete.

### Success Criteria:

#### Automated Verification:

- Istniejące 7 testów nadal przechodzi: `npm test`
- TypeCheck przechodzi: `npx tsc --noEmit`

#### Manual Verification:

- Dodaj tymczasowy `console.log(process.env.SUPABASE_URL)` w nowym pliku testowym — potwierdź że widać URL z `.env` (np. `http://127.0.0.1:54321`), nie `undefined`

**Implementation Note**: Zatrzymaj się po tej fazie i potwierdź manualnie że `process.env` ma wartości z `.env` przed przejściem do Phase 2.

---

## Phase 2: Integration Test File

### Overview

Tworzy `src/__tests__/orders.integration.test.ts` z kompletnym pokryciem ryzyk #4 (maszyna stanów), #5 (autoryzacja usług), #6 (izolacja IDOR) oraz 401-guard dla każdego guest endpointu.

### Changes Required:

#### 1. Nowy plik testowy

**File**: `src/__tests__/orders.integration.test.ts`

**Intent**: Pokryć wszystkie trzy ryzyka w jednym pliku. Struktura: stałe seed UUIDs → pomocnicze funkcje → beforeAll/afterAll/afterEach lifecycle → cztery describe bloki (401 guards, Risk #4, Risk #5, Risk #6).

**Contract**: Plik musi:
- Na górze: `vi.mock("astro:env/server", () => ({ SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_KEY: process.env.SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, GUEST_SESSION_SECRET: process.env.GUEST_SESSION_SECRET ?? "a".repeat(64) }))`
- NIE mockować `@/lib/supabase` — `createServiceRoleClient()` musi wykonać prawdziwe zapytania do DB
- Importować handlery: `import { GET, POST } from "@/pages/api/guest/orders/index"` i `import { PATCH } from "@/pages/api/guest/orders/[id]"`

**Stałe seed UUIDs** (do definiowania na górze pliku):

```typescript
const BASIC_PKG    = "00000000-0000-0000-0002-000000000001";
const STANDARD_PKG = "00000000-0000-0000-0002-000000000002";
const BASEN_SVC    = "00000000-0000-0000-0001-000000000003"; // addon w Basic ✓
const WIFI_SVC     = "00000000-0000-0000-0001-000000000001"; // included w Basic (nie addon) ✗
const ROOM_SVC_SVC = "00000000-0000-0000-0001-000000000007"; // addon tylko w Premium ✗
const SPA_SVC      = "00000000-0000-0000-0001-000000000005"; // addon w Standard (do setup B)
```

**Helper `getTestClient()`**: Zwraca `createServiceRoleClient()` — wywołaj po imporcie modułów (lazy, żeby mock był już aktywny).

**Helper `makeGuestApiContext(guestToken, body?, routeParams?)`**: Buduje mock `APIContext`:
- `locals: { guestToken: guestToken ?? null, user: null }`
- `request`: realny `new Request("http://localhost/", { method: body ? "POST"/"PATCH" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })`
- `params: routeParams ?? {}`
- `cookies`: minimalne mock (get/getAll/set/delete jako `vi.fn()`)

**`beforeAll`**: Insert do `guest_tokens` dwóch wierszy przez `getTestClient()`:
- tokenA: `crypto.randomUUID()` jako id, BASIC_PKG, room_number "101", check_out_date "2099-12-31"
- tokenB: `crypto.randomUUID()` jako id, STANDARD_PKG, room_number "102", check_out_date "2099-12-31"
- Obie zmienne `tokenAId` / `tokenBId` ustawione w scope `describe` (hoisted via `let`)

**`afterAll`**: 
1. `DELETE FROM orders WHERE guest_token_id IN (tokenAId, tokenBId)` (safety net)
2. `DELETE FROM guest_tokens WHERE id IN (tokenAId, tokenBId)`

**`afterEach`**: `DELETE FROM orders WHERE id IN (...createdOrderIds)`; reset tablicy `createdOrderIds = []`

**Describe bloki i przypadki testowe** (każdy `it` to oddzielny test):

*describe "Authorization — 401 guard" (3 testy):*
- GET bez guestToken → status 401
- POST bez guestToken → status 401
- PATCH bez guestToken → status 401

*describe "Risk #4 — Order state machine" (3 testy):*
- POST valid addon (BASEN z Basic) → status 201; VERIFY DB: `SELECT status FROM orders WHERE id = returned_id` → `'pending'`
- PATCH cancel pending → status 200, body `{ status: "cancelled" }`; VERIFY DB: status `'cancelled'`
- PATCH cancel fulfilled (direct INSERT w beforeEach tego testu z status='fulfilled') → status 409

*describe "Risk #5 — Service authorization" (3 testy):*
- POST included service (WIFI_SVC z Basic) → status 403
- POST out-of-package service (ROOM_SVC_SVC z Basic) → status 403
- POST valid addon (BASEN_SVC z Basic) → status 201 (happy path potwierdzenie)

*describe "Risk #6 — IDOR guest isolation" (2 testy):*
- GET z tokenem A gdy B ma zamówienie w DB → odpowiedź nie zawiera orderId gościa B
- PATCH z tokenem A na orderId należącym do B → status 404

**Weryfikacja DB po Risk #4**: Po wywołaniu handlera — zapytaj DB przez `getTestClient()` i sprawdź faktyczny status wiersza. To jest "Must Challenge" z test-plan: `"Status updated" ≠ "state machine enforced atomically"`.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy przechodzą: `npm test` (7 istniejących + ~11 nowych = ~18 łącznie)
- TypeCheck przechodzi: `npx tsc --noEmit`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Uruchom testy z lokalnym Supabase (`supabase start`); potwierdź że wszystkie przechodzą
- Po przebiegu testów sprawdź w Supabase Studio (`http://localhost:54323`) że tabele `orders` i `guest_tokens` nie mają śmieciowych wierszy testowych (cleanup działa)
- Usuń tymczasowo warunek IDOR z `[id].ts:30` (`.eq("guest_token_id", tokenId)`); potwierdź że test Risk #6 PATCH failuje — to weryfikuje że test RZECZYWIŚCIE wykrywa lukę, nie tylko przechodzi formalnie
- Sprawdź że `npm test` bez uruchomionego Supabase wyrzuca czytelny błąd połączenia (nie cichy fail)

**Implementation Note**: Po ukończeniu i pozytywnym manual verification, potwierdź przed merge. CI wiring (uruchamianie `supabase start` w GitHub Actions) jest zakresem Phase 4.

---

## Testing Strategy

### Unit Tests:

Brak nowych unit testów w tej fazie — Phase 2 to wyłącznie testy integracyjne.

### Integration Tests:

- Risk #4 — maszyna stanów: pending creation (weryfikacja DB), cancel pending (weryfikacja DB), cancel fulfilled (409)
- Risk #5 — autoryzacja: 3 przypadki graniczne (valid addon, included, out-of-package)
- Risk #6 — izolacja: GET cross-guest, PATCH cross-guest (IDOR 404)
- 401 guards: GET, POST, PATCH bez auth

### Manual Testing Steps:

1. `supabase start` → poczekaj na gotowość
2. `npm test` → wszystkie ~18 testów przechodzi
3. Sprawdź Supabase Studio: brak śmieciowych wierszy w `orders` i `guest_tokens`
4. Regression check: usuń `.eq("guest_token_id", tokenId)` z `[id].ts:30`; `npm test` → Risk #6 PATCH failuje; przywróć

## Migration Notes

Brak zmian schematu ani migracji. Dane testowe są tworzone i czyszczone przez testy.

Przed uruchomieniem testów:
1. `supabase start` (jednorazowy setup per sesja)
2. Migracje muszą być zaaplikowane: `supabase db push` lub `supabase migration up`
3. `.env` musi zawierać `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_KEY`, `GUEST_SESSION_SECRET`

## References

- Test plan: `context/foundation/test-plan.md` §2 Risk Map (ryzyka #4, #5, #6) i §3 Phase 2
- Phase 1 wzorce: `context/changes/testing-runner-qr-auth-path/plan.md`
- Istniejące testy (wzorce): `src/__tests__/qr-auth.test.ts`, `src/__tests__/middleware.test.ts`
- Guest order endpoints: `src/pages/api/guest/orders/index.ts`, `src/pages/api/guest/orders/[id].ts`
- Seed UUIDs: `supabase/migrations/20260528000003_seed.sql`
- Supabase client factory: `src/lib/supabase.ts:6–19`

---

## Progress

> Konwencja: `- [ ]` oczekuje, `- [x]` gotowe. Dopisz ` — <commit sha>` gdy krok ląduje. Nie zmieniaj tytułów kroków.

### Phase 1: Env Loading w Vitest

#### Automated

- [x] 1.1 Istniejące 7 testów nadal przechodzi po dodaniu dotenv: `npm test` — cd7a229
- [x] 1.2 TypeCheck przechodzi: `npx tsc --noEmit` — cd7a229

#### Manual

- [x] 1.3 `process.env.SUPABASE_URL` widoczne w test context (nie `undefined`) — cd7a229

### Phase 2: Integration Test File

#### Automated

- [x] 2.1 Wszystkie testy przechodzą (istniejące + nowe): `npm test` — 87dacb6
- [x] 2.2 TypeCheck przechodzi: `npx tsc --noEmit` — 87dacb6
- [x] 2.3 Lint przechodzi: `npm run lint` — 87dacb6

#### Manual

- [x] 2.4 Testy przechodzą z lokalnym Supabase (`supabase start`) — 87dacb6
- [x] 2.5 Brak śmieciowych wierszy testowych w DB po przebiegu testów — 87dacb6
- [x] 2.6 Regression check: usunięcie IDOR guard powoduje fail testu Risk #6 — 87dacb6

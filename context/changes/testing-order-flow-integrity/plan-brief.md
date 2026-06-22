# Order Flow Integrity — Plan Brief

> Pełny plan: `context/changes/testing-order-flow-integrity/plan.md`

## What & Why

Wdrażamy Phase 2 testu z `context/foundation/test-plan.md` — testy integracyjne pokrywające ryzyka #4-6: maszynę stanów zamówień (pending→cancelled, guard na fulfilled), autoryzację usług per pakiet gościa, oraz izolację IDOR (gość A nie widzi/modyfikuje zamówień gościa B). Bez tych testów krytyczne właściwości bezpieczeństwa systemu zamówień są niesprawdzone.

## Starting Point

Infrastruktura Vitest istnieje z Phase 1 (7 testów przechodzi: smoke + middleware + QR auth). Endpointy guest orders (`GET`, `POST`, `PATCH /api/guest/orders`) są kompletne i gotowe — testy Phase 1 używały mocków Supabase, Phase 2 uderza w prawdziwy lokalny Supabase.

## Desired End State

`npm test` uruchamia ~18 testów (7 istniejących + ~11 nowych integracyjnych), wszystkie przechodzą. Jeden plik `src/__tests__/orders.integration.test.ts` weryfikuje wszystkie trzy ryzyka z test-plan. Baza nie zawiera śmieciowych danych po przebiegu testów.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Supabase w testach | Prawdziwy lokalny (`supabase start`) | Test-plan wymaga "nie mockuj bazy"; per risk #4 anti-pattern |
| Credentials | Istniejący `.env` | Zero nowych plików; developer ma już lokalny Supabase |
| CI | Lokalny Supabase via Docker w Actions | Pełna pewność; ubuntu-latest ma Docker; CI wiring w Phase 4 |
| Fulfilled state setup | Direct INSERT via service role | Unika staff-auth complexity; CHECK constraint akceptuje 'fulfilled' |
| Cleanup | DELETE by tracked IDs (afterEach) + safety net (afterAll) | Bezpieczne na shared instance; nie rusza seed data |
| Guest tokens | beforeAll per suite + afterAll | 1 insert/delete per plik; szybsze niż beforeEach |
| Struktura pliku | Jeden plik `orders.integration.test.ts` | Spójne z Phase 1 wzorcem 1 plik = 1 obszar |
| Staff routes | Poza scope Phase 2 | Risks #4-6 są guest-side; staff PATCH wymaga sesji auth |
| 401 coverage | Tak, 3 testy (jeden per endpoint) | Weryfikuje auth guard na poziomie API, nie tylko middleware |

## Scope

**In scope:**
- `vitest.config.ts` — ładowanie `.env` (1 linia)
- `src/__tests__/orders.integration.test.ts` — nowy plik (~11 testów)
- Ryzyka #4, #5, #6 z test-plan

**Out of scope:**
- Staff API endpointy (`/api/staff/orders`)
- Modyfikacja `ci.yml` (Phase 4)
- Wrangler / Cloudflare Workers runtime
- Auth pages, shadcn/ui snapshots

## Architecture / Approach

Testy importują handlery bezpośrednio (`GET`, `POST`, `PATCH`) i wywołują je z mock `APIContext` (locals.guestToken + realny Request object). `@/lib/supabase` NIE jest mockowany — `createServiceRoleClient()` używa prawdziwych credentials z `.env` via `vi.mock("astro:env/server", () => process.env)`. Seed data (services, packages, rooms) ma stałe UUID-y i jest używana przez reference. Dane testowe (`guest_tokens`, `orders`) są tworzone i czyszczone przez lifecycle hooks.

```
vi.mock("astro:env/server") ← process.env (z .env)
         │
         ▼
createServiceRoleClient() ← prawdziwy Supabase
         │
   [GET/POST/PATCH handler]
         │
   mock APIContext (locals.guestToken, Request)
```

## Phases at a Glance

| Phase | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Env Loading | `vitest.config.ts` ładuje `.env`; istniejące 7 testów bez regresjii | `dotenv` może nie być zainstalowany → `npm install -D dotenv` |
| 2. Integration Tests | `orders.integration.test.ts` z 11 testami; ryzyka #4, #5, #6 pokryte | Supabase nie uruchomiony lokalnie → testy failują z błędem połączenia |

**Prerequisites:** Lokalny Supabase uruchomiony (`supabase start`); `.env` zawiera `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; migracje zaaplikowane.

**Estimated effort:** ~1 sesja (2 fazy, obie krótkie: 1 linia + ~150 linii nowego kodu testowego).

## Open Risks & Assumptions

- `dotenv` musi być dostępny jako devDependency; jeśli brak → `npm install -D dotenv` przed Phase 1
- Lokalne uruchomienie seed migracji jest wymagane; jeśli baza jest czysta (brak seed data), testy Risk #5 failują z 403 zamiast 201 dla valid addon (brak wierszy w `package_services`)
- FK `orders → guest_tokens` bez ON DELETE CASCADE — kolejność cleanup jest wymagana (orders najpierw); afterAll safety net to respektuje

## Success Criteria (Summary)

- `npm test` przechodzi ~18 testów łącznie (7 + ~11 nowych) z lokalnym Supabase
- Usunięcie `.eq("guest_token_id", tokenId)` z `[id].ts:30` powoduje fail testu Risk #6 — test wykrywa rzeczywistą lukę IDOR
- Baza lokalna nie zawiera śmieciowych wierszy po przebiegu testów

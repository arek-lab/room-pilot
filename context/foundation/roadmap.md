---
project: RoomPilot
version: 1
status: draft
created: 2026-05-27
updated: 2026-05-28
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: RoomPilot

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Goście hotelowi tracą czas na recepcji z dwóch połączonych przyczyn: nie wiedzą, co mają w pakiecie, i nie mogą niczego zamówić bez kontaktu z personelem. RoomPilot wchodzi w tę lukę jako lekka, niezależna warstwa guest-facing, która nie wymaga integracji z istniejącymi systemami PMS. MVP celuje w jeden hotel pilotażowy i jeden konkretny przepływ: gość sam uzyskuje dostęp przez QR, zamawia usługę i widzi status — bez jednego telefonu do recepcji.

## North star

**S-04: personel recepcji widzi i realizuje pierwsze zamówienie gościa złożone bez kontaktu z recepcją** — zamknięcie pełnej pętli transakcji (gość skanuje QR → składa zamówienie add-on → recepcja otrzymuje powiadomienie → oznacza jako zrealizowane) jest jedynym momentem, który udowadnia, że self-service działa end-to-end, zgodnie z PRD §Success Criteria Primary.

> Gwiazda przewodnia (ang. north star) to najdrobniejszy end-to-end slice, którego dostarczenie potwierdza główną hipotezę produktu — umieszczamy go jak najwcześniej w kolejce, bo wszystko inne ma znaczenie tylko wtedy, gdy ten slice działa.

## At a glance

| ID   | Change ID                | Outcome (personel/gość może …)                                          | Prerequisites  | PRD refs                                                              | Status   |
|------|--------------------------|-------------------------------------------------------------------------|----------------|-----------------------------------------------------------------------|----------|
| F-01 | db-schema-supabase       | (foundation) tabele, RLS i dane startowe gotowe w Supabase              | —              | FR-001, FR-004, FR-006, FR-007, FR-008, FR-009, FR-012, FR-013, §Access Control | done     |
| S-01 | staff-auth-qr-generation | logować się i generować/pobrać token QR gościa                          | F-01           | FR-001, FR-004, FR-005, FR-014                                        | proposed |
| S-02 | guest-qr-auth-panel      | uzyskać dostęp przez dwuetapowy QR i zobaczyć panel usług z dashboardem | S-01, F-01     | FR-002, FR-003, FR-004, FR-006, FR-007, FR-010, US-01                 | proposed |
| S-03 | guest-order-addon        | zamówić add-on i anulować go inline; recepcja dostaje e-mail w ≤60s     | S-02, F-01     | FR-008, FR-009, US-02                                                 | proposed |
| S-04 | reception-order-panel    | przeglądać i obsługiwać zamówienia z auto-odświeżaniem co 10s           | S-03, F-01     | FR-012, FR-013, FR-015, US-03                                         | proposed |
| S-05 | ai-concierge             | pytać AI concierge i dostać konkretną rekomendację domenową             | S-02           | FR-011                                                                | proposed |

## Streams

Navigation aid — grupuje elementy według wspólnego łańcucha prererekwizytów. Kanoniczna kolejność zdefiniowana jest w grafie zależności poniżej; ta tabela to proponowany porządek czytania przez równoległe tory.

| Stream | Temat             | Łańcuch                                          | Uwaga                                                                          |
|--------|-------------------|--------------------------------------------------|--------------------------------------------------------------------------------|
| A      | Ścieżka must-have | `F-01` → `S-01` → `S-02` → `S-03` → `S-04`     | Jedyna ścieżka do gwiazdy przewodniej; cel `speed` nakazuje skupić tu całą uwagę. |
| B      | AI concierge      | `S-05`                                           | Odgałęzienie z `S-02`; może być realizowane równolegle z `S-03`/`S-04`.       |

## Baseline

Stan kodu bazy na dzień `2026-05-27` (auto-zbadany + potwierdzony przez użytkownika).
Foundations poniżej zakładają, że poniższe warstwy są dostępne i ich NIE re-scaffoldują.

- **Frontend:** present — Astro 6.3.1 + React 19, shadcn/ui, Tailwind 4 (`src/components/ui/`, `components.json`)
- **Backend / API:** partial — Astro API routes tylko dla auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak tras biznesowych (zamówienia, tokeny QR, pakiety)
- **Data:** partial — Supabase klient skonfigurowany (`src/lib/supabase.ts`); brak migracji i schematów (`supabase/config.toml`: `schema_paths=[]`)
- **Auth:** partial — Supabase e-mail+hasło dla staff działa (`src/middleware.ts`); brak logiki tokenów QR dla gości
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), GitHub Actions CI (`.github/workflows/ci.yml`)
- **Observability:** absent — brak loggera, error trackingu i metryk

## Foundations

### F-01: Schemat bazy danych i konfiguracja Supabase

- **Outcome:** (foundation) tabele `guest_tokens`, `room_qr_codes`, `orders`, `services` i `packages` gotowe w Supabase z włączonym RLS i politykami per-rola (`guest`/`staff`); statyczne dane usług i pakietów dla hotelu pilotażowego zasiane.
- **Change ID:** `db-schema-supabase`
- **PRD refs:** FR-001, FR-004, FR-006, FR-007, FR-008, FR-009, FR-012, FR-013, §Access Control, NFR (token wygasa z check-out)
- **Unlocks:** S-01 (generowanie tokenów QR), S-02 (panel gościa), S-03 (składanie zamówień), S-04 (zarządzanie zamówieniami przez recepcję)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Jak generowane/zarządzane są fizyczne QR kody w pokojach — statyczny URL per numer pokoju (np. `/qr/room/101`) czy osobna tabela dynamicznych kodów? Owner: user. Block: no (można przyjąć statyczny URL per numer pokoju jako domyślne rozwiązanie MVP).
- **Risk:** Schemat musi obsłużyć tokenizację gościa bez kont Supabase Auth po stronie gościa — niestandardowe podejście do RLS; błędnie zaprojektowane polityki zablokują wszystkie kolejne slice'y i będą trudne do refaktoryzacji pod presją czasu.
- **Status:** done

## Slices

### S-01: Logowanie personelu i generowanie tokenów QR gościa

- **Outcome:** personel recepcji może zalogować się e-mailem i hasłem, wypełnić formularz danych gościa (imię, numer pokoju, daty pobytu, typ pakietu), wygenerować token QR i pobrać go lub wydrukować.
- **Change ID:** `staff-auth-qr-generation`
- **PRD refs:** FR-001, FR-004, FR-005, FR-014
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Supabase e-mail/hasło dla staff już działa; nowe ryzyko to generowanie QR kodu — biblioteka QR po stronie serwera (Workers) lub client-side; Workers Paid ($5/mo) musi być aktywny przed pierwszym testem produkcyjnym (per `context/foundation/infrastructure.md`).
- **Status:** proposed

### S-02: Dostęp gościa przez dwuetapowy QR i panel usług

- **Outcome:** gość może zeskanować QR z recepcji (wejście do trybu weryfikacji), zeskanować QR fizyczny w pokoju (odblokowanie pełnego dostępu) i zobaczyć panel z listą usług included, dostępnych add-onów oraz statusem zamówionych add-onów (badge: oczekuje / zrealizowane); wygasły token wyświetla czytelny komunikat błędu — nie blank screen.
- **Change ID:** `guest-qr-auth-panel`
- **PRD refs:** FR-002, FR-003, FR-004, FR-006, FR-007, FR-010, US-01
- **Prerequisites:** S-01, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Czy skan QR pokoju musi nastąpić w tej samej sesji przeglądarki co skan tokenu? Owner: user. Block: no (można przyjąć: tak, ta sama sesja / localStorage — najprostsze MVP).
- **Risk:** Stateless guest access bez Supabase Auth session — tokenizacja własna po stronie Workers cookies lub localStorage; błąd tutaj blokuje całą ścieżkę gościa i jest prererekwizytem każdego kolejnego slice'a.
- **Status:** proposed

### S-03: Gość składa i anuluje zamówienie add-on

- **Outcome:** gość może zamówić add-on z panelu i zobaczyć status "oczekuje" z wizualnym badge'em; może anulować zamówienie inline dopóki recepcja go nie oznaczyła jako zrealizowane; recepcja dostaje powiadomienie za pomocą badge w dashboard recepcji.
- **Change ID:** `guest-order-addon`
- **PRD refs:** FR-008, FR-009, US-02
- **Prerequisites:** S-02, F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** -
- **Risk:** -
- **Status:** proposed

### S-04: Panel recepcji — lista zamówień i obsługa

- **Outcome:** personel recepcji widzi listę aktywnych zamówień gości auto-odświeżaną co najwyżej co 10 sekund, badge z liczbą nieobsłużonych zamówień i może oznaczyć zamówienie jako zrealizowane lub anulowane; zmiana statusu propaguje się do panelu gościa.
- **Change ID:** `reception-order-panel`
- **PRD refs:** FR-012, FR-013, FR-015, US-03
- **Prerequisites:** S-03, F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gwiazda przewodnia — zamknięcie pętli self-service; polling co 10s jest prosty technicznie, ale propagacja statusu do panelu gościa wymaga spójnego cache-invalidation, żeby badge i status add-onu aktualizowały się bez ręcznego odświeżania przez gościa.
- **Status:** proposed

### S-05: AI concierge — rekomendacje domenowe

- **Outcome:** gość może zadać pytanie AI concierge z poziomu panelu gościa i otrzymać konkretną odpowiedź specyficzną dla hotelu (nie generyczną), opartą na hotelowym kontekście przekazanym w system prompt (nazwa hotelu, adres, menu, atrakcje lokalne, restauracje).
- **Change ID:** `ai-concierge`
- **PRD refs:** FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** Jak dostarczony jest kontekst hotelowy do AI concierge — hardcoded system prompt, plik JSON config, czy inne źródło? Owner: user. Block: no (PRD §Open Questions #2: można zacząć od hardcoded prompt z danymi pilotażowego hotelu).
- **Risk:** Jakość odpowiedzi zależy całkowicie od jakości danych hotelowych w prompcie; odpowiedź generyczna to failure wg PRD NFR. OpenAI SDK na Workers — dodatkowy narzut CPU (Workers Paid mandatory per `context/foundation/infrastructure.md`).
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                               | Ready for `/10x-plan` | Notes                                                       |
|------------|--------------------------|-----------------------------------------------------|-----------------------|-------------------------------------------------------------|
| F-01       | db-schema-supabase       | Schemat DB i konfiguracja Supabase (migracje + RLS) | yes                   | Run `/10x-plan db-schema-supabase`                          |
| S-01       | staff-auth-qr-generation | Panel recepcji — logowanie staff i generowanie QR   | no                    | Wymaga F-01                                                 |
| S-02       | guest-qr-auth-panel      | Panel gościa — dwuetapowy QR i widok usług          | no                    | Wymaga S-01, F-01                                           |
| S-03       | guest-order-addon        | Gość — zamawianie i anulowanie add-onów             | no                    | Wymaga S-02; równolegle z S-05                              |
| S-04       | reception-order-panel    | Panel recepcji — lista zamówień i obsługa           | no                    | Wymaga S-03; gwiazda przewodnia — cały MVP tu się domyka    |
| S-05       | ai-concierge             | AI concierge — odpowiedzi domenowe dla hotelu       | no                    | Wymaga S-02; realizuj równolegle z S-03/S-04                |

## Open Roadmap Questions

1. **Źródło danych do dashboardu add-onów** — system śledzi tylko add-ony zamówione przez aplikację; usługi używane poza nią (basen, sauna) nie będą widoczne w dashboardzie. Owner: user. Block: żaden slice (decyzja podjęta w PRD §Open Questions #1).
2. **Dostarczanie kontekstu hotelowego do AI concierge** — dane hotelowe (menu, atrakcje, restauracje) muszą skądś pochodzić. Owner: user. Block: S-05 (ale nie blokuje planowania — można zacząć od hardcoded prompt; per PRD §Open Questions #2).
3. **Jak generowane/zarządzane są fizyczne QR kody w pokojach?** — statyczny URL per numer pokoju (np. `/qr/room/101`) jest najprostszym MVP; dynamiczne kody wymagają osobnej tabeli i przepływu generowania. Owner: user. Block: S-02 (ale statyczny URL jest domyślnym i nie wymaga decyzji przed planowaniem S-02).

## Parked

- **Płatności online (karta, BLIK)** — Why parked: PRD §Non-Goals: rozliczenie tylko przy wymeldowaniu, offline; integracja z bramką płatniczą poza MVP.
- **Panel CRUD usług (admin)** — Why parked: PRD §Non-Goals: usługi konfigurowane statycznie przy wdrożeniu; MVP celuje w jeden hotel pilotażowy ze stałym zestawem usług.
- **Integracja z PMS (Opera, Protel)** — Why parked: PRD §Non-Goals: system działa niezależnie od PMS; integracja wymaga dostępu do API PMS.
- **Wielojęzyczność** — Why parked: PRD §Non-Goals: jeden język dla jednego hotelu pilotażowego.
- **Historia pobytów i program lojalnościowy** — Why parked: PRD §Non-Goals: każdy pobyt izolowany; wymaga trwałej tożsamości gościa.
- **Powiadomienia push** — Why parked: PRD §Non-Goals: wymaga FCM/APNs poza zakresem MVP.
- **Natywne aplikacje mobilne** — Why parked: PRD §Non-Goals: web na smartfonie wystarczy dla MVP.

## Done

- **F-01: (foundation) tabele, RLS i dane startowe gotowe w Supabase** — Archived 2026-05-28 → `context/archive/2026-05-28-db-schema-supabase/`. Lesson: —.

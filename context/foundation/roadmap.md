---
project: RoomPilot
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-03
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
| S-01 | staff-auth-qr-generation | logować się i generować/pobrać token QR gościa                          | F-01           | FR-001, FR-004, FR-005, FR-014                                        | done     |
| S-02 | guest-qr-auth-panel      | uzyskać dostęp przez dwuetapowy QR i zobaczyć panel usług z dashboardem | S-01, F-01     | FR-002, FR-003, FR-004, FR-006, FR-007, FR-010, US-01                 | done     |
| S-03 | guest-order-addon        | zamówić add-on i anulować go inline; recepcja widzi licznik pending w dashboard; panel gościa odświeża statusy co 20s | S-02, F-01     | FR-008, FR-009, US-02                                                 | done     |
| S-04 | reception-order-panel    | przeglądać i obsługiwać zamówienia z auto-odświeżaniem co 10s           | S-03, F-01     | FR-012, FR-013, FR-015, US-03                                         | done     |
| S-05 | ai-concierge             | pytać AI concierge i dostać konkretną rekomendację domenową             | S-02           | FR-011                                                                | done     |
| D-00 | public-landing-page      | niezalogowany użytkownik widzi stronę główną z nazwą "RoomPilot", grafiką hotelową i formularzem logowania inline; branding "10x Astro Starter" usunięty | —              | —                | done     |
| D-01 | design-token-foundation  | (foundation) spójny design system: paleta, typografia, spacing gotowe jako Tailwind tokens + CSS vars | S-04           | —                | done     |
| D-02 | guest-panel-redesign     | gość widzi panel z kartami usług 2-w-linii ze zdjęciami, mobile-first, w stylu boutique hotel        | D-01           | FR-006, FR-007   | done     |
| D-02a| services-image-field     | (side task) pole image_url w tabeli services + fallback placeholder w UI                              | F-01           | FR-006           | done     |
| D-03 | reception-panel-polish   | personel widzi czytelny panel zamówień z wyraźnymi akcjami i pending badge, desktop-optimized         | D-01           | FR-012, FR-013   | done     |
| D-04 | dashboard-mobile-nav     | personel widzi na telefonie topbar z hamburger menu otwierającym pełną nawigację (Generate Token, Orders + badge, Sign Out); tap targets ≥ 44px | D-03 | — | done     |
| D-05 | dashboard-ai-concierge   | personel widzi sekcję "AI Concierge" z tabem "Dane o hotelu" (fake door z polami konfiguracyjnymi) i tabem "Alerty AI Concierge" (pusty) | D-04, S-05 | FR-011 | proposed |

## Streams

Navigation aid — grupuje elementy według wspólnego łańcucha prererekwizytów. Kanoniczna kolejność zdefiniowana jest w grafie zależności poniżej; ta tabela to proponowany porządek czytania przez równoległe tory.

| Stream | Temat             | Łańcuch                                          | Uwaga                                                                          |
|--------|-------------------|--------------------------------------------------|--------------------------------------------------------------------------------|
| A      | Ścieżka must-have | `F-01` → `S-01` → `S-02` → `S-03` → `S-04`     | Jedyna ścieżka do gwiazdy przewodniej; cel `speed` nakazuje skupić tu całą uwagę. |
| B      | AI concierge      | `S-05`                                           | Odgałęzienie z `S-02`; może być realizowane równolegle z `S-03`/`S-04`.       |
| C      | Design & polish   | `D-00` (standalone) → `D-01` → `D-02` (+`D-02a`) → `D-03` → `D-04` → `D-05` | D-00 brak prererekwizytów — realizuj kiedy; D-01+ czekaj na S-04; D-02a może biec równolegle z D-01 bo dotyka tylko DB i mock UI. D-05 zależy od D-04 (nawigacja) i logicznie od S-05 (AI concierge). |

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
- **Status:** done

### S-02: Dostęp gościa przez dwuetapowy QR i panel usług

- **Outcome:** gość może zeskanować QR z recepcji (wejście do trybu weryfikacji), zeskanować QR fizyczny w pokoju (odblokowanie pełnego dostępu) i zobaczyć panel z listą usług included, dostępnych add-onów oraz statusem zamówionych add-onów (badge: oczekuje / zrealizowane); wygasły token wyświetla czytelny komunikat błędu — nie blank screen.
- **Change ID:** `guest-qr-auth-panel`
- **PRD refs:** FR-002, FR-003, FR-004, FR-006, FR-007, FR-010, US-01
- **Prerequisites:** S-01, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Czy skan QR pokoju musi nastąpić w tej samej sesji przeglądarki co skan tokenu? Owner: user. Block: no (można przyjąć: tak, ta sama sesja / localStorage — najprostsze MVP).
- **Risk:** Stateless guest access bez Supabase Auth session — tokenizacja własna po stronie Workers cookies lub localStorage; błąd tutaj blokuje całą ścieżkę gościa i jest prererekwizytem każdego kolejnego slice'a.
- **Status:** done

### S-03: Gość składa i anuluje zamówienie add-on

- **Outcome:** gość może zamówić add-on z panelu i zobaczyć status "oczekuje" z wizualnym badge'em; może anulować zamówienie inline dopóki recepcja go nie oznaczyła jako zrealizowane; panel gościa odpytuje serwer co 20s gdy jest co najmniej jedno pending zamówienie (bez przeładowania strony); recepcja widzi licznik pending orders jako badge w nav i kartę na dashboardzie.
- **Change ID:** `guest-order-addon`
- **PRD refs:** FR-008, FR-009, US-02
- **Prerequisites:** S-02, F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** —
- **Note:** E-mail do recepcji permanently out of scope dla tego slice — zastąpiony badge'em w panelu staff. Polling co 20s po stronie gościa obsługuje widoczność zmian statusu bez ręcznego odświeżania.
- **Status:** done

### S-04: Panel recepcji — lista zamówień i obsługa

- **Outcome:** personel recepcji widzi listę aktywnych zamówień gości auto-odświeżaną co najwyżej co 10 sekund, badge z liczbą nieobsłużonych zamówień i może oznaczyć zamówienie jako zrealizowane lub anulowane; zmiana statusu propaguje się do panelu gościa.
- **Change ID:** `reception-order-panel`
- **PRD refs:** FR-012, FR-013, FR-015, US-03
- **Prerequisites:** S-03, F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gwiazda przewodnia — zamknięcie pętli self-service; polling co 10s jest prosty technicznie. Propagacja statusu do panelu gościa jest rozwiązana przez polling co 20s zaimplementowany w S-03 — bez cache-invalidation, bez zależności od S-04.
- **Status:** done

### S-05: AI concierge — rekomendacje domenowe

- **Outcome:** gość może zadać pytanie AI concierge z poziomu panelu gościa i otrzymać konkretną odpowiedź specyficzną dla hotelu (nie generyczną), opartą na hotelowym kontekście przekazanym w system prompt (nazwa hotelu, adres, menu, atrakcje lokalne, restauracje).
- **Change ID:** `ai-concierge`
- **PRD refs:** FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** Jak dostarczony jest kontekst hotelowy do AI concierge — hardcoded system prompt, plik JSON config, czy inne źródło? Owner: user. Block: no (PRD §Open Questions #2: można zacząć od hardcoded prompt z danymi pilotażowego hotelu).
- **Risk:** Jakość odpowiedzi zależy całkowicie od jakości danych hotelowych w prompcie; odpowiedź generyczna to failure wg PRD NFR. OpenAI SDK na Workers — dodatkowy narzut CPU (Workers Paid mandatory per `context/foundation/infrastructure.md`).
- **Status:** done

## Design

### D-00: Publiczny landing page

- **Outcome:** niezalogowany użytkownik widzi minimalistyczną stronę główną z nazwą aplikacji „RoomPilot", hotelową grafiką tłową (Unsplash `photo-1445019980597-93fa8acb246c`) i panelem logowania inline — bez potrzeby przejścia na `/auth/signin`; po zalogowaniu redirect na `/dashboard`; branding „10x Astro Starter" usunięty z całej aplikacji (`Layout.astro` domyślny tytuł, `Welcome.astro` komponent).
- **Change ID:** `public-landing-page`
- **PRD refs:** —
- **Prerequisites:** brak — w pełni niezależny od pozostałych slice'y
- **Parallel with:** wszystkie istniejące slice'y
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niski — zmiany wyłącznie frontendowe; `SignInForm` jest reużywany bez zmian; trasa `/auth/signin` pozostaje dostępna bezpośrednio.
- **Scope:**
  1. Usunięcie `Welcome.astro`, zastąpienie komponentem `Landing.astro` (lub `LandingPage.astro`)
  2. Tło: `background-image` URL Unsplash + ciemny overlay dla kontrastu
  3. Panel logowania: reużycie `src/components/auth/SignInForm` z `client:load`
  4. `Layout.astro` — domyślny tytuł: `"RoomPilot"`
  5. `src/pages/index.astro` — wskazuje na nowy komponent
- **Status:** done

### D-01: Design token foundation

- **Outcome:** spójny design system dostępny w całym projekcie — paleta marokańskiego boutique hotel (terakota, indygo, kremowe tło, złote akcenty), typografia (sans-serif body + opcjonalny serif w nagłówkach), spacing scale i border-radius skonfigurowane jako Tailwind CSS variables i przepisane tokeny shadcn; żaden komponent nie używa już domyślnych kolorów shadcn.
- **Change ID:** `design-token-foundation`
- **PRD refs:** —
- **Prerequisites:** S-04
- **Parallel with:** D-02a
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zmiana tokenów shadcn może nadpisać style komponentów które działają — warto zrobić visual snapshot przed i po.
- **Status:** done

### D-02a: Pole image_url w tabeli services (side task)

- **Outcome:** tabela `services` w Supabase ma opcjonalne pole `image_url` (nullable text/varchar) - trzeba dodać; API i typy TypeScript są zaktualizowane; UI panelu gościa wyświetla zdjęcie gdy pole jest wypełnione, a placeholder (mock marokańska tekstura lub gradient) gdy puste — bez błędów i bez pustych ramek.
- **Change ID:** `services-image-field`
- **PRD refs:** FR-006
- **Prerequisites:** F-01
- **Parallel with:** D-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niski — pole nullable, placeholder zawsze działa jako fallback; migracja niedestrukcyjna.
- **Status:** done

### D-02: Panel gościa — mobile-first redesign

- **Outcome:** gość widzi panel usług jako responsywny grid 2 kolumny na mobile — każda karta ma zdjęcie (lub placeholder) u góry, poniżej nazwę usługi i status badge; nawigacja i flow zamówienia są wygodne kciukiem (tap targets ≥ 44px); całość wizualnie spójna z estetyką ciepłego boutique hotel: kremowe tło, terakota jako kolor akcji, indygo dla statusów, opcjonalny serif w nagłówkach sekcji, ux na poziomie profesjonalnego e-commerce.
- **Change ID:** `guest-panel-redesign`
- **PRD refs:** FR-006, FR-007, FR-010
- **Prerequisites:** D-01, D-02a
- **Parallel with:** D-03
- **Blockers:** —
- **Unknowns:** Czy mock zdjęcia to lokalne assety czy zewnętrzne URL (np. Unsplash)? Owner: user. Block: no (można zacząć od lokalnych placeholderów, podmienić później).
- **Risk:** Grid 2-kolumnowy na bardzo małych ekranach (< 360px) może wymagać breakpointu fallback do 1 kolumny.
- **Status:** done

### D-03: Panel recepcji — desktop polish

- **Outcome:** personel recepcji widzi zamówienia w czytelnym layoucie zoptymalizowanym pod desktop/tablet — pending badge w nawigacji jest natychmiast widoczny, akcje "zrealizuj"/"anuluj" są jednoznaczne i nie wymagają potwierdzenia modala dla szybkiej obsługi; całość spójna z tokenami z D-01 (nie musi być tak "hotelowa" jak panel gościa — priorytet to czytelność operacyjna).
- **Change ID:** `reception-panel-polish`
- **PRD refs:** FR-012, FR-013, FR-015
- **Prerequisites:** D-01
- **Parallel with:** D-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niski — zmiany wyłącznie wizualne, logika zamówień niezmieniona.
- **Status:** done

### D-04: Dashboard mobile — hamburger menu

- **Outcome:** personel recepcji na urządzeniu mobilnym widzi topbar z ikoną hamburgera; po jej kliknięciu wysuwa się pionowy panel z pełną nawigacją (Generate Token, Orders z pending badge, Sign Out) i backdrop-overlay; menu zamyka się po wyborze opcji lub kliknięciu w overlay; desktop topbar pozostaje bez zmian; wszystkie tap targets ≥ 44px.
- **Change ID:** `dashboard-mobile-nav`
- **PRD refs:** —
- **Prerequisites:** D-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niski — zmiany tylko w `StaffLayout.astro` i nowy komponent `MobileNav.tsx`; stan open/closed wymaga React island (`client:load`) lub Astro `<script>`; pending badge musi być widoczny w obu trybach nav (desktop i mobile).
- **Scope:**
  1. `src/layouts/StaffLayout.astro` — hamburger icon `md:hidden`, desktop nav `hidden md:flex`
  2. Nowy `src/components/staff/MobileNav.tsx` — stan open/close, overlay, slide-in panel; nasłuchuje `pending-count-update` CustomEvent (tak jak desktop badge)
  3. Tap targets ≥ 44px dla wszystkich pozycji menu
- **Status:** done

### D-05: Dashboard AI Concierge — panel konfiguracji hotelu i alerty

- **Outcome:** personel recepcji widzi w nawigacji dashboardu pozycję „AI Concierge"; po wejściu widzi dwa taby: (1) „Dane o hotelu" — formularz z polami hotelowymi (nazwa, adres, godziny check-in/out, atrakcje lokalne, restauracje, addony, zasady domu, ceny) wypełniony aktualnymi danymi z `hotel-context.ts`; przycisk „Zapisz" istnieje i nie jest zablokowany, ale zapis jest fake door (localStorage lub toast „Saved"); (2) „Alerty AI Concierge" — pusty placeholder „No alerts yet" z ikoną; gotowy strukturalnie na przyszłe dane.
- **Change ID:** `dashboard-ai-concierge`
- **PRD refs:** FR-011
- **Prerequisites:** D-04 (nawigacja), S-05 (AI concierge dla gościa musi istnieć — formularz to UI nad `hotel-context.ts`)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niski — zmiany wyłącznie frontendowe; `hotel-context.ts` nie jest modyfikowany; brak backendu w tym etapie. Tabs wymaga `npx shadcn@latest add tabs` (Radix-based).
- **Scope:**
  1. `src/pages/dashboard/ai-concierge.astro` — nowa chroniona strona, layout: StaffLayout
  2. `src/components/staff/AiConciergePanel.tsx` — React island (`client:load`), shadcn Tabs: tab „Dane o hotelu" + tab „Alerty AI Concierge"
  3. `src/components/staff/HotelDataForm.tsx` — formularz z polami: nazwa, adres, godziny check-in/out (FormField reuse), textarea: atrakcje, restauracje, addony, ceny, zasady; przycisk „Zapisz" (fake door); opcjonalnie: „Podgląd system prompt" (AlertDialog + `buildSystemPrompt` z `src/lib/hotel-context.ts`)
  4. `src/components/staff/AlertsPanel.tsx` — placeholder „No alerts yet"
  5. `src/layouts/StaffLayout.astro` — dodaj link „AI Concierge" do nawigacji desktop + pozycję w `MobileNav.tsx`
- **Reuse:** `FormField` (`src/components/auth/FormField.tsx`), `Button` (`src/components/ui/button.tsx`), `AlertDialog` (`src/components/ui/alert-dialog.tsx`), `buildSystemPrompt` + `hotelContext` (`src/lib/hotel-context.ts`), `TokenGeneratorForm` jako wzorzec layoutu (`src/components/staff/TokenGeneratorForm.tsx`)
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
| D-00  | public-landing-page     | Landing page — RoomPilot branding, grafika, login inline | yes | Run `/10x-plan public-landing-page`           |
| D-01  | design-token-foundation | Design system — paleta, typografia, Tailwind tokens     | yes | Run `/10x-plan design-token-foundation`       |
| D-02a | services-image-field    | DB: pole image_url w services + placeholder w UI        | yes | Run `/10x-plan services-image-field`          |
| D-02  | guest-panel-redesign    | Panel gościa — mobile-first redesign boutique           | no  | Wymaga D-01, D-02a                            |
| D-03  | reception-panel-polish  | Panel recepcji — desktop polish                         | no  | Wymaga D-01; równolegle z D-02                |
| D-04  | dashboard-mobile-nav    | Dashboard — hamburger menu dla mobile                   | no  | Wymaga D-03                                   |
| D-05  | dashboard-ai-concierge  | Dashboard — sekcja AI Concierge (dane hotelu + alerty)  | no  | Wymaga D-04, S-05                             |

## Open Roadmap Questions

1. **Źródło danych do dashboardu add-onów** — system śledzi tylko add-ony zamówione przez aplikację; usługi używane poza nią (basen, sauna) nie będą widoczne w dashboardzie. Owner: user. Block: żaden slice (decyzja podjęta w PRD §Open Questions #1).
2. **Dostarczanie kontekstu hotelowego do AI concierge** — dane hotelowe (menu, atrakcje, restauracje) muszą skądś pochodzić. Owner: user. Block: S-05 (ale nie blokuje planowania — można zacząć od hardcoded prompt; per PRD §Open Questions #2). **Odpowiedź: D-05 tworzy staff UI nad `hotel-context.ts`; na razie fake door (localStorage), docelowo Supabase.**
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
- **S-01: Logowanie personelu i generowanie tokenów QR gościa** — Implemented 2026-05-29 → `context/changes/staff-auth-qr-generation/`. Lesson: —.
- **S-02: Dostęp gościa przez dwuetapowy QR i panel usług** — Implemented 2026-05-31 → `context/changes/guest-qr-auth-panel/`. Lesson: —.
- **S-03: Gość składa i anuluje zamówienie add-on** — Implemented 2026-06-01 → `context/changes/guest-order-addon/`. Lesson: —.
- **S-04: Panel recepcji — lista zamówień i obsługa** — Implemented 2026-06-01 → `context/changes/reception-order-panel/`. Lesson: —. North star ✓.
- **S-05: AI concierge — rekomendacje domenowe** — Implemented 2026-06-01 → `context/changes/ai-concierge/`. Lesson: —.
- **D-00: Publiczny landing page** — Implemented 2026-06-03 → `context/changes/public-landing-page/`. Lesson: —.
- **D-01: Design token foundation** — Implemented 2026-06-02 → `context/changes/design-token-foundation/`. Lesson: —.
- **D-02a: Pole image_url w services** — Implemented 2026-06-02 → `context/changes/services-image-field/`. Lesson: —.
- **D-02: Panel gościa — mobile-first redesign** — Implemented 2026-06-02 → `context/changes/guest-panel-redesign/`. Lesson: —.
- **D-03: Panel recepcji — desktop polish** — Implemented 2026-06-03 (wchłonięty w D-01/D-04). Lesson: —.
- **D-04: Dashboard mobile — hamburger menu** — Implemented 2026-06-03 → `context/changes/dashboard-mobile-nav/`. Lesson: —.

---
title: Destylacja domeny — RoomPilot
created: 2026-06-22
type: domain-distillation
---

# Destylacja domeny — RoomPilot

> Produktem tego dokumentu jest **mapa domeny**, nie kod. Nazwy bytów, agregatów i reguł
> zostały **odkryte** z dokumentów źródłowych oraz kodu — nie założone z góry.
> Każde pojęcie/regułę poparto cytatem `plik:linia`.

## KROK 0 — Kontekst projektu

### Źródła wiedzy domenowej (odkryte)
- **Dokumenty wymagań:** `context/foundation/prd.md` (PRD v1, greenfield), `context/foundation/shape-notes.md`
  (notatki dyskoveryjne, projekt jeszcze pod roboczą nazwą „HotelGuest"), `context/foundation/roadmap.md`
  (12 slice'ów, wszystkie `done` poza D-05 `proposed`), `context/foundation/tech-stack.md`, `README.md`.
- **Rozszerzona narracja / historia:** roadmap.md §Done (`roadmap.md:283-296`) pełni rolę dziennika zmian —
  każdy slice ma datę implementacji i ścieżkę archiwum.
- **Ograniczenie:** brak osobnego glosariusza domenowego; Ubiquitous Language poniżej zrekonstruowano
  z PRD + nazw w kodzie (tabele, kolumny, typy, trasy API).

### Stack i miejsce logiki biznesowej
- **Astro 6 SSR + React 19 islands + Supabase (Postgres) + Cloudflare Workers** (`CLAUDE.md`, `tech-stack.md`).
- Logika biznesowa żyje w **trzech warstwach**, bez wydzielonej warstwy domenowej:
  - **Trasy API** (`src/pages/api/**`) — walidacja zod + reguły zamówień/tokenów (np. `src/pages/api/guest/orders/index.ts`).
  - **Strony SSR `.astro`** (`src/pages/guest/*.astro`, `src/pages/dashboard*.astro`) — kontrola dostępu,
    odczyty, redirecty (np. `src/pages/guest/panel.astro:9-43`).
  - **Helpery `src/lib/`** — `qr-auth.ts` (jedyny realny „serwis domenowy"), `hotel-context.ts`, `supabase.ts`.
  - **Persystencja + reguły bazowe:** `supabase/migrations/**` (schema, CHECK-i, RLS, seed).
- **Brak warstwy domenowej/agregatów w kodzie** — reguły biznesowe są rozproszone między CHECK-ami SQL,
  trasami API i stronami `.astro`. To jest centralny wniosek dokumentu (patrz KROK 4/5).

---

## KROK 1 — Ubiquitous Language

| Pojęcie | Definicja (ze źródła) | Cytat źródłowy | Życie w kodzie |
|---|---|---|---|
| **Gość** (`guest`) | Bezstanowy użytkownik bez konta; dostęp tylko przez token QR; read/write wyłącznie własnych zamówień i pakietu | `prd.md:153` | Rola dorozumiana przez `guestToken` w `src/middleware.ts:26-43`, `src/env.d.ts:1-7` |
| **Personel recepcji** (`staff`) | Pracownik z kontem e-mail+hasło; generuje tokeny, zarządza zamówieniami wszystkich gości; własne konto → audyt | `prd.md:149-154` | `app_metadata.staff_role === "staff"` w `src/pages/api/staff/generate-token.ts:26` |
| **Token gościa** (Guest Token) | Rekord sesji pobytu: imię, pokój, pakiet, daty; publiczny, ważny check-in→check-out | `prd.md:144-147` | tabela `guest_tokens` (`supabase/migrations/20260528000001_schema.sql:40-51`); typ `src/types.ts:42-92` |
| **Wartość tokenu** (`token_value`) | Sekretny UUID skanowany z wydruku recepcji (skan #1) | `prd.md:89` (FR-002) | `token_value uuid UNIQUE` (`...schema.sql:42`); użycie w `src/pages/guest/verify.astro:28` |
| **QR kod pokoju** (Room QR) | Fizyczny kod w pokoju potwierdzający obecność (skan #2) | `prd.md:90-91` (FR-003) | tabela `room_qr_codes` (`...schema.sql:31-37`); trasa `src/pages/qr/room/[qr_token].astro` |
| **Pakiet** (Package) | Zestaw usług przypisany gościowi; definiuje co `included`, a co `addon` | `prd.md:134-135` | tabela `packages` + `package_services` (`...schema.sql:13-28`); seed Basic/Standard/Premium (`...20260528000003_seed.sql:22-26`) |
| **Usługa** (Service) | Pozycja katalogu hotelu (WiFi, śniadanie, SPA…) z kategorią i ceną | `prd.md:97-98` | tabela `services` (`...schema.sql:2-10`); seed 8 usług (`...seed.sql:8-17`) |
| **Typ przynależności** (`inclusion_type`) | Klasyfikacja usługi w pakiecie: `included` (aktywna, bez akcji) lub `addon` (można zamówić) | `prd.md:135` | `CHECK (inclusion_type IN ('included','addon'))` (`...schema.sql:26`) |
| **Add-on** | Usługa płatna, którą gość może samodzielnie zamówić | `prd.md:98` (FR-007) | filtr `inclusion_type = 'addon'` w `src/pages/api/guest/orders/index.ts:64-74` |
| **Zamówienie** (Order) | Żądanie usługi przez gościa; cykl: oczekuje → zrealizowane / anulowane | `prd.md:136` | tabela `orders` (`...schema.sql:54-62`); typ `src/types.ts:93-137` |
| **Status zamówienia** | `pending` / `fulfilled` / `cancelled` | `prd.md:47`, `prd.md:67` | `CHECK (status IN ('pending','fulfilled','cancelled'))` (`...schema.sql:58`) |
| **Dashboard zasobów** | Widok pakietu gościa: co included, jakie add-ony + status zamówionych (badge) | `prd.md:106` (FR-010) | `src/pages/guest/panel.astro:60-89`, `src/components/guest/AddonList.tsx` |
| **AI concierge** | Warstwa uzupełniająca: odpowiedzi domenowe specyficzne dla hotelu; nie część ścieżki zamówienia | `prd.md:138` | `src/pages/api/guest/concierge.ts`, `src/lib/hotel-context.ts` |
| **Pending guest** (stan weryfikacji) | Stan pośredni po skanie #1, przed skanem #2 („Step 2 of 2") | `prd.md:59` (US-01 AC) | cookie `pending_guest` (JWT typu `pending_guest`) — `src/pages/guest/verify.astro:39-50`, `src/lib/qr-auth.ts:30` |
| **Sesja gościa** (`guest_session`) | Pełny dostęp po skanie #2; JWT wygasa z datą check-out | `prd.md:146-147` | cookie `guest_session` — `src/pages/qr/room/[qr_token].astro:37-43`, `src/middleware.ts:26-43` |
| **Licznik pending** (badge) | Liczba nieobsłużonych zamówień w nawigacji recepcji | `prd.md:120` (FR-015) | `pending-count-update` CustomEvent — `src/components/staff/OrderList.tsx:63-65` |
| **Kontekst hotelowy** | Dane hotelu (nazwa, adres, atrakcje, restauracje) wstrzykiwane do promptu AI | `prd.md:127`, `prd.md:169` | `hotelContext` + `buildSystemPrompt` w `src/lib/hotel-context.ts:1-65` |
| **Audyt „kto zrealizował"** | Możliwość ustalenia, który pracownik oznaczył zamówienie | `prd.md:150`, `shape-notes.md:48` | **BRAK w kodzie** — `orders` nie ma kolumny `fulfilled_by`/`updated_by` (`...schema.sql:54-62`) |
| **Pakiet bezpłatny / płatny** | „pakiet bezpłatny (included)" vs „usługi płatne (add-ons)" | `prd.md:97-98` | Modelowane przez `inclusion_type`, nie przez osobny atrybut „bezpłatny" |

---

## KROK 2 — Klasyfikacja subdomen

| Obszar / pojęcie | Kategoria | Uzasadnienie (odwołanie do celów produktu) |
|---|---|---|
| **Dwuetapowy dostęp QR gościa** (token recepcji + QR pokoju, wygasanie z check-out) | **Core** | To główna przewaga: „lekka, niezależna warstwa dostępu… nie wymaga integracji z PMS" (`prd.md:22`). Success Criteria Primary #1: gość przechodzi weryfikację bez personelu (`prd.md:37`). Drugi skan = kluczowe zabezpieczenie obecności (`prd.md:91`). |
| **Ścieżka zamówienia add-on** (złożenie → oczekuje → realizacja/anulowanie → widoczny status) | **Core** | „Dwa współdziałające mechanizmy tworzą rdzeń produktu" (`prd.md:134`). North star S-04 = domknięcie pętli self-service (`roadmap.md:24`). Sens produktu: zamówienie bez kontaktu z recepcją. |
| **Przypisanie pakietu i klasyfikacja included/addon** | **Core** | Drugi z „dwóch mechanizmów rdzenia" (`prd.md:135`); decyduje co gość widzi i co może zamówić. |
| **Panel recepcji — lista + obsługa zamówień** | **Supporting** | „Narzędzie operacyjne — bez niego system nie działa, ale wartość produktu dostarcza gość" (`prd.md:32`). Niezbędne, lecz nie różnicujące. |
| **AI concierge** | **Supporting** | „Warstwa uzupełniająca… nie jest częścią ścieżki zamówienia" (`prd.md:138`). Success Criteria Secondary (`prd.md:43`), nie Primary. |
| **Dashboard zasobów** | **Supporting** | Wspiera rdzeń (widoczność pakietu/statusów), ale Open Question #1 ogranicza jego zakres do zamówień z appki (`prd.md:168`). |
| **Uwierzytelnianie staff (e-mail+hasło)** | **Generic** | Standardowy Supabase Auth; „Supabase ships auth out of the box" (`tech-stack.md:24`). Brak logiki specyficznej dla domeny. |
| **Katalog usług/pakietów (CRUD)** | **Generic** | Dane statyczne, seedowane; CRUD świadomie poza MVP (`prd.md:159` Non-Goals). |
| **Generowanie obrazka QR / druk** | **Generic** | Mechanika techniczna, nie reguła domenowa (FR-014, `prd.md:119`). |

**Rdzeń (jedno zdanie):** RoomPilot to **bezstanowy, dwuetapowy dostęp gościa przez QR** połączony z
**ścieżką zamówienia add-on z widocznym śladem statusu** — i to te dwa agregaty muszą być chronione najmocniej.

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

### A. `GuestToken` (Token / Sesja pobytu) — root: `guest_tokens`
| Niezmiennik | Cytat źródłowy | Status egzekucji w kodzie |
|---|---|---|
| Token wygasa najpóźniej z datą check-out — brak dostępu po wymeldowaniu | `prd.md:46`, `prd.md:92` | **Egzekwowany (rozproszony, defense-in-depth):** `qr-auth.ts:58-62` (porównanie + exp JWT), `verify.astro:35`, `panel.astro:30-33`, `middleware.ts:28-37` (weryfikacja exp). |
| Pełny dostęp dopiero po potwierdzeniu obecności: pokój skanowanego QR == pokój tokenu | `prd.md:90-91` (FR-003) | **Egzekwowany:** `qr-auth.ts:54-56` (`guestToken.room_number !== room.room_number → invalid`). |
| `check_out_date > check_in_date` | `prd.md:144` (daty pobytu) | **Egzekwowany w bazie:** `CHECK (check_out_date > check_in_date)` (`...schema.sql:50`) + zod refine (`generate-token.ts:18-20`). |
| Gość widzi/zmienia wyłącznie własne dane (izolacja między gośćmi) | `prd.md:46`, `prd.md:153` | **Egzekwowany tylko w aplikacji, NIE w RLS:** trasy gościa używają service-role (omija RLS — `supabase.ts:6-19`) i ręcznie filtrują `.eq("guest_token_id", tokenId)` (`api/guest/orders/index.ts:28`, `[id].ts:30`). |

### B. `Order` (Zamówienie) — root: `orders`
| Niezmiennik | Cytat źródłowy | Status egzekucji w kodzie |
|---|---|---|
| Status ∈ {pending, fulfilled, cancelled} | `prd.md:47` | **Egzekwowany w bazie:** `CHECK` (`...schema.sql:58`) + zod enum (`staff/orders/[id].ts:9-11`). |
| Gość może anulować **tylko dopóki** zamówienie jest `pending` (przed realizacją przez staff) | `prd.md:71`, `prd.md:102` (FR-009) | **Egzekwowany:** guest PATCH sprawdza `status !== "pending" → 409` i `update(...).eq("status","pending")` (`api/guest/orders/[id].ts:37-45`). |
| Zamówienie nigdy nie znika bez śladu — każda zmiana statusu jest widoczna w panelu | `prd.md:47`, `prd.md:70` | **Częściowo / NIE po stronie staff:** rekord nie jest kasowany (UPDATE statusu), ale panel recepcji filtruje `.eq("status","pending")` (`dashboard.astro:13`, `api/staff/orders/index.ts:19`) i po realizacji usuwa kartę z widoku (`OrderList.tsx:78`) — brak widoku historii. Gość widzi zmianę (badge). |
| Można zamówić tylko usługę będącą `addon` w pakiecie gościa | `prd.md:135` | **Egzekwowany:** walidacja `package_services … inclusion_type='addon'` przed insertem (`api/guest/orders/index.ts:64-74`). |
| Brak duplikatu aktywnego (pending) zamówienia tej samej usługi | dorozumiane (UX/„licznik nowych") | **Egzekwowany w aplikacji, nie w bazie:** sprawdzenie istniejącego pending → 409 (`api/guest/orders/index.ts:76-86`); brak unikalnego indeksu częściowego → możliwy wyścig. |
| Przejście pending→fulfilled/cancelled tylko z `pending` (idempotencja realizacji) | `prd.md:108` (US-03) | **Egzekwowany:** staff `update(...).eq("status","pending")`, PGRST116 → 409 (`api/staff/orders/[id].ts:42-55`). |

### C. `Package` (Pakiet + klasyfikacja usług) — root: `packages` / `package_services`
| Niezmiennik | Cytat źródłowy | Status egzekucji w kodzie |
|---|---|---|
| Każda usługa w pakiecie ma dokładnie jeden typ: included albo addon | `prd.md:135` | **Egzekwowany w bazie:** `CHECK inclusion_type IN (...)` + `UNIQUE(package_id, service_id)` (`...schema.sql:26-27`). |
| Usługi `included` są widoczne, ale bez akcji zamówienia | `prd.md:135` | **Egzekwowany w UI:** `ServiceCard variant="included"` bez przycisku (`panel.astro:68-77`). |

### D. `StaffActor` (audyt operacji) — root: `auth.users` (poza public)
| Niezmiennik | Cytat źródłowy | Status egzekucji w kodzie |
|---|---|---|
| Każdy pracownik ma własne konto → możliwy audyt, kto zrealizował zamówienie | `prd.md:150`, `shape-notes.md:48` | **Ignorowany / zadeklarowany bez realizacji:** `orders` nie zapisuje wykonawcy zmiany statusu; `staff/orders/[id].ts:42-48` aktualizuje status bez `updated_by`. Audyt niemożliwy. |

---

## KROK 4 — Rozjazdy MODEL vs KOD

| # | Dokument mówi (X) | Kod robi (Y) | Dowód (plik:linia) |
|---|---|---|---|
| 1 | AI concierge dodany przez **Anthropic SDK** | Użyto **OpenAI SDK + `gpt-4o-mini`** | doc: `tech-stack.md:24`; kod: `src/pages/api/guest/concierge.ts:4,46,50` (`import OpenAI`, `model: "gpt-4o-mini"`), `OPENAI_API_KEY` w `concierge.ts:3` |
| 2 | „Możliwy audyt **kto** oznaczył zamówienie jako zrealizowane" | Status zmieniany bez zapisu wykonawcy — brak kolumny `fulfilled_by`/`updated_by` | doc: `prd.md:150`; kod: `...schema.sql:54-62`, `api/staff/orders/[id].ts:42-48` |
| 3 | „Zamówienie nigdy nie znika bez śladu — **każda zmiana statusu jest widoczna w panelu**" | Panel recepcji pokazuje wyłącznie `pending`; po realizacji karta znika, brak widoku historii | doc: `prd.md:47,70`; kod: `dashboard.astro:13`, `api/staff/orders/index.ts:19`, `OrderList.tsx:78` |
| 4 | Izolacja gościa: „brak dostępu do danych innego gościa" oczekiwana jako gwarancja systemu; RLS „per-operation, per-role" (`CLAUDE.md`) | Trasy gościa działają na **service-role (omija RLS)**; izolacja wyłącznie przez ręczny filtr w aplikacji | doc: `prd.md:46`, `CLAUDE.md` (konwencja RLS); kod: `supabase.ts:6-19`, `api/guest/orders/index.ts:28`, `[id].ts:30` |
| 5 | „**Brak self-registration** — konta staff tworzone przez administratora" | Publiczny endpoint `signup` tworzy konta bez ograniczeń i bez `staff_role` | doc: `prd.md:150`; kod: `src/pages/api/auth/signup.ts:4-19`, `src/pages/auth/signup.astro` |
| 6 | Rola `staff` chroni „panel recepcji: generowanie tokenów, podgląd i zarządzanie zamówieniami" | Tylko `generate-token` sprawdza `staff_role`; **odczyt/aktualizacja zamówień i `/dashboard` sprawdzają jedynie zalogowanie**, nie rolę | doc: `prd.md:154`; kod: ma check `generate-token.ts:26`; brak checku `api/staff/orders/index.ts:7-9`, `api/staff/orders/[id].ts:14-16`, `middleware.ts:20-24` |
| 7 | „Zamówienie pojawia się w panelu recepcji w ciągu **60 s**" / lista świeża **≤10 s** | Recepcja: polling 10 s ✓. **Brak** mechanizmu pokazującego pojawienie ≤60 s niezależnie od cyklu staff — opiera się na tym samym 10 s pollingu (wystarcza, ale 60 s nie jest osobno egzekwowane) | doc: `prd.md:124-125`; kod: `OrderList.tsx:54-61` (10 000 ms) |
| 8 | Kontekst hotelowy dostarczany docelowo z konfiguracji/bazy; D-05 ma być UI nad nim | `hotel-context.ts` jest **hardcoded**; staff UI (D-05) `proposed`, niezaimplementowane | doc: `prd.md:169`, `roadmap.md:44,270`; kod: `src/lib/hotel-context.ts:1-38` |
| 9 | Nazwa produktu **RoomPilot** | Notatki dyskoveryjne i część metadanych wciąż mówią **HotelGuest** | doc: `roadmap.md:13` vs `shape-notes.md:1` (`project: HotelGuest`), `prd.md:22` („HotelGuest wchodzi w tę lukę") — rozjazd nazewniczy w samych dokumentach |

---

## KROK 5 — Ranking refaktoru

Szeregowanie wg **wartości** (jak rdzeniowy niezmiennik) × **ryzyka** (jak słabo egzekwowany dziś).

| Ranga | Agregat / niezmiennik | Wartość | Ryzyko (stan dziś) | Wynik |
|---|---|---|---|---|
| **#1** | **Izolacja gościa w `GuestToken`/`Order`** (rozjazd #4 + #6) | Rdzeniowa gwarancja bezpieczeństwa (`prd.md:46`) | Wysokie: service-role omija RLS; jedyna bariera to ręczny `.eq(guest_token_id)`. Trasy staff nie sprawdzają roli → każdy zalogowany użytkownik (np. z `signup`) czyta zamówienia wszystkich gości | **Krytyczny** |
| **#2** | **`Order` jako agregat z jawnymi przejściami stanu i śladem** (rozjazdy #2, #3) | Core — to North star pętli self-service (`roadmap.md:24`); guardrail „nic nie znika bez śladu" (`prd.md:47`) | Średnie/wysokie: reguły przejść rozproszone w 3 trasach; brak wykonawcy zmiany (audyt niemożliwy), brak widoku historii w panelu staff | **Wysoki** |
| **#3** | **Granica roli `staff`** (rozjazd #5, #6) | Wspiera rdzeń; chroni dane operacyjne | Średnie: publiczny signup + brak checku roli na zarządzaniu zamówieniami i `/dashboard` | **Wysoki** |
| #4 | `GuestToken` — wygasanie i obecność | Core | Niskie: solidnie egzekwowane w wielu warstwach | Niski |
| #5 | `Package` klasyfikacja included/addon | Core | Niskie: dobrze zabezpieczone w bazie + UI | Niski |

### Rekomendacja #1 do refaktoru
**Skonsolidować kontrolę dostępu wokół agregatu `GuestToken`/`Order` i wymusić granicę roli `staff`.**
Dlaczego: najsłabiej egzekwowany niezmiennik (`prd.md:46` — izolacja gościa) chroni najbardziej rdzeniowy
zasób, a obecnie zależy wyłącznie od poprawności ręcznych filtrów `.eq("guest_token_id", …)` na kliencie
service-role omijającym RLS (`supabase.ts:6-19`, `api/guest/orders/*`). Jednocześnie trasy staff
(`api/staff/orders/*`, `/dashboard`) nie weryfikują `staff_role`, a publiczny `signup` (`api/auth/signup.ts`)
tworzy konta — łącznie pojedyncza pomyłka w filtrze lub jedno samodzielnie założone konto otwiera dostęp do
danych wszystkich gości. To jednocześnie najwyższa wartość (rdzeń + guardrail bezpieczeństwa) i najwyższe
ryzyko (brak warstwy egzekwującej poza ręcznym kodem). Refaktor: wydzielić moduł autoryzacji
(guest-scope + staff-role guard), przenieść regułę „pending-only" i przejścia statusu do jednego miejsca
modelujqcego agregat `Order`, oraz dodać kolumnę `updated_by`, by odblokować deklarowany audyt.

---

## Podsumowanie

Artefakt mapuje domenę RoomPilot wyłącznie z dokumentów (`prd.md`, `shape-notes.md`, `roadmap.md`,
`tech-stack.md`) i kodu, bez zakładania nazw z góry. Odkryty Ubiquitous Language obejmuje ~20 pojęć,
z których dwa stanowią rdzeń: **dwuetapowy dostęp gościa przez QR** (`GuestToken`) oraz **ścieżka zamówienia
add-on z widocznym śladem statusu** (`Order`); panel recepcji i AI concierge to subdomeny wspierające, a auth
staff i katalog usług — generyczne. Wskazano czterech kandydatów na agregaty (`GuestToken`, `Order`,
`Package`, `StaffActor`) wraz z niezmiennikami i statusem ich egzekucji — część twardo trzymana w bazie
(CHECK-i, przejścia pending-only), część tylko w aplikacji. Najcenniejsza sekcja to lista 9 rozjazdów
model–kod: AI używa OpenAI zamiast deklarowanego Anthropic, audyt „kto zrealizował" jest zadeklarowany lecz
nieobecny w schemacie, panel recepcji łamie guardrail „nic nie znika bez śladu", a izolacja gościa opiera się
na ręcznych filtrach przy service-role omijającym RLS. Najważniejszy wniosek: **#1 priorytet refaktoru to
konsolidacja kontroli dostępu wokół `GuestToken`/`Order` i wymuszenie roli `staff`** — to najsłabiej
egzekwowany, a najbardziej rdzeniowy i wrażliwy bezpiecznościowo niezmiennik produktu.

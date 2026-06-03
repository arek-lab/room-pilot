# Guest Panel Redesign — Plan Brief

> Full plan: `context/changes/guest-panel-redesign/plan.md`

## What & Why

Przebudowa panelu gościa z wertykalnej listy na mobile-first 2-kolumnowy grid kart w stylu boutique hotel. Cel: gość widzi usługi jak na profesjonalnej platformie e-commerce — każda karta z obrazem u góry, nazwą, i wyraźnym przyciskiem akcji; cała nawigacja wygodna jednym kciukiem. Realizuje PRD FR-006, FR-007, FR-010 i domyka design stream (D-01, D-02a → D-02).

## Starting Point

Panel gościa renderuje dwie sekcje jako wertykalne listy `flex-row` (included services) i `space-y-3` stack (add-ony w AddonList). Tokeny z D-01 są dostępne, pole `image_url` i `ServiceImage.tsx` z D-02a są gotowe — ale interfejs nadal wygląda jak prototype, nie boutique hotel.

## Desired End State

Gość widzi sticky header z pierwszym imieniem i numerem pokoju, a poniżej dwie sekcje grid 2-kol (lub 1-kol na < 360px) z kartami: pełnoszerokie zdjęcie (h-32) u góry, serif nagłówki sekcji (Playfair Display), terracotta dla akcji, indigo dla statusów. ConciergeWidget skompresowany do małego okrągłego FAB, który nie przysłania kart. Wszystkie tap targets ≥ 44px.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Image w karcie | Full-width banner h-32, object-cover | E-commerce feel; klasyczny układ kart hotelowych |
| Przycisk akcji | Full-width na dole karty | Maksymalny tap target; symetria obu wariantów karty |
| Struktura sekcji | Dwa osobne gridy z serif h2 | Jasna hierarchia: co gratis vs co płatne |
| Breakpoint 2-kol | `min-[360px]:grid-cols-2` (Tailwind 4) | Fallback do 1-kol na < 360px per roadmap risk |
| Header | Sticky, tylko pierwsze imię | RODO: nie wyświetlamy nazwiska w DOM |
| ConciergeWidget | FAB z ikoną Sparkles | Nie przysłania dolnego slotu kart |
| Komponenty | Jeden `ServiceCard` z `variant` prop | DRY: jedno miejsce do utrzymania layoutu karty |

## Scope

**In scope:**
- Nowy `ServiceCard.tsx` (variant: included / addon)
- Przebudowa sekcji included w `panel.astro` na grid kart
- Sticky header + imię-only w `GuestLayout.astro`
- Refaktor `AddonList.tsx` na grid ServiceCard
- Restyling `ConciergeWidget.tsx` triggera na FAB

**Out of scope:**
- Logika API, polling, stan zamówień — bez zmian
- Panel recepcji (D-03)
- Animacje kart
- Focal-point kontrola dla zdjęć
- Jakiekolwiek zmiany bazy danych

## Architecture / Approach

`ServiceCard` jest czystym komponentem prezentacyjnym (no state). W sekcji included — renderowany w Astro bez `client:*` (SSR-only). W sekcji addon — renderowany wewnątrz `AddonList` (która ma `client:load`); AddonList zarządza stanem zamówień i przekazuje callbacki przez props do każdej karty. Grid layout: `grid grid-cols-1 gap-4 min-[360px]:grid-cols-2` — bez custom breakpointów w CSS.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. ServiceCard | Reużywalny komponent karty z obu wariantami | TypeScript narrowing dla discriminated union props |
| 2. Panel + Header | Statyczna warstwa: gridy included + sticky header | Select query musi zawierać `category` i `image_url` |
| 3. AddonList + FAB | Interaktywna warstwa: addon grid + ConciergeWidget | Prop wiring do ServiceCard nie może złamać pollingu |

**Prerequisites:** D-01 (done), D-02a (done)
**Estimated effort:** ~1-2 sesje, 3 fazy

## Open Risks & Assumptions

- Zapytanie Supabase w `panel.astro` musi selekcjonować `category` i `image_url` — D-02a powinno to zrobić, ale warto sprawdzić przed Fazą 2
- Zdjęcia z picsum.photos (seed data) mogą być wolne lub niedostępne offline — placeholder gradient jest fallbackiem
- FAB `bottom-6` może nadal najeżdżać na dolny slot ostatniej karty na bardzo krótkich ekranach — do zweryfikowania manualnie

## Success Criteria (Summary)

- Gość widzi 2-kolumnowy grid kart z obrazami na telefonie (≥360px) i 1-kol na węższych ekranach
- Zamówienie add-ona i anulowanie działają end-to-end bez regressionów
- ConciergeWidget jako FAB nie przysłania przycisków kart

# Guest Panel Redesign — Implementation Plan

## Overview

Przebudowa panelu gościa z wertykalnej listy usług na mobile-first 2-kolumnowy grid kart w stylu boutique hotel. Każda karta pokazuje pełnoszerokie zdjęcie u góry, nazwę usługi, opcjonalny opis i dolny slot akcji (badge "Included" lub przycisk "Order"/"Cancel"). Nawigacja jest thumb-friendly, header sticky z imieniem gościa. Design oparty w pełni na tokenach z D-01 (terracotta, indigo, cream, Playfair Display).

## Current State Analysis

- `src/pages/guest/panel.astro` — dwie sekcje (included services: wertykalna lista flex-row, add-ony: delegowane do `AddonList`)
- `src/components/guest/AddonList.tsx` — vertikalny stack `space-y-3`, każdy item: `flex items-center justify-between`, brak gridu
- `src/layouts/GuestLayout.astro` — statyczny header z pełnym imieniem gościa, numerem pokoju i datą; bez sticky
- `src/components/guest/ConciergeWidget.tsx` — floating button z etykietą tekstową "Ask the concierge" w prawym dolnym rogu
- `src/components/guest/ServiceImage.tsx` — thumbnail 48×48px (obraz lub ikona kategorii); istnieje od D-02a

Tokeny z D-01 gotowe w `src/styles/global.css`. Pole `image_url` w tabeli `services` i komponent `ServiceImage` dodane w D-02a.

## Desired End State

Gość otwiera `/guest/panel` na telefonie i widzi:
- Sticky header z kremowym tłem i pierwszym imieniem (tylko imię, nie nazwisko — RODO)
- Sekcję "Included in your package" z Playfair Display h2 + grid 2-kol kart
- Sekcję "Available add-ons" z Playfair Display h2 + interaktywny grid 2-kol kart
- Każda karta: pełnoszerokie zdjęcie (h-32, object-cover) lub gradient placeholder z ikoną kategorii, poniżej nazwa + opis, na dole slot akcji (badge lub przycisk ≥ 44px)
- ConciergeWidget jako mały okrągły FAB (ikona Sparkles), który nie przysłania kart; rozsuwa się po dotknięciu
- Grid automatycznie odpada do 1 kolumny poniżej 360px

### Key Discoveries

- `AddonList.tsx:4-8` — interfejs `Addon` zawiera już `image_url` i `category` (dodane w D-02a)
- `src/styles/global.css` — custom property `--font-serif` mapuje na "Playfair Display"; klasa `font-serif` dostępna przez Tailwind `@theme inline`
- Tailwind 4 nie posiada `xs:` breakpointa — breakpointy poniżej `sm:` (640px) wymagają składni `min-[360px]:` (arbitrary values)
- `ServiceCard` z `variant='included'` jest w pełni statyczny (SSR) — nie wymaga `client:*` w `.astro`
- `ServiceCard` z `variant='addon'` jest renderowany wewnątrz `AddonList` (która już ma `client:load`) — brak dodatkowego dyrektyw

## What We're NOT Doing

- Żadnych zmian w logice API, bazie danych ani pollingu
- Żadnych animacji kart (hover efekty to max `transition-shadow`)
- Nie przepisujemy ConciergeWidget od zera — tylko styl triggera
- Nie ruszamy panelu recepcji (to D-03)
- Nie dodajemy focal-point kontroli dla zdjęć — `object-cover` bez `object-position` override

## Implementation Approach

Trzy fazy pokrywają naturalne warstwy zależności:
1. **ServiceCard** — fundament: nowy komponent karty używany przez obie sekcje; można przetestować w izolacji
2. **Panel page + header** — zastosowanie ServiceCard w sekcji included + przebudowa GuestLayout; testowalna warstwa statyczna
3. **AddonList + ConciergeWidget** — refaktor interaktywnej listy addon-ów na grid + restyling FAB; testowalna warstwa interaktywna

## Critical Implementation Details

**Tailwind 4 — breakpoint poniżej `sm:`**: Użyj `min-[360px]:grid-cols-2` zamiast `xs:grid-cols-2` — Tailwind 4 domyślnie nie definiuje breakpointa `xs`. Dodanie custom breakpointa do `@theme` jest opcją, ale arbitrary value jest prostsze i wystarczające dla jednego miejsca.

**ServiceCard bez `client:*` w sekcji included**: Komponent React renderowany w pliku `.astro` bez dyrektywy `client:*` działa jako SSR-only (statyczny HTML). Dla included cards (brak onClick) jest to poprawne i pożądane — bez hydration overhead.

**Imię gościa — trim do pierwszego słowa**: W `GuestLayout.astro` wytnij pierwsze słowo z `guestName` (`.split(' ')[0]`) przed wyświetleniem. Nie przekazuj pełnego imienia i nazwiska do DOM.

---

## Phase 1: ServiceCard Component

### Overview

Nowy reużywalny komponent `ServiceCard` ze zdjęciem u góry, blokiem treści i dolnym slotem akcji. Przyjmuje `variant: 'included' | 'addon'`. Dla included: badge z checkmarkiem. Dla addon: status-aware przycisk.

### Changes Required

#### 1. ServiceCard component

**File**: `src/components/guest/ServiceCard.tsx`

**Intent**: Stworzyć komponent prezentacyjny bez własnego stanu. Wszystkie callbacki i stan zamówienia przychodzą z zewnątrz (AddonList będzie zarządzać stanem i przekazywać do każdej karty).

**Contract**: Eksportuje `ServiceCard` z następującą sygnaturo interfejsów:

```ts
interface ServiceBase {
  id: string;
  name: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
}

interface IncludedProps extends ServiceBase {
  variant: 'included';
}

interface AddonProps extends ServiceBase {
  variant: 'addon';
  price: number | null;
  orderStatus: 'none' | 'pending' | 'fulfilled' | 'cancelled';
  onOrder: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

type ServiceCardProps = IncludedProps | AddonProps;
```

Struktura karty:
- `<article>` z `rounded-xl overflow-hidden bg-card border border-border flex flex-col`
- Image slot: pełna szerokość, `h-32`; jeśli `imageUrl` — `<img className="w-full h-32 object-cover" />`; jeśli null — `<div className="w-full h-32 bg-gradient-to-br from-secondary/20 to-primary/20 flex items-center justify-center">` + ikona kategorii (reuse logiki z ServiceImage)
- Body: `<div className="p-3 flex flex-col flex-1">`; `<h3>` z nazwą, `<p>` z opisem (line-clamp-2)
- Bottom slot: oddzielony `border-t border-border`; dla included — badge z `CheckCircle`; dla addon — logika status → przycisk

Dla addon bottom slot:
- `none`: cena w PLN + pełnoszerokie `<button>` z `bg-primary text-primary-foreground min-h-[44px]` i tekstem "Order"
- `pending`: badge "⏳ Awaiting" + pełnoszerokie `<button>` z `bg-muted min-h-[44px]` i tekstem "Cancel"
- `fulfilled`: badge "✓ Fulfilled" (indigo) — brak przycisku
- `cancelled`: badge "Cancelled" (muted) — brak przycisku

Dla included bottom slot:
- Badge `<span>` z ikoną `CheckCircle` (lucide) + tekst "Included in your package", kolor `text-primary`

### Success Criteria

#### Automated Verification

- TypeScript kompiluje się bez błędów: `npx tsc --noEmit`
- Lint przechodzi: `npm run lint`

#### Manual Verification

- ServiceCard z `variant='included'` renderuje się poprawnie: banner, nazwa, badge z checkmarkiem
- ServiceCard z `variant='addon'` i `orderStatus='none'` pokazuje cenę i przycisk Order
- ServiceCard z `variant='addon'` i `orderStatus='pending'` pokazuje badge i przycisk Cancel
- Placeholder gradient renderuje się gdy `imageUrl` jest null
- Obraz renderuje się poprawnie z `imageUrl`

**Implementation Note**: Po zakończeniu tej fazy i pozytywnej weryfikacji manualnej — poczekaj na potwierdzenie przed przejściem do fazy 2.

---

## Phase 2: Panel Page + Header Redesign

### Overview

Przebudowa `panel.astro` na dwie sekcje z gridami kart + restyling `GuestLayout.astro` na sticky header z imieniem-only.

### Changes Required

#### 1. GuestLayout header

**File**: `src/layouts/GuestLayout.astro`

**Intent**: Uczynić header sticky i thumb-friendly; wyświetlać tylko pierwsze imię gościa (RODO). Zastosować cream background i terracotta akcent.

**Contract**: Header otrzymuje `sticky top-0 z-10 bg-background`. Wyświetla `guestName.split(' ')[0]` jako główny tekst (typ: `font-serif text-lg text-foreground`). Numer pokoju jako secondary (mniejszy, muted). Data check-out pozostaje widoczna ale mniejsza. Usunąć wszelkie hardcoded klasy szarości (gray-*).

#### 2. Included services grid

**File**: `src/pages/guest/panel.astro`

**Intent**: Sekcja included services przechodzi z flex-row listy na 2-kolumnowy grid kart. Dodać serif h2 nad sekcją. Przekazać `imageUrl` i `category` z istniejącego zapytania Supabase do `ServiceCard`.

**Contract**:
- `<h2 className="font-serif text-xl text-foreground mb-4">Included in your package</h2>`
- `<div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">`
- Wewnątrz: `<ServiceCard variant="included" id={s.id} name={s.name} description={s.description} category={s.category} imageUrl={s.image_url} />` dla każdego included service
- ServiceCard jest komponentem React w pliku Astro — renderowany bez `client:*` (SSR-only, brak interaktywności)
- Sprawdź że zapytanie w `panel.astro` selekcjonuje `category` i `image_url` z tabeli `services` — jeśli nie, dodaj pola do select

#### 3. Add-ons section heading

**File**: `src/pages/guest/panel.astro`

**Intent**: Dodać serif h2 nad `AddonList` analogicznie do sekcji included.

**Contract**: `<h2 className="font-serif text-xl text-foreground mb-4 mt-8">Available add-ons</h2>` przed `<AddonList ... client:load />`. Grid będzie renderowany przez AddonList w fazie 3.

### Success Criteria

#### Automated Verification

- TypeScript kompiluje się bez błędów: `npx tsc --noEmit`
- Lint przechodzi: `npm run lint`

#### Manual Verification

- Header jest sticky (pozostaje na górze przy scrollowaniu)
- Header pokazuje tylko pierwsze imię gościa (nie pełne imię i nazwisko)
- Sekcja "Included in your package" renderuje grid 2-kol kart z obrazami na telefonie
- Grid odpada do 1 kolumny na ekranach < 360px (sprawdź w DevTools na 320px)
- Serif nagłówki (Playfair Display) widoczne nad obiema sekcjami
- Brak hardcoded gray-* klas w headerze
- Sekcja add-onów nadal renderuje się (AddonList wciąż działa jako stara lista — zmiana w fazie 3)

**Implementation Note**: Po zakończeniu tej fazy i pozytywnej weryfikacji manualnej — poczekaj na potwierdzenie przed przejściem do fazy 3.

---

## Phase 3: AddonList Grid Refactor + ConciergeWidget FAB

### Overview

AddonList przechodzi z wertykalnej listy na grid kart używając nowego ServiceCard. ConciergeWidget zmienia trigger z tekstowego przycisku na okrągły FAB z ikoną.

### Changes Required

#### 1. AddonList grid layout

**File**: `src/components/guest/AddonList.tsx`

**Intent**: Zastąpić aktualną wertykalną listę (`space-y-3`) gridem 2-kolumnowym używającym `ServiceCard`. Stan zamówień, polling, handlery API pozostają bez zmian — wyłącznie warstwa renderowania.

**Contract**:
- Wrapper listy zmienia się z `<div className="space-y-3">` na `<div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">`
- Każdy element zastępowany przez `<ServiceCard variant="addon" id={addon.id} name={addon.name} description={addon.description} category={addon.category} imageUrl={addon.image_url} price={addon.price_pln} orderStatus={orderStatus} onOrder={() => handleOrder(addon.id)} onCancel={() => handleCancel(orderId)} isLoading={loading.get(addon.id) ?? false} />`
- `orderStatus` derivowany z istniejącego `orders` Map: `orders.has(addon.id) ? orders.get(addon.id)!.status : 'none'`
- Usunąć inline HTML kart — całość idzie przez ServiceCard
- Zachować istniejące useEffect dla pollingu i obsługę błędów (błędy wyświetlać nad gridem)

#### 2. ConciergeWidget FAB

**File**: `src/components/guest/ConciergeWidget.tsx`

**Intent**: Zmienić przycisk-trigger z widocznego tekstu na kompaktowy okrągły FAB, który nie przysłania kart. Funkcjonalność otwarcia/zamknięcia panelu bez zmian.

**Contract**: Przycisk trigger zmienia się na:
- `<button aria-label="Ask the concierge" className="fixed bottom-6 right-4 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center">` + ikona `<Sparkles size={20} />` (lucide-react)
- `min-w-[44px] min-h-[44px]` gwarantowane przez `w-12 h-12` (48px)
- Pozycja `bottom-6` (24px od dołu) — nieco wyżej niż poprzednio, żeby nie nachodził na bottom slot kart gdy scroll sięga końca
- Cała reszta komponentu (modal, history, API call) bez zmian

### Success Criteria

#### Automated Verification

- TypeScript kompiluje się bez błędów: `npx tsc --noEmit`
- Lint przechodzi: `npm run lint`

#### Manual Verification

- Add-ony renderują się jako grid 2-kol (spójny z gridiem included)
- Przycisk "Order" jest pełnoszerokie (wypełnia dolny slot karty), tap target ≥ 44px
- Zamówienie add-ona działa: karta zmienia się na "Awaiting" + Cancel
- Anulowanie działa: karta wraca do "Order"
- Polling co 20s działa — statusy aktualizują się bez przeładowania
- ConciergeWidget trigger to mały okrągły FAB z ikoną Sparkles
- FAB rozsuwa panel po dotknięciu
- FAB nie przysłania dolnego slotu kart przy normalnym użytkowaniu
- Brak regressionów w sekcji included services

**Implementation Note**: Po zakończeniu tej fazy zrób pełny test end-to-end: zaloguj się jako gość, sprawdź obie sekcje, złóż zamówienie, sprawdź ConciergeWidget.

---

## Testing Strategy

### Manual Testing Steps

1. Otwórz `/guest/panel` na mobile (lub DevTools 390px) — sprawdź 2-kol grid obu sekcji
2. Zmień DevTools na 320px — sprawdź fallback do 1 kolumny
3. Kliknij "Order" na add-onie — sprawdź zmianę stanu karty (badge Awaiting + Cancel)
4. Kliknij "Cancel" — sprawdź powrót do stanu Order
5. Dotknij FAB ConciergeWidget — sprawdź że panel się otwiera i nie przysłania kart
6. Zescrolluj do dołu strony — sprawdź że FAB nie najeżdża na dolny slot kart
7. Odśwież po 20s z pending zamówieniem — sprawdź że status się aktualizuje
8. Sprawdź header: sticky przy scrollu, tylko pierwsze imię

## Performance Considerations

Brak nowych zapytań do bazy. Placeholdery gradientowe renderują się bez sieci. Zdjęcia z picsum.photos mogą być wolne w dev — akceptowalne; w produkcji będą zastąpione rzeczywistymi URL.

## References

- Roadmap D-02: `context/foundation/roadmap.md:169`
- Design tokens: `src/styles/global.css`
- D-01 plan brief: `context/changes/design-token-foundation/plan-brief.md`
- D-02a plan brief: `context/changes/services-image-field/plan-brief.md`
- Istniejący `ServiceImage.tsx`: `src/components/guest/ServiceImage.tsx`
- Istniejący `AddonList.tsx`: `src/components/guest/AddonList.tsx`
- Istniejący `ConciergeWidget.tsx`: `src/components/guest/ConciergeWidget.tsx`

---

## Progress

> Konwencja: `- [ ]` pending, `- [x]` done. Dopisz ` — <commit sha>` gdy krok wyląduje. Nie zmieniaj nazw kroków.

### Phase 1: ServiceCard Component

#### Automated

- [x] 1.1 TypeScript kompiluje się bez błędów: `npx tsc --noEmit` — 71951d4
- [x] 1.2 Lint przechodzi: `npm run lint` — 71951d4

#### Manual

- [x] 1.3 ServiceCard variant=included renderuje się poprawnie (banner + nazwa + badge)
- [x] 1.4 ServiceCard variant=addon z orderStatus=none pokazuje cenę i przycisk Order
- [x] 1.5 ServiceCard variant=addon z orderStatus=pending pokazuje badge i przycisk Cancel
- [x] 1.6 Placeholder gradient renderuje się gdy imageUrl null
- [x] 1.7 Obraz renderuje się z imageUrl

### Phase 2: Panel Page + Header Redesign

#### Automated

- [x] 2.1 TypeScript kompiluje się bez błędów: `npx tsc --noEmit` — c7b8333
- [x] 2.2 Lint przechodzi: `npm run lint` — c7b8333

#### Manual

- [x] 2.3 Header jest sticky przy scrollowaniu — c7b8333
- [x] 2.4 Header pokazuje tylko pierwsze imię (nie pełne imię i nazwisko) — c7b8333
- [x] 2.5 Grid included 2-kol na telefonie (≥360px) — c7b8333
- [x] 2.6 Grid odpada do 1-kol na ekranie 320px (sprawdź w DevTools) — c7b8333
- [x] 2.7 Serif nagłówki (Playfair Display) nad obiema sekcjami — c7b8333
- [x] 2.8 Brak hardcoded gray-* klas w headerze — c7b8333

### Phase 3: AddonList Grid Refactor + ConciergeWidget FAB

#### Automated

- [x] 3.1 TypeScript kompiluje się bez błędów: `npx tsc --noEmit`
- [x] 3.2 Lint przechodzi: `npm run lint`

#### Manual

- [x] 3.3 Add-ony renderują się jako grid 2-kol
- [x] 3.4 Przycisk "Order" ma tap target ≥ 44px (full-width dolny slot)
- [x] 3.5 Zamówienie add-ona działa end-to-end
- [x] 3.6 Anulowanie zamówienia działa
- [x] 3.7 Polling co 20s aktualizuje statusy
- [x] 3.8 ConciergeWidget FAB — mały okrągły przycisk z ikoną Sparkles
- [x] 3.9 FAB otwiera panel po dotknięciu
- [x] 3.10 Brak regressionów w sekcji included services

# Dashboard Mobile Nav Implementation Plan

## Overview

Dodanie hamburger menu dla panelu recepcji na urządzeniach mobilnych. Obecna nawigacja w `StaffLayout.astro` to stały poziomy topbar — na małych ekranach elementy nawigacyjne są czytelne, ale tap-friendly nie są. Plan dodaje: hamburger icon (widoczny tylko na mobile), slide-in drawer z pełną nawigacją wysuwający się od prawej, backdrop-overlay zamykający panel.

## Current State Analysis

- `src/layouts/StaffLayout.astro` (linie 21–53): poziomy `<nav>` ze stałymi elementami: "Generate Token", "Orders" (+ pending badge), "Sign Out" (form POST).
- Pending badge: SSR-initialized (`pendingCount` z Supabase) + live-update przez `window.dispatchEvent(new CustomEvent("pending-count-update", { detail: count }))` w OrderList.
- Brak jakiejkolwiek mobilnej nawigacji; elementy zawsze widoczne w jednej linii.
- `ConciergeWidget.tsx` daje wzorzec: `fixed inset-0 z-50`, useState open/close, overlay + slide panel.

### Key Discoveries

- `StaffLayout.astro:22` — nav jest `flex items-center justify-between`; desktop items są w `<div class="flex items-center gap-4">` — ten div stanie się `hidden md:flex`.
- `StaffLayout.astro:58-66` — istniejący `<script>` obsługuje `pending-count-update` dla `#pending-badge` (desktop). Pozostaje bez zmian — MobileNav obsłuży swój badge wewnętrznie przez `useEffect`.
- `StaffLayout.astro:44-51` — Sign Out to `<form method="POST">`, nie link. W React komponentach renderowanie `<form method="POST">` działa normalnie.
- `src/components/guest/ConciergeWidget.tsx:88-97` — wzorzec overlay: `fixed inset-0 z-50 flex items-end justify-end p-4` + panel z `transition-transform`.
- `src/components/guest/ServiceCard.tsx:73` — `min-h-[44px]` jako tap-target standard.
- Astro.url.pathname dostępne w `.astro` — przekazane jako prop `currentPath` do React komponentu.

## Desired End State

Personel recepcji na urządzeniu mobilnym (< md, tj. < 768px) widzi topbar z logo "RoomPilot" i ikoną hamburgera po prawej. Po kliknięciu hamburgera wysuwa się pionowy panel od prawej krawędzi ekranu z pełną nawigacją (Generate Token, Orders + pending badge, Sign Out); aktywna strona jest podkreślona. Ciemny backdrop-overlay przykrywa resztę ekranu — kliknięcie go zamyka panel. Panel zamyka się też po kliknięciu dowolnego elementu nawigacyjnego. Na desktop (≥ md) nic się nie zmienia — hamburger jest ukryty, nawigacja pozioma jak dotychczas.

### Key Discoveries:

- Desktop nav `<div class="flex items-center gap-4">` zmienia się na `hidden md:flex items-center gap-4`
- Hamburger button: `md:hidden`, `min-h-[44px] min-w-[44px]`
- MobileNav props: `pendingCount: number`, `currentPath: string`
- Drawer: `fixed inset-y-0 right-0 z-50 w-64`, `translate-x-full` → `translate-x-0` via `transition-transform duration-300`
- Overlay: `fixed inset-0 z-40 bg-black/50`

## What We're NOT Doing

- Nie zmieniamy desktop nawigacji ani jej wyglądu.
- Nie dodajemy animacji hamburger → X (ikona pozostaje `≡` przez cały czas).
- Nie dodajemy routingu poza istniejące linki (`/dashboard/generate-token`, `/dashboard`, signout).
- Nie zmieniamy pending badge na desktop (istniejący `<script>` pozostaje).
- Nie dodajemy gestów swipe-to-close.
- Nie dodajemy testów e2e (poza tym planem).

## Implementation Approach

Minimalne zmiany w `StaffLayout.astro` (ukrycie desktop nav na mobile + hamburger button + mount MobileNav) + jeden nowy React island `MobileNav.tsx`. Komponent nasłuchuje tego samego CustomEvent co desktop badge, więc nie trzeba zmieniać niczego w `OrderList.tsx`.

## Phase 1: StaffLayout.astro — mobile scaffold

### Overview

Modyfikacja layoutu: desktop nav items ukryte na mobile, hamburger icon widoczny tylko na mobile, MobileNav zamontowany jako React island z propsami SSR.

### Changes Required

#### 1. Desktop nav items — ukrycie na mobile

**File:** `src/layouts/StaffLayout.astro`

**Intent:** Zwinąć istniejące elementy desktop nav (Generate Token, Orders, Sign Out) do `hidden md:flex`, żeby na mobilnych znikały i robiły miejsce dla hamburgera.

**Contract:** Zmiana klasy wrappera `<div class="flex items-center gap-4">` → `<div class="hidden md:flex items-center gap-4">`. Żadna inna logika nie ulega zmianie.

#### 2. Hamburger button — mobile-only trigger

**File:** `src/layouts/StaffLayout.astro`

**Intent:** Dodać przycisk z ikoną hamburgera widoczny wyłącznie na mobile (`md:hidden`), który uruchamia MobileNav. Ponieważ stan open/close żyje w React, potrzebujemy mechanizmu komunikacji — użyjemy CustomEvent `mobile-nav-toggle` emitowanego przez przycisk w Astro, nasłuchiwanego w MobileNav.

**Contract:** `<button class="md:hidden min-h-[44px] min-w-[44px] ..." onclick="window.dispatchEvent(new CustomEvent('mobile-nav-open'))">` z ikoną `≡` (SVG lub `☰` HTML entity). Tap target ≥ 44×44px. Przycisk umieszczony po prawej stronie loga, wewnątrz `<nav>`, przed ukrytym desktop div.

#### 3. MobileNav mount

**File:** `src/layouts/StaffLayout.astro`

**Intent:** Zamontować `MobileNav` jako React island z SSR-initialized pending count i aktualną ścieżką.

**Contract:**
```astro
import MobileNav from "@/components/staff/MobileNav";
---
<MobileNav client:load pendingCount={pendingCount} currentPath={Astro.url.pathname} />
```
Komponent renderuje się poza `<nav>` (jako sibling `<main>`), żeby overlay mógł pokrywać całą stronę.

### Success Criteria

#### Automated Verification

- TypeScript check: `npm run build` bez błędów typów
- Lint: `npm run lint` bez nowych błędów

#### Manual Verification

- Na viewport < 768px: hamburger ikona widoczna, desktop nav items niewidoczne
- Na viewport ≥ 768px: hamburger niewidoczny, desktop nav widoczny jak dotychczas

**Implementation Note:** Zatrzymaj się po tej fazie i zweryfikuj manualnie responsywność przed przejściem do Phase 2.

---

## Phase 2: MobileNav.tsx — slide-in drawer

### Overview

Nowy React island: overlay + drawer sliding od prawej, 3 nav items, pending badge SSR-initialized + CustomEvent update, active link highlight, Sign Out form POST.

### Changes Required

#### 1. MobileNav komponent

**File:** `src/components/staff/MobileNav.tsx`

**Intent:** Stworzyć React island zarządzający stanem open/close mobile drawera. Komponent nasłuchuje CustomEvent `mobile-nav-open` żeby otworzyć panel (trigger z hamburger buttona w Astro) i `pending-count-update` żeby aktualizować badge. Zamyka się przez overlay click lub kliknięcie nav item.

**Contract:**

Props:
```ts
interface Props {
  pendingCount: number;
  currentPath: string;
}
```

Stan: `useState<number>` dla pendingCount (inicjowany z prop), `useState<boolean>` dla isOpen.

Efekty:
- `useEffect` nasłuchuje `mobile-nav-open` → `setIsOpen(true)`
- `useEffect` nasłuchuje `pending-count-update` → `setPendingCount(e.detail)`

Struktura JSX:
- Fragment z dwoma wariantami warunkowymi:
  1. Overlay: `<div onClick={() => setIsOpen(false)} className="fixed inset-0 z-40 bg-black/50" />`  — renderowany gdy `isOpen`
  2. Drawer: `<div className="fixed inset-y-0 right-0 z-50 w-64 bg-[--color-bg] transition-transform duration-300 {isOpen ? 'translate-x-0' : 'translate-x-full'}">` — zawsze w DOM, animowany przez translate

Nav items (każdy `min-h-[44px]`):
- `<a href="/dashboard/generate-token">` z `onClick={() => setIsOpen(false)}` — podkreślony gdy `currentPath === "/dashboard/generate-token"`
- `<a href="/dashboard">` + pending badge span — podkreślony gdy `currentPath === "/dashboard"`
- `<form method="POST" action="/api/auth/signout"><button type="submit" className="... min-h-[44px] w-full">Sign Out</button></form>`

Active state: dodatkowa klasa `text-white font-semibold border-l-2 border-white` na aktywnym elemencie (lub podobny wizualny wyróżnik spójny z motywem).

### Success Criteria

#### Automated Verification

- TypeScript check: `npm run build` bez błędów typów
- Lint: `npm run lint` bez nowych błędów

#### Manual Verification

- Kliknięcie hamburgera → drawer wysuwa się od prawej z animacją ~300ms
- Ciemny overlay pokrywa resztę ekranu
- Kliknięcie overlay → drawer się zamyka
- Kliknięcie "Generate Token" → nawiguje do `/dashboard/generate-token`, drawer zamknięty
- Kliknięcie "Orders" → nawiguje do `/dashboard`, drawer zamknięty
- Kliknięcie "Sign Out" → wylogowanie (POST redirect), drawer zamknięty
- Pending badge w mobile nav pokazuje poprawną liczbę od razu po załadowaniu (nie czeka na polling)
- Gdy polling zaktualizuje badge, mobile nav badge też się aktualizuje
- Aktywna strona jest wizualnie wyróżniona w drawer
- Wszystkie tap targets ≥ 44px (zweryfikowane DevTools → Inspector → computed size)
- Desktop viewport (≥ 768px): MobileNav nie wpływa na layout (drawer translate-x-full, hidden)

**Implementation Note:** Przetestuj na prawdziwym urządzeniu mobilnym lub Chrome DevTools Mobile emulation (np. iPhone 12, 390px szerokości).

---

## Testing Strategy

### Manual Testing Steps

1. Otwórz `/dashboard` w Chrome DevTools → Toggle device toolbar → iPhone 12 (390px)
2. Sprawdź: hamburger widoczny, desktop nav ukryty
3. Kliknij hamburger → drawer wysuwa się od prawej, overlay pojawia się
4. Kliknij overlay → drawer zamyka się
5. Kliknij hamburger → otwórz → kliknij "Orders" → weryfikuj: nawigacja na `/dashboard`, drawer zamknięty
6. Kliknij hamburger → otwórz → kliknij "Generate Token" → weryfikuj: nawigacja
7. Sprawdź pending badge: jeśli są pending orders, badge powinien być widoczny w obu trybach (desktop i mobile) od razu po załadowaniu
8. Zmień viewport na ≥ 768px → weryfikuj: hamburger niewidoczny, desktop nav widoczny jak dotychczas

## Performance Considerations

React island `client:load` dodaje ~minimal overhead — React jest już załadowany na tej stronie przez `OrderList`. MobileNav.tsx nie dodaje nowej zależności zewnętrznej.

## References

- Roadmap D-04: `context/foundation/roadmap.md` (linia 213–227)
- Wzorzec overlay: `src/components/guest/ConciergeWidget.tsx:88-97`
- Tap target standard: `src/components/guest/ServiceCard.tsx:73`
- Desktop badge + CustomEvent: `src/layouts/StaffLayout.astro:34-65`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: StaffLayout.astro — mobile scaffold

#### Automated

- [x] 1.1 TypeScript check passes (`npm run build` bez błędów typów)
- [x] 1.2 Lint passes (`npm run lint` bez nowych błędów)

#### Manual

- [x] 1.3 Na viewport < 768px: hamburger widoczny, desktop nav items niewidoczne
- [x] 1.4 Na viewport ≥ 768px: hamburger niewidoczny, desktop nav widoczny jak dotychczas

### Phase 2: MobileNav.tsx — slide-in drawer

#### Automated

- [ ] 2.1 TypeScript check passes (`npm run build` bez błędów typów)
- [ ] 2.2 Lint passes (`npm run lint` bez nowych błędów)

#### Manual

- [ ] 2.3 Kliknięcie hamburgera → drawer wysuwa się od prawej z animacją
- [ ] 2.4 Kliknięcie overlay → drawer się zamyka
- [ ] 2.5 Kliknięcie nav item → nawiguje i zamyka drawer
- [ ] 2.6 Sign Out działa (POST redirect, wylogowanie)
- [ ] 2.7 Pending badge poprawny od załadowania strony (SSR) i aktualizuje się z pollingiem
- [ ] 2.8 Aktywna strona wyróżniona wizualnie w drawer
- [ ] 2.9 Wszystkie tap targets ≥ 44px
- [ ] 2.10 Desktop viewport (≥ 768px): layout niezmieniony

# Dashboard Mobile Nav — Plan Brief

> Full plan: `context/changes/dashboard-mobile-nav/plan.md`

## What & Why

Panel recepcji (StaffLayout) ma stały poziomy topbar — na urządzeniach mobilnych elementy są widoczne, ale nie są wygodne do obsługi kciukiem. D-04 dodaje hamburger menu na mobile: ikona w topbarze otwiera slide-in drawer od prawej z pełną nawigacją, tap targets ≥ 44px, bez zmian na desktopie.

## Starting Point

`src/layouts/StaffLayout.astro` ma jeden poziomy `<nav>` bez żadnej responsywności mobilnej. Pending badge jest SSR-initialized z Supabase i aktualizowany przez `pending-count-update` CustomEvent (obsługiwany przez istniejący `<script>`). Brak komponentu MobileNav.

## Desired End State

Na telefonie (< 768px): topbar pokazuje tylko logo i ikonę hamburgera. Kliknięcie otwiera pionowy drawer od prawej z 3 pozycjami (Generate Token, Orders + pending badge, Sign Out). Aktywna strona wyróżniona. Backdrop-overlay zamyka panel. Na desktopie (≥ 768px): żadna zmiana.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Slide direction | Od prawej | Spójny z ConciergeWidget.tsx; naturalny dla jednoręcznej obsługi | Plan |
| Implementacja | React island (MobileNav.tsx, client:load) | React jest już załadowany na stronie przez OrderList; roadmap explicite wskazuje .tsx | Plan |
| Active link | Tak — highlight aktualnej strony | Standard UX; pathname przekazany jako prop z Astro.url | Plan |
| Badge initial value | SSR prop + CustomEvent updates | Brak flash "0" przy załadowaniu; spójny z desktop badge | Plan |

## Scope

**In scope:**
- Modyfikacja `src/layouts/StaffLayout.astro`: hamburger button (`md:hidden`), ukrycie desktop nav na mobile (`hidden md:flex`)
- Nowy `src/components/staff/MobileNav.tsx`: drawer + overlay + pending badge + active state
- Tap targets ≥ 44px dla wszystkich elementów mobile nav

**Out of scope:**
- Zmiany w desktop nawigacji
- Animacja hamburger → X
- Gesty swipe-to-close
- Testy e2e

## Architecture / Approach

`StaffLayout.astro` emituje `CustomEvent('mobile-nav-open')` z hamburger buttona (vanilla, bez React). `MobileNav.tsx` nasłuchuje go w `useEffect` → `setIsOpen(true)`. Ten sam komponent nasłuchuje `pending-count-update` dla live badge. Drawer jest zawsze w DOM z `translate-x-full` / `translate-x-0` + `transition-transform duration-300` — overlay renderowany warunkowo (lub też zawsze z opacity).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. StaffLayout scaffold | Hamburger button + hidden desktop nav na mobile + MobileNav mount | Konflikt z istniejącym `<script>` badge'a (niski — dotyczą różnych elementów DOM) |
| 2. MobileNav.tsx | Pełny drawer: open/close, overlay, nav items, badge, active state | CustomEvent timing — jeśli MobileNav nie zamontuje się przed pierwszym eventem, badge może być niezsynchronizowany (nieistotne — CustomEvent jest emitowany przez polling co 10–20s) |

**Prerequisites:** D-03 (reception-panel-polish) per roadmap — w praktyce plan jest niezależny od wyglądu, ale roadmap wskazuje kolejność.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- `mobile-nav-open` CustomEvent zakłada, że hamburger button nie jest wewnątrz React — komunikacja jednostronna (Astro → React). Jeśli w przyszłości hamburger przeniesie się do React, CustomEvent można zastąpić bezpośrednim setState.
- Kolor tła drawera (`bg-[--color-bg]` lub podobny) musi pasować do istniejącego motywu `bg-cosmic` — jeśli D-01 (design tokens) zmieni zmienne CSS, drawer może wymagać drobnej korekty.

## Success Criteria (Summary)

- Na mobile: hamburger otwiera drawer od prawej; wszystkie 3 pozycje nawigacyjne dostępne; pending badge pokazuje poprawną liczbę od załadowania strony
- Na desktop: żadna zmiana w wyglądzie ani zachowaniu
- Tap targets ≥ 44px na wszystkich elementach mobile nav

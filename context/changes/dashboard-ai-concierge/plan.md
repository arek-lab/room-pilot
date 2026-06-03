# Dashboard AI Concierge Implementation Plan

## Overview

Sekcja "AI Concierge" w dashboardzie personelu: dwa taby — "Dane o hotelu" (formularz z polami z `hotel-context.ts`, fake-door Save) oraz "Alerty AI Concierge" (pusty placeholder). Zmiany wyłącznie frontendowe; żadnego backendu ani migracji DB.

## Current State Analysis

- `src/lib/hotel-context.ts` — obiekt `hotelContext` z 8 polami (name, address, checkInTime, checkOutTime, amenities, nearbyRestaurants, localAttractions, houseRules) + `buildSystemPrompt()`; nie jest dotykany przez ten plan
- `StaffLayout.astro` — desktop nav: Generate Token, Orders+badge, Sign Out; mobile nav delegowany do `MobileNav.tsx`
- `MobileNav.tsx` — mobile slide-in z tymi samymi 3 pozycjami
- `src/pages/dashboard/generate-token.astro` — wzorzec nowej chronionej strony dashboardu
- shadcn `Tabs` — **nieinstalowany** (`src/components/ui/` zawiera tylko `button.tsx` i `alert-dialog.tsx`)
- Middleware chroni cały `/dashboard/*` — nowa strona nie wymaga dodatkowej konfiguracji

### Key Discoveries

- `FormField` (`src/components/auth/FormField.tsx`) wspiera `variant="dark"` i wymaga prop `icon: ReactNode` — reużywam dla pól tekstowych
- Brak biblioteki toast/sonner — feedback "Zapisano" implementuję jako lokalny React state z `setTimeout`
- Wzorzec strony: `export const prerender = false` + `StaffLayout` + jeden React island z `client:load`
- Addony i ceny są czytane przez LLM z bazy — nie należą do formularza

## Desired End State

Personel po kliknięciu "AI Concierge" w nawigacji (desktop i mobile) trafia na `/dashboard/ai-concierge`. Widzi dwa taby:
1. **Dane o hotelu** — formularz pre-wypełniony z `hotelContext`, przycisk "Zapisz" wyświetla inline "✓ Zapisano" przez 2 sekundy
2. **Alerty AI Concierge** — pusty placeholder "No alerts yet" z ikoną

### Weryfikacja:
- Nawigacja desktop i mobile zawiera link "AI Concierge"
- `/dashboard/ai-concierge` ładuje się bez błędów
- Formularz wyświetla aktualne dane z `hotelContext`
- Przycisk "Zapisz" działa jako fake door (żadne żądanie sieciowe)
- Tab "Alerty" wyświetla pusty stan

## What We're NOT Doing

- Brak zapisu formularza do backendu / Supabase
- Brak integracji localStorage
- Brak podglądu system prompt (AlertDialog)
- Brak pól "Addony" i "Ceny" — LLM czyta usługi z bazy
- Brak zmian w `hotel-context.ts`

## Implementation Approach

Dwie fazy. Phase 1: instalacja shadcn Tabs + nowa strona-szkielet + linki nawigacyjne w obu menu. Phase 2: właściwe komponenty panelu (AiConciergePanel, HotelDataForm, AlertsPanel). Faza 1 pozwala zweryfikować routing i nawigację zanim zbudujemy logikę formularza.

## Phase 1: shadcn Tabs + strona + nawigacja

### Overview

Instalacja komponentu Tabs, stworzenie strony-szkieletu `/dashboard/ai-concierge` i dodanie linku "AI Concierge" do obu wariantów nawigacji.

### Changes Required

#### 1. Instalacja shadcn Tabs

**File**: (CLI)

**Intent**: Zainstalować komponent Tabs (Radix-based) do użycia w AiConciergePanel.

**Contract**: `npx shadcn@latest add tabs` → generuje `src/components/ui/tabs.tsx` eksportujący `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

#### 2. Nowa strona dashboardu

**File**: `src/pages/dashboard/ai-concierge.astro`

**Intent**: Chroniona strona dashboardu ładująca island AiConciergePanel w layoucie StaffLayout.

**Contract**: `export const prerender = false` na górze frontmatter; `StaffLayout` z `title="AI Concierge"`; `AiConciergePanel` montowany jako `client:load` bez props.

#### 3. Link w desktop nawigacji

**File**: `src/layouts/StaffLayout.astro`

**Intent**: Dodać link "AI Concierge" do desktop nav (widocznego na `md:` i szerszych), przed przyciskiem Sign Out.

**Contract**: `<a href="/dashboard/ai-concierge">` z klasami identycznymi jak istniejący link "Generate Token"; active state brak (brak `currentPath` w tym komponencie).

#### 4. Link w mobile nawigacji

**File**: `src/components/staff/MobileNav.tsx`

**Intent**: Dodać pozycję "AI Concierge" do mobile slide-in panelu, między Orders a Sign Out, z active-state podkreśleniem jeśli `currentPath === "/dashboard/ai-concierge"`.

**Contract**: `<a href="/dashboard/ai-concierge" onClick={close}>` z tą samą strukturą i klasami co istniejące linki; `min-h-[44px]` zachowany.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Link "AI Concierge" widoczny w desktop nav (obok Orders) po zalogowaniu
- Link widoczny w mobile hamburger menu
- `/dashboard/ai-concierge` ładuje się (nawet jeśli island jest jeszcze pusty)
- Aktywny link w mobile nav jest podświetlony

**Implementation Note**: Po fazie 1 i przejściu automated verification, potwierdź manualnie nawigację przed przejściem do fazy 2.

---

## Phase 2: Komponenty panelu

### Overview

Trzy nowe komponenty React: `AiConciergePanel` (wrapper z Tabs), `HotelDataForm` (formularz danych hotelu, fake door) i `AlertsPanel` (placeholder).

### Changes Required

#### 1. AiConciergePanel

**File**: `src/components/staff/AiConciergePanel.tsx`

**Intent**: React island eksportowany defaultowo; renderuje dwa taby przy użyciu shadcn Tabs; importuje i osadza HotelDataForm i AlertsPanel.

**Contract**: `Tabs defaultValue="hotel-data"` z `TabsList` + dwoma `TabsTrigger` ("Dane o hotelu", "Alerty AI Concierge") + dwoma `TabsContent` (`value="hotel-data"` i `value="alerts"`).

#### 2. HotelDataForm

**File**: `src/components/staff/HotelDataForm.tsx`

**Intent**: Formularz z 8 polami pre-wypełnionymi z `hotelContext`; przycisk "Zapisz" jest fake door — pokazuje inline "✓ Zapisano" przez 2 sekundy bez żadnego żądania sieciowego.

**Contract**:
- Pola tekstowe (FormField dark variant z Lucide ikonami): `name` (Building2), `address` (MapPin), `checkInTime` (Clock), `checkOutTime` (Clock)
- Textareas (dark styling ręczne, bez `pl-10` bo brak ikony): `amenities`, `nearbyRestaurants`, `localAttractions`, `houseRules`; każde pre-wypełnione z `hotelContext` przez `join("\n")`
- Stan: `saved: boolean`; po kliknięciu Zapisz → `setSaved(true)` + `setTimeout(() => setSaved(false), 2000)`
- Obok przycisku "Zapisz": gdy `saved === true` renderuj `<span className="text-green-400 text-sm">✓ Zapisano</span>`

**Uwaga**: `FormField` przyjmuje `onChange: (value: string) => void` — dla controlled textareas użyj analogicznego wzorca lokalnego stanu.

#### 3. AlertsPanel

**File**: `src/components/staff/AlertsPanel.tsx`

**Intent**: Pusty stan placeholder dla przyszłych alertów; strukturalnie gotowy na listę alertów.

**Contract**: Div wyśrodkowany z ikoną `BellOff` (lucide) i tekstem "No alerts yet" w `text-sidebar-foreground/60`; brak props.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Tab "Dane o hotelu": formularz widoczny, pola pre-wypełnione danymi z `hotel-context.ts`
- Przycisk "Zapisz" nie wysyła żadnego requesta (Network tab w DevTools pusty)
- Po kliknięciu "Zapisz" pojawia się "✓ Zapisano", znika po ~2s
- Tab "Alerty AI Concierge": widoczny placeholder z ikoną i tekstem "No alerts yet"
- Brak błędów TypeScript i konsoli przeglądarki

---

## Testing Strategy

### Manual Testing Steps

1. Zaloguj się jako personel → sprawdź link "AI Concierge" w desktop nav i mobile hamburger
2. Wejdź na `/dashboard/ai-concierge`
3. Zweryfikuj tab "Dane o hotelu": pola name, address, check-in/out, 4 textareas z danymi
4. Kliknij "Zapisz" → zweryfikuj inline "✓ Zapisano" i brak requesta w Network tab
5. Przełącz na tab "Alerty AI Concierge" → zweryfikuj pusty stan
6. Na mobile: otwórz hamburger → "AI Concierge" widoczne → tap → poprawny redirect → menu zamknięte

## References

- Roadmapa: D-05 w `context/foundation/roadmap.md`
- Wzorzec strony: `src/pages/dashboard/generate-token.astro`
- Wzorzec nawigacji: `src/layouts/StaffLayout.astro`, `src/components/staff/MobileNav.tsx`
- Dane hotelowe: `src/lib/hotel-context.ts`
- FormField: `src/components/auth/FormField.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: shadcn Tabs + strona + nawigacja

#### Automated

- [x] 1.1 Type check passes: `npm run lint` — ca1b993
- [x] 1.2 Build passes: `npm run build` — ca1b993

#### Manual

- [x] 1.3 Link "AI Concierge" widoczny w desktop nav po zalogowaniu — ca1b993
- [x] 1.4 Link widoczny w mobile hamburger menu — ca1b993
- [x] 1.5 `/dashboard/ai-concierge` ładuje się bez błędów — ca1b993
- [x] 1.6 Aktywny link w mobile nav jest podświetlony — ca1b993

### Phase 2: Komponenty panelu

#### Automated

- [x] 2.1 Type check passes: `npm run lint` — c7f4d2c
- [x] 2.2 Build passes: `npm run build` — c7f4d2c

#### Manual

- [x] 2.3 Tab "Dane o hotelu": formularz pre-wypełniony danymi z hotel-context.ts — c7f4d2c
- [x] 2.4 Przycisk "Zapisz" nie wysyła requesta sieciowego — c7f4d2c
- [x] 2.5 Po kliknięciu "Zapisz" pojawia się "✓ Zapisano", znika po ~2s — c7f4d2c
- [x] 2.6 Tab "Alerty AI Concierge": placeholder z ikoną i tekstem "No alerts yet" — c7f4d2c
- [x] 2.7 Brak błędów TypeScript i konsoli przeglądarki — c7f4d2c

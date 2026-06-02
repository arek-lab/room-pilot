# Design Token Foundation Implementation Plan

## Overview

Replace the neutral shadcn starter token set with a Moroccan boutique hotel palette (terakota, indygo, kremowe tło, złote akcenty), add a bespoke font pair (Inter body + Playfair Display headings), update the border radius, and eliminate every hardcoded Tailwind color class from the codebase. After this change, D-02 (guest-panel-redesign) and D-03 (reception-panel-polish) can build directly on a clean, hotel-branded token foundation without any colour archaeology.

## Current State Analysis

All design tokens live in `src/styles/global.css` via two layers: a `:root` block of raw CSS custom properties, and an `@theme inline` block that maps them to Tailwind utility classes. Tailwind 4 uses no `tailwind.config.js` — the CSS file is the single source of truth. `components.json` sets `cssVariables: true`, so shadcn components reference these variables through semantic classes (`bg-primary`, `text-muted-foreground`, etc.).

Current palette is entirely neutral (grays), `--radius: 0.625rem`, and no custom fonts. One known hardcoded outlier exists in `src/components/ui/LibBadge.astro:10` (`bg-blue-900/50 text-blue-200`). Both layouts also use raw Tailwind palette classes: `GuestLayout.astro` uses `gray-*` throughout; `StaffLayout.astro` uses `text-blue-200` and `bg-red-500`; and the `@utility bg-cosmic` in `global.css` encodes its indigo-black gradient as hardcoded hex values.

No custom fonts are loaded anywhere. The base layout (`src/layouts/Layout.astro`) owns the `<head>` and is extended by both `GuestLayout.astro` and `StaffLayout.astro`.

## Desired End State

`src/styles/global.css` has a rewritten `:root` block with OKLCH values for the boutique hotel palette, no `.dark` block, `--radius: 0.75rem`, and font variables wired into `@theme inline`. `Layout.astro` loads Inter and Playfair Display from Google Fonts. Body text renders in Inter; all h1–h3 headings render in Playfair Display automatically. No file under `src/` uses a hardcoded Tailwind palette class (`gray-*`, `blue-*`, `red-*`, etc.) outside the token system. `bg-cosmic` uses CSS variables. The guarantee: every colour on screen comes from a named semantic token.

### Key Discoveries

- `src/styles/global.css` — token source: `:root` (28 vars) + `@theme inline` (28 mappings). Only `:root` values change; `@theme inline` is untouched for colours (it already maps through `var()` references). Font tokens must be added to both layers.
- `src/layouts/Layout.astro:15-20` — the sole `<head>` in the project; Google Fonts link goes here.
- `src/layouts/GuestLayout.astro:21-36` — 6 hardcoded gray-* usages; all map cleanly to semantic tokens.
- `src/layouts/StaffLayout.astro:20,29,38` — `bg-cosmic`, `text-blue-200`, `bg-red-500` hardcoded.
- `src/components/ui/LibBadge.astro:10` — hardcoded `bg-blue-900/50 text-blue-200`.
- `src/styles/global.css` — `@utility bg-cosmic` uses hex literals; update to reference sidebar CSS vars.

## What We're NOT Doing

- Dark mode — the `.dark` block is deleted entirely; no dark variants of boutique colours defined.
- Custom spacing scale — Tailwind 4 default scale remains; only radius changes.
- Chart colour redesign — chart tokens are updated to match the boutique palette but chart UI components are not touched.
- StaffLayout structural redesign — `StaffLayout.astro` layout/spacing/structure is D-03 scope. Phase 3 fixes only the two hardcoded colour classes (`text-blue-200`, `bg-red-500`) and makes `bg-cosmic` token-aware; the overall dark-panel aesthetic remains.
- `components.json` baseColor field — this only affects future CLI scaffolding; existing components use CSS variables and are unaffected by this field at runtime. Leave as-is.
- Font subsetting or self-hosting — Google Fonts CDN link only; `@fontsource` packages are out of scope.

## Implementation Approach

Single-file token replacement cascades to all shadcn components automatically — no component code changes needed for the palette. Font loading is a two-file edit (Layout.astro + global.css). The audit in Phase 3 is mechanical: grep → categorise → fix each instance using the new tokens. Ordering matters: Phase 1 must land first so Phase 3 has real tokens to migrate into.

## Critical Implementation Details

**OKLCH values are starting values, not finals.** The OKLCH values in Phase 1 are specified to give the implementer a buildable baseline; contrast ratios (especially terakota on cream, gold on cream) must be verified visually in the browser before marking the phase complete. Use the browser DevTools colour picker or the APCA contrast checker to confirm WCAG AA (4.5:1 for body text, 3:1 for large text and UI components).

**`@theme inline` colour mappings are unchanged.** The existing `@theme inline` block already bridges `--primary` → `--color-primary` etc. Do not touch those mappings — only the `:root` values change. Font tokens are the only additive change to `@theme inline`.

---

## Phase 1: Palette & Radius Token Replacement

### Overview

Rewrite the `:root` block in `global.css` with OKLCH values for the boutique hotel palette. Delete the `.dark` block. Update `--radius`. Update the `@utility bg-cosmic` to reference sidebar CSS variables instead of hardcoded hex.

### Changes Required

#### 1. Rewrite `:root` colour block and radius

**File**: `src/styles/global.css`

**Intent**: Replace the 28 neutral OKLCH values with boutique hotel palette values and set the base radius to 0.75rem. Delete the entire `.dark { ... }` block that follows.

**Contract**: Replace the full `:root { ... }` block with the following values. The `@theme inline` block is left untouched — it already reads from these variables via `var()`.

```css
:root {
  --radius: 0.75rem;

  /* Canvas */
  --background: oklch(0.97 0.018 82);
  --foreground: oklch(0.22 0.02 60);

  /* Terakota — primary action */
  --primary: oklch(0.62 0.14 38);
  --primary-foreground: oklch(0.98 0.01 82);

  /* Indygo — secondary / status */
  --secondary: oklch(0.36 0.16 267);
  --secondary-foreground: oklch(0.97 0.01 82);

  /* Złote — accent highlights */
  --accent: oklch(0.79 0.12 87);
  --accent-foreground: oklch(0.22 0.02 60);

  /* Surfaces */
  --card: oklch(0.99 0.010 78);
  --card-foreground: oklch(0.22 0.02 60);
  --popover: oklch(0.99 0.010 78);
  --popover-foreground: oklch(0.22 0.02 60);

  /* Supporting structural */
  --muted: oklch(0.93 0.015 80);
  --muted-foreground: oklch(0.56 0.025 70);
  --border: oklch(0.88 0.022 75);
  --input: oklch(0.88 0.022 75);
  --ring: oklch(0.62 0.14 38);

  /* Destructive */
  --destructive: oklch(0.52 0.22 25);

  /* Sidebar — dark indigo base for staff panel */
  --sidebar: oklch(0.22 0.08 267);
  --sidebar-foreground: oklch(0.93 0.015 80);
  --sidebar-primary: oklch(0.62 0.14 38);
  --sidebar-primary-foreground: oklch(0.98 0.01 82);
  --sidebar-accent: oklch(0.30 0.10 267);
  --sidebar-accent-foreground: oklch(0.93 0.015 80);
  --sidebar-border: oklch(0.32 0.08 267);
  --sidebar-ring: oklch(0.62 0.14 38);

  /* Chart — hotel palette scale */
  --chart-1: oklch(0.62 0.14 38);
  --chart-2: oklch(0.36 0.16 267);
  --chart-3: oklch(0.79 0.12 87);
  --chart-4: oklch(0.68 0.12 160);
  --chart-5: oklch(0.65 0.15 15);
}
```

Delete the entire `.dark { ... }` block immediately after `:root`.

#### 2. Update `@utility bg-cosmic` to use CSS variables

**File**: `src/styles/global.css`

**Intent**: Replace the hardcoded hex gradient with references to the new sidebar CSS variables so the staff panel background tracks the token system rather than encoding its own colour values.

**Contract**: Replace the `@utility bg-cosmic` block:

```css
@utility bg-cosmic {
  background-image: linear-gradient(
    to bottom,
    var(--sidebar),
    var(--sidebar-accent),
    var(--sidebar)
  );
}
```

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npm run lint`
- Dev server starts without errors: `npm run dev`

#### Manual Verification

- Open the app in the browser; body background is warm cream (not white)
- Primary buttons are terakota (orange-red)
- The staff panel (`/dashboard`) retains its dark indigo gradient via `bg-cosmic`
- No visible `.dark` mode artefacts anywhere
- Contrast check: terakota on cream ≥ 3:1 (large text/UI) and primary-foreground on terakota ≥ 4.5:1 (body text)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Typography Tokens & Font Loading

### Overview

Add Google Fonts for Inter (body) and Playfair Display (headings). Define font variables in `:root`, map them in `@theme inline`, and apply them globally via `@layer base`.

### Changes Required

#### 1. Add Google Fonts link to base layout

**File**: `src/layouts/Layout.astro`

**Intent**: Load Inter and Playfair Display from Google Fonts CDN. Preconnect hints reduce connection latency; the stylesheet link pulls the font definitions.

**Contract**: Add the following two elements inside the `<head>` block, before the closing `</head>` tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@400;600;700&display=swap"
/>
```

#### 2. Define font variables in `:root`

**File**: `src/styles/global.css`

**Intent**: Add named font-stack variables to `:root` so the font pair has a single source of truth in the token system, parallel to colour tokens.

**Contract**: Add two variables at the top of the existing `:root` block:

```css
--font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
--font-heading: "Playfair Display", ui-serif, Georgia, serif;
```

#### 3. Map font tokens in `@theme inline`

**File**: `src/styles/global.css`

**Intent**: Expose font variables as Tailwind utilities (`font-sans`, `font-serif`) by mapping through `@theme inline`, consistent with how colour tokens are wired.

**Contract**: Add two lines at the bottom of the existing `@theme inline { ... }` block:

```css
--font-sans: var(--font-body);
--font-serif: var(--font-heading);
```

#### 4. Apply fonts globally via `@layer base`

**File**: `src/styles/global.css`

**Intent**: Set body text to Inter and all h1–h3 headings to Playfair Display via the base layer, so every page inherits the boutique typography without per-component class changes.

**Contract**: Update the existing `@layer base` block. The `body` rule already exists (`@apply bg-background text-foreground`) — add `font-family: var(--font-sans)` to it. Add a new h1–h3 rule:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
  }
  h1, h2, h3 {
    font-family: var(--font-serif);
  }
}
```

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npm run lint`
- Dev server starts without errors: `npm run dev`

#### Manual Verification

- Body text (paragraphs, nav items, labels) renders in Inter
- Any `<h1>`, `<h2>`, `<h3>` element on any page renders in Playfair Display with its characteristic high-contrast serifs
- No FOUT (flash of unstyled text) visible on page load in Chrome (fonts load from cache on second visit)
- The Tailwind utilities `font-sans` and `font-serif` correctly apply Inter and Playfair Display respectively (verify in DevTools computed styles)

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Hardcode Audit & Cleanup

### Overview

Run a systematic grep of `src/` for non-token colour usages. Fix every instance in components and layouts, replacing hardcoded Tailwind palette classes with semantic token utilities. The StaffLayout structural redesign is out of scope (D-03), but the two isolated hardcoded colour classes within it (`text-blue-200`, `bg-red-500`) must be migrated now.

### Changes Required

#### 1. Run the hardcode audit grep

**File**: `src/` (all `.tsx`, `.astro`, `.ts` files)

**Intent**: Discover every file that uses a raw Tailwind palette class instead of a semantic token.

**Contract**: Run the following command and document every match:

```powershell
Get-ChildItem -Recurse -Path src -Include *.tsx,*.astro,*.ts |
  Select-String -Pattern '\b(gray|blue|red|green|yellow|orange|purple|pink|slate|zinc|stone|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)-\d{2,3}' |
  Select-Object Filename, LineNumber, Line
```

Expected confirmed instances before running:
- `src/components/ui/LibBadge.astro:10`
- `src/layouts/GuestLayout.astro:21,24,25,26,29,30`
- `src/layouts/StaffLayout.astro:29,38`

#### 2. Fix `LibBadge.astro`

**File**: `src/components/ui/LibBadge.astro`

**Intent**: Migrate the badge from hardcoded indigo palette classes to the semantic `secondary` token, which now maps to indigo via the new token set.

**Contract**: Replace `bg-blue-900/50` with `bg-secondary/20` and `text-blue-200` with `text-secondary-foreground` on line 10.

#### 3. Fix `GuestLayout.astro`

**File**: `src/layouts/GuestLayout.astro`

**Intent**: Migrate all gray-* utility classes to semantic tokens so the guest panel inherits the cream/warm palette automatically.

**Contract**: Token substitution map:
- `bg-gray-50` → `bg-background`
- `bg-white` → `bg-card`
- `border-gray-200` → `border-border`
- `text-gray-900` → `text-foreground`
- `text-gray-800` → `text-foreground`
- `text-gray-600` → `text-muted-foreground`

#### 4. Fix `StaffLayout.astro` isolated hardcodes

**File**: `src/layouts/StaffLayout.astro`

**Intent**: Migrate the two colour classes that exist independently of the dark-panel aesthetic (the nav link colour and the pending badge colour) to semantic tokens. The surrounding dark-panel layout and `bg-cosmic` usage remain unchanged until D-03.

**Contract**:
- `text-blue-200` (nav links) → `text-sidebar-foreground`
- `bg-red-500` (pending badge) → `bg-destructive`

#### 5. Fix any additional instances found in the audit

**File**: whichever files the grep reveals

**Intent**: Leave no hardcoded palette class unresolved. For each new instance found, choose the closest semantic token from the updated palette.

**Contract**: Apply the same substitution pattern — identify the semantic role (background, action, status, muted, border) and pick the appropriate token. If a hardcoded colour has no obvious semantic mapping, document it as a comment and flag for D-02/D-03 review rather than guessing.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npm run lint`
- The grep command from step 1 returns zero matches under `src/components/` and zero matches under `src/layouts/` (excluding deliberate non-token usage documented in step 5)

#### Manual Verification

- Guest panel (`/guest/*` routes) renders with warm cream background and terakota accents — no gray surfaces visible
- Staff dashboard (`/dashboard`) retains dark indigo gradient, nav links are readable, pending badge is destructive red
- LibBadge renders with indigo tint (bg-secondary/20) instead of old blue-900
- No visual regressions on auth pages (`/auth/signin`, `/auth/signup`)

**Implementation Note**: Pause here for manual confirmation before considering the change complete.

---

## Testing Strategy

### Manual Testing Steps

1. Start dev server: `npm run dev`
2. Visit `/auth/signin` — form fields, buttons, and labels use boutique palette
3. Sign in as staff → visit `/dashboard` — dark indigo gradient, terakota/indigo buttons, no gray
4. Navigate to `/dashboard/generate-token` — form uses cream background, terakota CTA
5. Log out, visit a guest panel route — cream background, Playfair Display headings visible
6. Inspect a heading element in DevTools → `font-family` computed value shows Playfair Display
7. Inspect body in DevTools → `font-family` computed value shows Inter
8. Run the audit grep (Phase 3, step 1) — confirm zero matches in components/ and layouts/

### Visual Regression Check

Capture a screenshot of each major page before and after for comparison:
- `/auth/signin` (auth surface)
- `/dashboard` (staff panel)
- Any guest panel page

The roadmap risk note flags: "warto zrobić visual snapshot przed i po" — screenshots before Phase 1 and after Phase 3 are the minimal record.

## References

- Roadmap slice: `context/foundation/roadmap.md` (D-01, line 145–153)
- Token source file: `src/styles/global.css`
- Base layout: `src/layouts/Layout.astro`
- Known outlier: `src/components/ui/LibBadge.astro:10`
- Unlocked by this change: D-02 (`guest-panel-redesign`), D-03 (`reception-panel-polish`)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Palette & Radius Token Replacement

#### Automated

- [x] 1.1 TypeScript/lint check passes: `npm run lint`
- [x] 1.2 Dev server starts without errors: `npm run dev`

#### Manual

- [x] 1.3 Body background is warm cream in browser
- [x] 1.4 Primary buttons are terakota
- [x] 1.5 Staff panel retains dark indigo gradient via `bg-cosmic`
- [x] 1.6 Contrast check: terakota/cream ≥ 3:1, primary-foreground/terakota ≥ 4.5:1

### Phase 2: Typography Tokens & Font Loading

#### Automated

- [ ] 2.1 TypeScript/lint check passes: `npm run lint`
- [ ] 2.2 Dev server starts without errors: `npm run dev`

#### Manual

- [ ] 2.3 Body text renders in Inter
- [ ] 2.4 h1–h3 elements render in Playfair Display
- [ ] 2.5 `font-sans` / `font-serif` utilities verified in DevTools

### Phase 3: Hardcode Audit & Cleanup

#### Automated

- [ ] 3.1 TypeScript/lint check passes: `npm run lint`
- [ ] 3.2 Audit grep returns zero matches in `src/components/` and `src/layouts/`

#### Manual

- [ ] 3.3 Guest panel renders cream background, terakota accents, no gray surfaces
- [ ] 3.4 Staff dashboard retains dark gradient, nav links readable, badge destructive red
- [ ] 3.5 LibBadge renders with indigo tint
- [ ] 3.6 No visual regressions on auth pages

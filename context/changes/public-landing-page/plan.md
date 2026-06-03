# Public Landing Page — Implementation Plan

## Overview

Replace the template `Welcome.astro` component with a branded RoomPilot landing page: full-viewport hotel photography background, dark overlay, and a centered card containing the `SignInForm`. Logged-in staff are immediately redirected to `/dashboard`.

## Current State Analysis

`src/pages/index.astro` renders `src/components/Welcome.astro`, which displays "10x Astro Starter" branding with a cosmic dark background, animated orbs, star field, and feature cards. The design system (colors, typography, tokens) is fully established. `SignInForm.tsx` is production-ready and reusable. Middleware already resolves `context.locals.user` on every request, making auth-based redirects trivial in Astro frontmatter.

## Desired End State

- Visiting `/` as an unauthenticated user: full-viewport hotel photography, dark overlay, centered cream card with "RoomPilot" as H1, operational tagline, `SignInForm`, and a discreet "Nie masz konta?" link to `/auth/signup`
- Visiting `/` as a logged-in staff member: immediate redirect to `/dashboard`
- No template branding anywhere on the page; browser tab title reads "RoomPilot"

### Key Discoveries

- `src/components/Welcome.astro` is the only component to replace — `src/pages/index.astro` just imports it; no logic lives in the page itself
- `SignInForm` is `export default` from `@/components/auth/SignInForm` — use `client:load` directive; no `serverError` prop needed on landing (auth errors already land on `/auth/signin`)
- `Astro.locals.user` is available in page frontmatter with no extra setup; middleware populates it on every request
- `Layout.astro` has a hardcoded default title `"10x Astro Starter"` — update it to `"RoomPilot"` as part of this change
- The Unsplash image URL specified in the roadmap: `https://images.unsplash.com/photo-1445019980597-93fa8acb246c`

## What We're NOT Doing

- A separate `LandingLayout.astro` — base `Layout.astro` is sufficient
- Marketing/feature section (3 cards, "About RoomPilot" prose)
- Downloading/hosting the background image locally
- Sign-up gating or invite-code mechanism
- Dark mode variant
- Any backend API changes

## Implementation Approach

Two-file change + one line update in `Layout.astro`:

1. Create `src/components/LandingHero.astro` — all the visual structure (background, overlay, card, form, link)
2. Rewrite `src/pages/index.astro` frontmatter and template to add auth redirect and swap `Welcome` → `LandingHero`
3. Update the default title in `Layout.astro`

`LandingHero` is a pure Astro static component — no React needed at this level; only the embedded `SignInForm` needs `client:load`.

---

## Phase 1: LandingHero Component

### Overview

Create the new visual landing page component with hotel background, dark overlay, and the sign-in card. This phase is self-contained — no page routing changes.

### Changes Required

#### 1. New hero component

**File**: `src/components/LandingHero.astro`

**Intent**: Provide the full visual structure of the landing page: full-viewport background image, translucent dark overlay, and a centered card with brand identity + sign-in form.

**Contract**:
- Root element: `<section>` with `class="relative min-h-screen"` and inline `style` for `background-image`, `background-size: cover`, `background-position: center`
- Unsplash URL: `https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=1920&q=80&fit=crop`
- Dark overlay: `<div class="absolute inset-0 bg-black/60" />` (or `bg-black/55` — tune for readability)
- Card wrapper: `<div class="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">`, child card: `class="bg-card border-border w-full max-w-sm rounded-xl border p-8 shadow-xl"`
- Card contents in order:
  1. `<h1>` with text "RoomPilot" — serif font applies automatically via CSS `h1` selector
  2. `<p>` tagline — "Zaloguj się, by zarządzać usługami gości" — `class="text-muted-foreground mt-1 mb-6 text-sm"`
  3. `<SignInForm client:load />` (default import from `@/components/auth/SignInForm`)
  4. Sign-up link paragraph below the form: discreet `text-muted-foreground text-xs text-center mt-4` — "Nie masz konta?" + `<a href="/auth/signup">` link

#### 2. Default title in Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Update the fallback page title from the template default to the product name so every page that omits a title reads "RoomPilot" in the browser tab.

**Contract**: Change line 10 — `const { title = "10x Astro Starter" }` → `const { title = "RoomPilot" }`.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run lint`

#### Manual Verification

- Open `/` in browser — see full-viewport hotel photography with dark overlay
- Card with "RoomPilot" H1, tagline, email/password form, and "Nie masz konta?" link is visible and readable against the overlay
- Form submits correctly (POST `/api/auth/signin`) — use test credentials
- Browser tab reads "RoomPilot"
- On mobile (360px) — card fills width with padding, photo still covers the viewport

**Implementation Note**: After completing this phase and verifying manually, confirm before proceeding.

---

## Phase 2: Wire index.astro

### Overview

Replace the `Welcome` import with `LandingHero` in `index.astro` and add the auth-based redirect so logged-in staff bypass the landing entirely.

### Changes Required

#### 1. Rewrite index.astro

**File**: `src/pages/index.astro`

**Intent**: Make `/` route-aware: redirect authenticated staff to `/dashboard`, and display the new `LandingHero` for everyone else. Remove all template imports.

**Contract**:
- Frontmatter: import `LandingHero` from `@/components/LandingHero.astro`; check `Astro.locals.user` — if truthy, `return Astro.redirect('/dashboard')`
- Template: `<Layout>` wrapping `<LandingHero />`; no `title` prop needed (default "RoomPilot" from Phase 1)
- Remove `Welcome` import entirely

### Success Criteria

#### Automated Verification

- Type check passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Logged-in staff visiting `/` — browser redirects to `/dashboard` without flash of landing page
- Logged-out user visiting `/` — sees LandingHero normally
- Signing in from landing page → successful auth → lands on `/dashboard`
- Auth error (wrong password) → redirected to `/auth/signin` with error message (expected behavior — no regression)
- "Nie masz konta?" link navigates to `/auth/signup` successfully
- No `Welcome.astro` content or "10x Astro Starter" copy visible anywhere

**Implementation Note**: After completing this phase and all automated verification passes, do a full end-to-end sign-in flow test before closing.

---

## Testing Strategy

### Manual Testing Steps

1. Clear session, open `/` — hotel photo with overlay and sign-in card
2. Enter invalid credentials → verify redirect to `/auth/signin` with error (no regression)
3. Enter valid credentials → verify redirect to `/dashboard`
4. While logged in, open `/` → verify redirect to `/dashboard` (no flash)
5. Click "Nie masz konta?" → verify navigation to `/auth/signup`
6. Check on 360px viewport — card readable, no overflow

## References

- Roadmap D-00: `context/foundation/roadmap.md`
- Background image: `https://images.unsplash.com/photo-1445019980597-93fa8acb246c`
- SignInForm: `src/components/auth/SignInForm.tsx:8` (Props interface — `serverError?: string | null`)
- Layout: `src/layouts/Layout.astro:10` (title default to update)
- Middleware auth: `src/middleware.ts:6` (PROTECTED_ROUTES + `context.locals.user` assignment)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: LandingHero Component

#### Automated

- [x] 1.1 Type check passes: `npm run lint` — 34707fc

#### Manual

- [x] 1.2 Hotel photography with overlay visible on `/` — 34707fc
- [x] 1.3 Card with H1, tagline, form, sign-up link — readable and functional — 34707fc
- [x] 1.4 Browser tab reads "RoomPilot" — 34707fc
- [x] 1.5 Card renders correctly on 360px viewport — 34707fc

### Phase 2: Wire index.astro

#### Automated

- [x] 2.1 Type check passes: `npm run lint` — 34707fc
- [x] 2.2 Build succeeds: `npm run build` — 34707fc

#### Manual

- [x] 2.3 Logged-in staff redirected from `/` to `/dashboard` — 34707fc
- [x] 2.4 Full sign-in flow from landing → `/dashboard` — 34707fc
- [x] 2.5 Auth error from landing → `/auth/signin` with error (no regression) — 34707fc
- [x] 2.6 "Nie masz konta?" navigates to `/auth/signup` — 34707fc

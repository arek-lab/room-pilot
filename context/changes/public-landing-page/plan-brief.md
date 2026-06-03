# Public Landing Page — Plan Brief

> Full plan: `context/changes/public-landing-page/plan.md`

## What & Why

Replace the template "10x Astro Starter" starter page at `/` with a branded RoomPilot landing: hotel background photography, dark overlay, and a centered sign-in card. The product needs a real identity before any public-facing usage — the cosmic template has no relation to the hospitality domain.

## Starting Point

`src/pages/index.astro` renders `src/components/Welcome.astro`, a dark-cosmic template with animated orbs and feature cards for "Authentication Ready / Modern Stack / Developer Experience". The design system (colors, typography, tokens) and `SignInForm.tsx` component are fully production-ready.

## Desired End State

A visitor to `/` sees a full-viewport Unsplash hotel photo with a dark overlay and a cream card centered on screen. The card holds the "RoomPilot" logotype, an operational tagline, a working sign-in form, and a quiet link to `/auth/signup`. Logged-in staff who visit `/` are redirected to `/dashboard` without seeing the landing.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Page structure | Hero-only (no feature sections) | Roadmap D-00 specifies "minimal landing"; staff who already know the product don't need education |
| Form placement | Cream card centered over overlay | High contrast with dark bg; reuses `bg-card`/`border-border` design system pattern |
| Authenticated UX | Redirect to `/dashboard` | Zero-friction UX — staff skip the landing entirely |
| Navigation | None (no header/topbar) | Minimalism matches roadmap spec; no links to surface |
| Copy | Short and operational ("Zaloguj się, by zarządzać usługami gości") | Internal tool, not a sales page |
| Sign Up access | Discreet link under form | `/auth/signup` exists; keeps escape hatch without advertising open registration |
| Background on mobile | Full-screen on all sizes | One CSS background rule; `background-position: center` handles cropping |
| Image source | External Unsplash URL | Roadmap already specified the photo; no binary in repo for MVP |

## Scope

**In scope:**
- New `src/components/LandingHero.astro` component
- Rewrite of `src/pages/index.astro` (redirect + swap component)
- Update default title in `src/layouts/Layout.astro` ("10x Astro Starter" → "RoomPilot")

**Out of scope:**
- Marketing/feature section
- Local hosting of background image
- Sign-up gating or invite codes
- New API routes or DB changes
- Dark mode

## Architecture / Approach

Pure Astro static component + one-line frontmatter redirect. `LandingHero.astro` owns the visual structure (CSS background image, overlay div, card shell). `SignInForm` is embedded with `client:load` — the only interactive island. Auth redirect is handled in `index.astro` frontmatter using `Astro.locals.user` (already populated by middleware on every request). No new layout variant needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. LandingHero Component | New hero component + Layout title update | Overlay opacity vs. card contrast on real photo |
| 2. Wire index.astro | Auth redirect + component swap in route | Redirect flash if Astro SSR renders before redirecting |

**Prerequisites:** None — design system and `SignInForm` are already production-ready  
**Estimated effort:** ~1 session, 2 phases (30–60 min)

## Open Risks & Assumptions

- Unsplash URL may require auth or rate-limit in future — acceptable for MVP, revisit if hosting moves to production domain
- `Astro.redirect()` in frontmatter runs server-side in SSR mode (Cloudflare Workers) — no client-side flash expected, but verify in preview build

## Success Criteria (Summary)

- Visiting `/` shows hotel photography + branded sign-in card (no template content)
- Successful sign-in from landing redirects to `/dashboard`
- Logged-in staff visiting `/` land directly on `/dashboard`

# Design Token Foundation — Plan Brief

> Full plan: `context/changes/design-token-foundation/plan.md`

## What & Why

Replace the neutral shadcn starter palette with a Moroccan boutique hotel colour set, add a bespoke font pair, and eliminate every hardcoded Tailwind colour class from the codebase. This is the prerequisite for D-02 (guest panel redesign) and D-03 (staff panel polish) — without a clean token foundation those changes would be painting over a blank default rather than building on an intentional brand.

## Starting Point

All tokens live in `src/styles/global.css` — 28 CSS custom properties in `:root` (currently all neutral grays) plus an `@theme inline` block that maps them to Tailwind utilities. Shadcn components reference only semantic classes (`bg-primary`, `text-muted-foreground`) so a `:root` rewrite cascades everywhere automatically. One confirmed hardcoded outlier: `LibBadge.astro:10`. Two layouts (`GuestLayout.astro`, `StaffLayout.astro`) also carry raw palette classes that the audit will fix.

## Desired End State

Open any page of the app and it shows warm cream backgrounds, terakota call-to-action buttons, indigo status indicators, and gold highlights. Headings render in Playfair Display; body text in Inter. The staff panel retains its dark indigo gradient (now token-driven). Running the audit grep against `src/` returns zero matches.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Dark mode | Remove entirely | No toggle UI exists and defining 28 dark boutique variants adds cost with no user-visible value. |
| Token role mapping | Terakota=primary, Indygo=secondary, Kremowe=background, Złote=accent | Terakota as the CTA colour drives visual hierarchy; indigo maps naturally to status states already used in the product. |
| Font pair | Inter (body) + Playfair Display (headings) | Proven boutique-hotel editorial pairing; both Google Fonts free; Playfair's high-contrast serifs suit the Moroccan aesthetic. |
| Serif application | `@layer base` rule on h1–h3 globally | Zero per-component work — every heading auto-inherits boutique feel without touching any page file. |
| Font loading | Google Fonts `<link>` in `Layout.astro` | No build overhead; Cloudflare Workers serves the HTML; fonts come from CDN cache on repeat visits. |
| Border radius | 0.75rem (up from 0.625rem) | Slightly rounder feel suits the warm, welcoming boutique aesthetic without becoming pill-shaped. |
| Hardcode audit scope | Full `src/` grep | The roadmap guarantee is "no component uses default shadcn colors after this change" — a partial audit cannot fulfil that. |

## Scope

**In scope:**
- Rewrite `src/styles/global.css` `:root` with boutique OKLCH palette
- Delete `.dark` block
- Update `--radius` to 0.75rem
- Update `@utility bg-cosmic` to use sidebar CSS variables
- Add Google Fonts link to `src/layouts/Layout.astro`
- Add font variables to `:root`, `@theme inline`, and `@layer base`
- Full hardcode audit + fixes in `LibBadge.astro`, `GuestLayout.astro`, `StaffLayout.astro` (isolated classes only)

**Out of scope:**
- Custom spacing scale (Tailwind defaults remain)
- Dark mode palette variants
- StaffLayout structural redesign (D-03)
- `@fontsource` self-hosting
- `components.json` baseColor field (runtime-irrelevant)
- Any visual layout changes to pages

## Architecture / Approach

Single-file token replacement (`global.css`) cascades to all shadcn components automatically. Font loading is a 2-file change (`Layout.astro` + `global.css`). Phase 3 is a mechanical grep-and-replace: find every hardcoded colour class, substitute the closest semantic token from the new palette. Ordering is strict — palette tokens must land before the audit so replacements have real values to target.

```
global.css :root (Phase 1)
    └── @theme inline (maps vars → Tailwind utilities)
        └── all shadcn components (cascade, no edits needed)

Layout.astro <head> (Phase 2)
    └── Google Fonts loaded for Inter + Playfair Display

src/ grep (Phase 3)
    └── LibBadge.astro, GuestLayout.astro, StaffLayout.astro partial fixes
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Palette & Radius | Boutique OKLCH palette live in all shadcn components; dark mode removed; bg-cosmic token-driven | OKLCH starting values need visual contrast verification — tweak until WCAG AA passes |
| 2. Typography | Inter body + Playfair Display h1–h3 loaded and applied globally | FOUT on first load; acceptable on pilot hotel with small audience |
| 3. Hardcode Audit | Zero raw palette classes in src/; guest/staff layouts use semantic tokens | Audit may surface more instances than the 3 known — budget time to assess each |

**Prerequisites:** S-04 done (per roadmap), but the token change itself has no code dependencies — it can be prepared and reviewed against any branch state.
**Estimated effort:** ~1 session across 3 short phases. Phase 1 is ~30 min (single file rewrite + browser check). Phase 2 is ~20 min. Phase 3 depends on audit findings — 30–60 min.

## Open Risks & Assumptions

- OKLCH values specified are starting values — contrast ratios (terakota on cream, gold on cream) must pass WCAG AA verification before the phase is signed off. Adjust lightness if needed.
- `StaffLayout.astro` carries additional hardcoded white/opacity classes (`border-white/10`, `bg-black/20`, `bg-white/10`) that are structural to the dark-panel design and are left for D-03. The audit should document rather than blindly migrate these.

## Success Criteria (Summary)

- Every page background is warm cream; every primary CTA is terakota; headings are in Playfair Display — visible without any developer tooling.
- `npm run lint` passes clean after all three phases.
- The audit grep returns zero matches in `src/components/` and `src/layouts/`.

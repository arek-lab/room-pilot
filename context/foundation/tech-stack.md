---
starter_id: 10x-astro-starter
package_manager: npm
project_name: room-pilot
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: false
---

## Why this stack

RoomPilot is a solo-built, 3-week MVP for a hotel guest portal — small scale, short timeline, and TypeScript-first discipline. The recommended default for (web-app, js) is the 10x Astro Starter: Astro 6 + React 19 + Supabase (PostgreSQL + auth) + Cloudflare Pages. Three load-bearing factors drove the pick: (1) auth is required for both QR-token guest access and staff email/password login — Supabase ships auth out of the box; (2) the 3-week timeline favors a batteries-included, registered-CLI starter over assembling a stack from scratch; (3) Cloudflare Pages edge deploy aligns with the mobile-web requirement (fast global load on smartphones). Live order updates (FR-012) use 10-second polling — trivially supported by Astro API routes with no realtime infrastructure needed. AI concierge (FR-011) is implemented as an Astro server endpoint with the OpenAI SDK (`gpt-4o-mini`); not first-class in the starter but a one-time manual addition. CI runs on GitHub Actions with auto-deploy on merge to main — the standard path for a solo team.

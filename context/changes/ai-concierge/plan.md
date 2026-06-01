# AI Concierge Implementation Plan

## Overview

Add a floating AI concierge widget to the guest panel. Guests tap a fixed-position button (bottom-right), which opens a chat modal. They ask hotel-specific questions and receive answers from OpenAI GPT-4o mini. The last 6 messages are sent as context (multi-turn). Hotel data is hardcoded in a TypeScript config for the pilot; each request also injects the guest's room number and check-out date from the JWT for personalisation.

## Current State Analysis

- Guest panel (`/guest/panel.astro`) is live with SSR + `AddonList.tsx` React island (S-02/S-03 done)
- `GuestLayout.astro` wraps the panel in a slim header; `<slot />` is inside `<main>` — the floating widget must be added to `panel.astro`, not the layout, so it renders as a fixed overlay
- `createServiceRoleClient()` and `context.locals.guestToken` (carries `tokenId`, `roomNumber`, `packageId`, `checkOutDate`) are established
- Canonical guest API auth pattern in `src/pages/api/guest/orders/index.ts:1–15`; established React island pattern in `src/components/guest/AddonList.tsx:1–147`
- No AI SDK installed; `OPENAI_API_KEY` absent from env schema and `.env.example`
- `nodejs_compat` flag set in `wrangler.jsonc` — OpenAI SDK (fetch-based) is Cloudflare Workers compatible
- Env field pattern: `envField.string({ context: "server", access: "secret", optional: true })` in `astro.config.mjs:17–24`

## Desired End State

The guest panel shows a floating "Ask the concierge" button at the bottom-right corner. Tapping it opens a chat modal. The guest types a question ("What time does the restaurant open?"), sees a skeleton loader, and receives a hotel-specific answer. Follow-up questions work (last 6 messages sent as context). A friendly error message appears if the API fails. Closing the modal and re-opening preserves the current session history.

### Key Discoveries

- `src/pages/api/guest/orders/index.ts:1–15` — canonical pattern: check `guestToken` → 401, Zod parse → 400, DB error → 500
- `src/components/guest/AddonList.tsx:1–147` — React island pattern: `useState`, `fetch` calls, inline errors, no external state lib
- `src/layouts/GuestLayout.astro:33` — `<slot />` is inside `<main>` — floating widget in `panel.astro` uses CSS fixed positioning to escape the layout flow
- `astro.config.mjs:17–24` — all secrets follow `envField.string({ context: "server", access: "secret", optional: true })`

## What We're NOT Doing

- No streaming / SSE — full response only
- No conversation persistence in DB — client-side state only, lost on page reload
- No rate limiting or per-session quotas for MVP
- No package name lookup — room number + check-out date are sufficient personalisation
- No moderation layer
- No concierge access to order history or current orders

## Implementation Approach

Three sequential phases. Phase 1 establishes the SDK and hotel context foundation (no user-visible output). Phase 2 adds the server-side API endpoint. Phase 3 adds the client UI and wires it in. No database migrations required.

## Phase 1: OpenAI SDK + Hotel Context Config

### Overview

Install the `openai` npm package, declare `OPENAI_API_KEY` in the Astro env schema, and create the hardcoded hotel context TypeScript module. No user-visible output in this phase.

### Changes Required:

#### 1. Install OpenAI SDK

**File**: `package.json`

**Intent**: Add `openai` as a production dependency so API routes can import the `OpenAI` client class.

**Contract**: Run `npm install openai`. The package uses `fetch` internally and requires no Node.js builtins beyond what `nodejs_compat` provides — it is Cloudflare Workers compatible.

#### 2. Declare OPENAI_API_KEY in env schema

**File**: `astro.config.mjs`

**Intent**: Register the API key as a server-secret env field so it's accessible via `import { OPENAI_API_KEY } from "astro:env/server"` in API routes.

**Contract**: Add to the existing `env.schema` object:
```js
OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
```
Mirrors the existing `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GUEST_SESSION_SECRET` entries.

#### 3. Add OPENAI_API_KEY to .env.example

**File**: `.env.example`

**Intent**: Document the new secret so the setup instructions remain complete.

**Contract**: Append `OPENAI_API_KEY=###` to `.env.example`. Developers also need to add the real value to `.dev.vars` for local Cloudflare dev (gitignored, not committed).

#### 4. Create hotel context module

**File**: `src/lib/hotel-context.ts`

**Intent**: Single source of truth for pilot hotel data (identity, amenities, local area, house rules) and the function that assembles the full system prompt injected into every concierge request.

**Contract**: Export two things:
- `hotelContext` — typed object with fields: `name: string`, `address: string`, `checkInTime: string`, `checkOutTime: string`, `amenities: string[]`, `nearbyRestaurants: string[]`, `localAttractions: string[]`, `houseRules: string[]`. Populate with placeholder pilot hotel data (real values filled in before deployment).
- `buildSystemPrompt(guest: { roomNumber: string; checkOutDate: string }): string` — assembles the full system prompt. The prompt instructs the model to act as the hotel's concierge assistant, answer only based on the provided hotel information, avoid generic internet answers, stay concise, and acknowledge when it doesn't know something rather than guessing. Guest room number and check-out date are interpolated so the model can personalise responses (e.g. "You're in room 12, checking out on …").

### Success Criteria:

#### Automated Verification:

- `npm install` resolves without errors; `openai` appears in `node_modules`
- `npm run build` completes without errors after the SDK is installed
- `npm run typecheck` passes with `OPENAI_API_KEY` imported from `astro:env/server` in a test import
- `npm run lint` clean on new `hotel-context.ts`

#### Manual Verification:

- `.env.example` shows all five vars including `OPENAI_API_KEY`
- `src/lib/hotel-context.ts` exports `hotelContext` and `buildSystemPrompt` without TypeScript errors
- `buildSystemPrompt({ roomNumber: "101", checkOutDate: "2026-06-10" })` returns a non-empty string containing the room number

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Concierge API Endpoint

### Overview

Create `POST /api/guest/concierge` — the server-side bridge between the guest UI and OpenAI. Authenticates via `guestToken` cookie, validates the messages payload, injects the system prompt, calls GPT-4o mini, and returns a plain JSON response.

### Changes Required:

#### 1. Create concierge API route

**File**: `src/pages/api/guest/concierge.ts`

**Intent**: Accept a `POST` with a `messages` array from the `ConciergeWidget`, validate auth and payload, call OpenAI with the assembled system prompt, and return the assistant's reply or a user-friendly error.

**Contract**:
- `export const prerender = false`
- `export async function POST(context)` — follows `src/pages/api/guest/orders/index.ts` pattern
- Auth: `context.locals.guestToken === null` → `{ error: "Unauthorized" }` (401)
- Zod schema: `{ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).min(1).max(6) }` → 400 on failure with first error message
- System prompt: `buildSystemPrompt({ roomNumber, checkOutDate })` from `@/lib/hotel-context`; `roomNumber` and `checkOutDate` come from `context.locals.guestToken`
- Missing `OPENAI_API_KEY` (null/undefined after import): `{ error: "Concierge unavailable." }` (503)
- OpenAI call: `new OpenAI({ apiKey: OPENAI_API_KEY })`, model `"gpt-4o-mini"`, messages array = `[{ role: "system", content: systemPrompt }, ...validatedMessages]`
- Success: `{ content: string }` (200) with `choices[0].message.content`
- Null content or OpenAI SDK error: `{ error: "Concierge unavailable. Please try again." }` (502)

### Success Criteria:

#### Automated Verification:

- `npm run build` passes with the new route
- `npm run typecheck` passes
- `npm run lint` clean

#### Manual Verification:

- `POST /api/guest/concierge` with valid `guest_session` cookie + `{"messages":[{"role":"user","content":"What time is check-out?"}]}` → 200 `{content: "..."}` with a hotel-specific answer referencing the check-out time from `hotelContext`
- Same request without `guest_session` cookie → 401
- Payload with 7 messages → 400
- Message content > 2000 chars → 400
- `OPENAI_API_KEY` must be present in `.dev.vars` before testing; removing it and retrying → 503

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: ConciergeWidget React Island

### Overview

Create the floating chat button + modal component and wire it into the guest panel page. This is the only user-visible change in the entire plan.

### Changes Required:

#### 1. Create ConciergeWidget component

**File**: `src/components/guest/ConciergeWidget.tsx`

**Intent**: Render a fixed-position chat button at the bottom-right of the viewport. Clicking it opens a chat modal showing the conversation history, a text input, and a submit button. While the API call is in flight, show a skeleton loader in the message area. Conversations live in React state (lost on page reload). When the local history exceeds 6 messages, the oldest user + assistant pair is dropped before building the payload sent to the API.

**Contract**:
- No props — auth is cookie-based (sent automatically with `fetch`)
- State: `isOpen: boolean`, `messages: { role: "user" | "assistant"; content: string }[]`, `input: string`, `isLoading: boolean`, `error: string | null`
- On submit: append user message to `messages`, set `isLoading: true`, POST to `/api/guest/concierge` with the last 6 `messages` entries, append assistant reply, set `isLoading: false`; on error (`response.ok === false` or network error) set `error` inline below input
- Skeleton: one animated placeholder line visible while `isLoading`; disappears once the assistant message is appended
- Dismiss: close button (X), Escape key, backdrop click — all set `isOpen: false`
- Icons: `lucide-react` `MessageCircle` for the trigger button, `X` for close — matches existing icon usage
- Styling: `cn()` from `@/lib/utils`, Tailwind classes; trigger button uses `z-50` and `fixed bottom-6 right-6`

#### 2. Wire ConciergeWidget into guest panel

**File**: `src/pages/guest/panel.astro`

**Intent**: Mount the ConciergeWidget island on the guest panel page so it renders as a fixed overlay on top of all panel content.

**Contract**: Import `ConciergeWidget` from `@/components/guest/ConciergeWidget` in the frontmatter and render `<ConciergeWidget client:load />` inside the `<GuestLayout>` block, after the add-ons `<section>`. The component's own fixed-position CSS places it on top of all content regardless of DOM position.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes
- `npm run typecheck` passes
- `npm run lint` clean

#### Manual Verification:

- Guest panel shows a floating chat button at the bottom-right on mobile viewport
- Tapping the button opens the chat modal
- Sending a question shows a skeleton loader, then the assistant's answer
- Sending a follow-up question (e.g. "And what about the sauna?") shows the model has context from the previous reply
- After 4 exchanges (8 messages total), confirm the widget drops oldest pair and still responds correctly (no 400 error from API)
- Closing the modal (X, Escape, backdrop) hides it; re-opening shows the same session history
- An API error (kill dev server mid-request or pass invalid key) shows an inline error below the input — not a blank screen or crash
- Staff login, QR generation, add-on ordering, and QR auth flow all work normally (no regressions)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human.

---

## Testing Strategy

### Manual Testing Steps:

1. Add `OPENAI_API_KEY=<real key>` to `.dev.vars`, run `npm run dev`
2. Log in as staff, generate a guest token, complete the two-step QR flow
3. On the guest panel, verify the floating button is visible at bottom-right
4. Ask: "What time is check-out?" → confirm answer references the hotel's check-out time (not a generic "typically 11am")
5. Ask a follow-up question → confirm the assistant remembers context from the prior reply
6. Continue until 4 exchange pairs (8 messages) → confirm no 400 from API, cap works silently
7. Remove `OPENAI_API_KEY` from `.dev.vars`, restart dev server → ask a question → verify graceful 503 error displayed in UI, not blank screen
8. Verify add-on ordering still works (Place an order → pending badge → cancel → badge clears)

## Performance Considerations

GPT-4o mini typical latency: 0.5–2 s. Full-response mode means the guest waits this duration. The skeleton loader makes the wait feel intentional rather than broken. CPU cost on Workers is minimal — the time is spent waiting for the OpenAI network response, which does not count against the Workers CPU budget.

## References

- Upstream change: `context/changes/guest-qr-auth-panel/plan-brief.md`
- Upstream change: `context/changes/guest-order-addon/plan-brief.md`
- API auth pattern: `src/pages/api/guest/orders/index.ts:1–15`
- React island pattern: `src/components/guest/AddonList.tsx`
- Env schema pattern: `astro.config.mjs:17–24`
- GuestLayout slot: `src/layouts/GuestLayout.astro:33`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: OpenAI SDK + Hotel Context Config

#### Automated

- [x] 1.1 `npm install` resolves without errors; `openai` in node_modules — caf4d98
- [x] 1.2 `npm run build` completes without errors — caf4d98
- [x] 1.3 `npm run typecheck` passes — caf4d98
- [x] 1.4 `npm run lint` clean on new `hotel-context.ts` — caf4d98

#### Manual

- [ ] 1.5 `.env.example` shows all five vars including `OPENAI_API_KEY`
- [ ] 1.6 `hotel-context.ts` exports `hotelContext` and `buildSystemPrompt` without TS errors
- [ ] 1.7 `buildSystemPrompt({ roomNumber: "101", checkOutDate: "2026-06-10" })` returns a non-empty string containing the room number

### Phase 2: Concierge API Endpoint

#### Automated

- [x] 2.1 `npm run build` passes with new route
- [x] 2.2 `npm run typecheck` passes
- [x] 2.3 `npm run lint` clean

#### Manual

- [ ] 2.4 Valid guest session + `{"messages":[{"role":"user","content":"What time is check-out?"}]}` → 200 with hotel-specific answer
- [ ] 2.5 Request without `guest_session` cookie → 401
- [ ] 2.6 Payload with 7 messages → 400
- [ ] 2.7 Message content >2000 chars → 400
- [ ] 2.8 Missing `OPENAI_API_KEY` in `.dev.vars` → 503

### Phase 3: ConciergeWidget React Island

#### Automated

- [ ] 3.1 `npm run build` passes
- [ ] 3.2 `npm run typecheck` passes
- [ ] 3.3 `npm run lint` clean

#### Manual

- [ ] 3.4 Floating chat button visible at bottom-right on mobile viewport
- [ ] 3.5 Tapping button opens chat modal
- [ ] 3.6 Question → skeleton loader → hotel-specific answer
- [ ] 3.7 Follow-up question has context from prior reply
- [ ] 3.8 4 exchanges (8 messages) → oldest pair dropped, API still returns 200
- [ ] 3.9 Modal closes on X, Escape, backdrop; re-opening shows session history
- [ ] 3.10 API error shows inline error below input (not blank screen)
- [ ] 3.11 No regressions in QR auth, package display, and add-on ordering

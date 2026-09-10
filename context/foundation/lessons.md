# Project Lessons

Recurring rules and agent failure patterns discovered during implementation reviews.

---

## L1 — Null supabase client: always return an error response, never silently fall back to empty data

- **Context**: `src/pages/deck.astro` (SSR page), `src/pages/api/cards/[id].ts` (API route)
- **Problem**: When `createClient()` returns `null` (missing env vars), the SSR page falls back to `{ data: [], error: null }` and renders a silent empty state. The API route correctly returns 503. Two inconsistent patterns for the same failure condition — the silent empty state hides misconfiguration in production.
- **Rule**: Any code path that calls `createClient()` must check the result. If null: API routes return 503 `{ error: "Service unavailable" }`; SSR pages set `cardsError` (or equivalent) and render a visible error state. Never substitute empty data for a service-unavailable condition.
- **Applies to**: All Astro pages and API routes that call `createClient()`.

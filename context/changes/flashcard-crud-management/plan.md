# Flashcard CRUD Management (S-03) — Implementation Plan

## Overview

Adds the three missing CRUD operations for flashcards: manual creation from the dashboard, and inline edit + inline-confirm delete on the `/deck` collection page. Builds directly on the S-02 deck view and reuses the existing `POST /api/cards/save` endpoint for single-card creation.

## Current State Analysis

- `/deck` (deck.astro): SSR Astro page; lists `id, front, back` from Supabase as static HTML — no interactivity, no edit or delete controls.
- `POST /api/cards/save`: batch insert endpoint; validates auth, 1–1000 chars per field, returns `{saved: N}`. Can accept a single-element array, making it reusable for manual create without a new endpoint.
- `GenerateForm.tsx`: establishes the inline-edit pattern — `textarea` swap in-place, Zatwierdź / Anuluj buttons. DeckManager must follow this pattern.
- `Button` component: has `default`, `outline`, and `destructive` (red) variants.
- `ServerError.tsx` (`@/components/auth/ServerError`): reusable inline error component.
- `Flashcard` type in `types.ts`: includes `id`, `front`, `back`, `updated_at`.
- No `PUT` or `DELETE` endpoints exist for individual cards.
- Dashboard (`dashboard.astro`): static Astro page with links to `/generate` and `/deck`; no React islands.

## Desired End State

Dashboard has a "Utwórz fiszkę ręcznie" form (two `textarea` fields for front/back, `Dodaj fiszkę` button). On submit it calls `POST /api/cards/save` and on success redirects to `/deck`.

`/deck` page renders a `DeckManager` React island fed with SSR-fetched cards. Each card has `Edytuj` and `Usuń` buttons. Edit expands inline (textarea swap, Zatwierdź / Anuluj). Delete shows inline confirmation (Potwierdź / Anuluj — no modal). Both use optimistic updates with rollback + inline error on failure.

### Key Discoveries

- `POST /api/cards/save` accepts `{ cards: [{front, back}] }` with one element — no new create endpoint needed.
- Astro dynamic API routes expose the segment via `context.params.id` typed as `string | undefined`.
- `Button` `destructive` variant is available for the delete-confirm button.
- The `.update({...}).eq(...).eq(...)` chain in Supabase requires a nested chainable mock in Vitest tests — model after `save.test.ts` hoisting pattern.
- `updated_at` should be set explicitly in the PUT payload; table may not have an auto-update trigger.

## What We're NOT Doing

- No new `GET /api/cards` endpoint — `/deck` continues to read Supabase directly in SSR.
- No `POST /api/cards/create` — single-card create reuses the existing `save` endpoint.
- No bulk edit/delete — per-card only.
- No card search, filter, or pagination — full list, MVP.
- No React component unit tests — API endpoint tests are sufficient automated coverage for this slice.

## Implementation Approach

API layer first (Phase 1) so the new endpoints exist before the UI tries to call them. Then the create form (Phase 2) which is self-contained on the dashboard. Finally the deck management island (Phase 3) which calls the Phase 1 endpoints.

## Critical Implementation Details

**`context.params.id` is `string | undefined`** — Astro types the param as potentially undefined even in `[id].ts`. Validate it at the top of each handler and return 400 if missing; do not assume it's always present.

**Supabase chain mock in tests** — `.update().eq().eq()` and `.delete().eq().eq()` are fluent chains. The deepest `.eq()` call must return the resolved `{ error }` value. Use `vi.hoisted` to create a deep mock (see save.test.ts for the hoisting pattern), then reset the innermost mock's return value in `beforeEach` to control error vs. success scenarios.

**`CreateCardForm` calls `save` with an array wrapper** — the payload must be `{ cards: [{ front, back }] }`, not `{ front, back }`. Getting this wrong produces a 400 from the existing endpoint.

---

## Phase 1: PUT/DELETE API Endpoints

### Overview

Adds `PUT /api/cards/:id` (update front + back) and `DELETE /api/cards/:id` (remove card) as a single Astro dynamic route file. Both validate auth and ownership; RLS provides the second ownership layer at the database level.

### Changes Required

#### 1. New dynamic API route

**File**: `src/pages/api/cards/[id].ts`

**Intent**: Export `PUT` and `DELETE` handlers for a single card identified by URL param `id`. Both check authentication, validate `id` is present, and filter by `user_id` alongside RLS for defense in depth.

**Contract**:
- `PUT` parses `{ front, back }` from request body; validates both are non-empty strings ≤ 1000 chars after trim; calls `supabase.from('flashcards').update({ front, back, updated_at }).eq('id', id).eq('user_id', user.id)`; returns `{ updated: true }` on success or `{ error: string }` on 400/401/503/500.
- `DELETE` requires no body; calls `supabase.from('flashcards').delete().eq('id', id).eq('user_id', user.id)`; returns `{ deleted: true }` on success.
- Both return 401 when `context.locals.user` is null, 400 when `context.params.id` is falsy (PUT also 400 for invalid body/fields), 503 when `createClient` returns null, 500 on Supabase error.

#### 2. Tests for the new route

**File**: `src/pages/api/cards/[id].test.ts`

**Intent**: Verify auth guard, input validation, happy path, and DB error handling for both `PUT` and `DELETE` — following the `save.test.ts` hoisting pattern.

**Contract**: Test cases to cover:
- PUT returns 401 when user is null
- PUT returns 400 when `id` param is missing
- PUT returns 400 when `front` or `back` is empty/missing
- PUT returns 400 when `front` or `back` exceeds 1000 characters
- PUT returns 200 `{ updated: true }` on success; Supabase update called with trimmed values and `user_id`
- PUT returns 500 when Supabase returns an error
- DELETE returns 401 when user is null
- DELETE returns 200 `{ deleted: true }` on success; Supabase delete called with `id` and `user_id`
- DELETE returns 500 when Supabase returns an error

### Success Criteria

#### Automated Verification

- All tests in `[id].test.ts` pass: `npm run test` (or vitest run on the file)
- TypeScript compiles without errors: `npm run build` or `npx tsc --noEmit`
- Lint passes: `npm run lint`

#### Manual Verification

- `PUT /api/cards/<valid-id>` with a valid session and `{ front: "Q", back: "A" }` returns 200 and the card is updated in Supabase
- `DELETE /api/cards/<valid-id>` with a valid session returns 200 and the card is removed from Supabase
- Both endpoints return 401 when called without a valid session cookie

**Implementation Note**: After all automated tests pass, confirm manually that the endpoints behave as expected before proceeding to Phase 2.

---

## Phase 2: CreateCardForm Island + Dashboard Integration

### Overview

Adds a React island `CreateCardForm` to the dashboard that allows the user to create a single flashcard manually. On save, calls the existing `POST /api/cards/save` endpoint with a single-element array and redirects to `/deck`.

### Changes Required

#### 1. CreateCardForm React island

**File**: `src/components/cards/CreateCardForm.tsx`

**Intent**: Form with two `textarea` fields (front/back, 1–1000 chars), submit button, and inline error display. On success, navigates to `/deck` using `window.location.href` (same redirect pattern as `GenerateForm`).

**Contract**:
- Props: none (self-contained).
- State: `front: string`, `back: string`, `isSubmitting: boolean`, `error: string | null`.
- Submit disabled when either field is empty after trim or exceeds 1000 chars.
- On submit: POST `{ cards: [{ front: front.trim(), back: back.trim() }] }` to `/api/cards/save`. On `res.ok`: `window.location.href = '/deck'`. On failure: set `error` from response JSON `error` field or fallback string.
- Uses `Button` and `ServerError` components; matches textarea styling from `GenerateForm.tsx` (dark theme, ring-blue focus).
- UI labels in Polish: textarea placeholders "Przód (pytanie / prompt)" / "Tył (odpowiedź)", button label "Dodaj fiszkę", character counter `{n}/1000`.

#### 2. Dashboard update

**File**: `src/pages/dashboard.astro`

**Intent**: Render `CreateCardForm` island below the existing action links so users can create a card without leaving the dashboard.

**Contract**: Import `CreateCardForm` and add `<CreateCardForm client:load />` inside the dashboard card div, below the existing `<div class="mt-6 flex flex-col items-center gap-2">` block. The island hydrates on load (user lands on dashboard expecting to interact immediately).

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors
- Lint passes

#### Manual Verification

- Dashboard at `/dashboard` shows a create form below the existing links
- Submitting a valid front + back creates the card and redirects to `/deck` where the new card appears at the top
- Submitting with an empty field keeps the submit button disabled
- Submitting while exceeding 1000 chars keeps the submit button disabled
- A simulated network failure (DevTools → offline) shows the inline error message

**Implementation Note**: Verify the redirect and card appearance in `/deck` before proceeding to Phase 3.

---

## Phase 3: DeckManager Island + /deck Integration

### Overview

Converts the static card list in `/deck` to a `DeckManager` React island that receives SSR-fetched cards as initial props and manages edit/delete operations with optimistic state updates.

### Changes Required

#### 1. DeckManager React island

**File**: `src/components/cards/DeckManager.tsx`

**Intent**: Renders the card list with per-card edit and delete controls. Manages local state derived from SSR props. Edit and delete use optimistic updates — local state changes immediately, and Supabase errors roll back to the previous state with an inline per-card error message.

**Contract**:
- Props: `cards: Array<{ id: string; front: string; back: string }>`.
- Local state: each card tracked as `{ id, front, back, mode: "display" | "editing" | "confirming-delete", editFront, editBack, error: string | null }`.
- **Display mode**: shows `front`, `back`, `Edytuj` (outline) and `Usuń` (outline) buttons; if `error` is set, shows it inline below the card content.
- **Editing mode**: shows two `textarea` fields (`editFront`, `editBack`), `Zatwierdź` button (disabled when either field empty after trim), `Anuluj` button. Matches textarea styling from `GenerateForm.tsx`. On `Zatwierdź`:
  1. Optimistically update `front`/`back` in local state and switch to display mode.
  2. `PUT /api/cards/:id` with `{ front: editFront.trim(), back: editBack.trim() }`.
  3. On failure: restore previous `front`/`back` and set per-card `error`.
- **Confirming-delete mode**: shows card content with strikethrough styling, "Czy na pewno chcesz usunąć tę fiszkę?" text, `Potwierdź` button (destructive variant), `Anuluj` button. On `Potwierdź`:
  1. Optimistically remove card from local state list.
  2. `DELETE /api/cards/:id`.
  3. On failure: restore card to list and set per-card `error` on the restored entry.
- When list is empty (after all cards deleted, or empty initial state): render the same "Nie masz jeszcze żadnych fiszek" message that exists in the current static template.

#### 2. /deck page update

**File**: `src/pages/deck.astro`

**Intent**: Replace the static card list with the `DeckManager` island, passing SSR-fetched cards as props. The SSR data fetch stays identical to the current implementation.

**Contract**: Import `DeckManager`; replace the conditional `{cards.length === 0 ? (...) : (<ul>...</ul>)}` block with `<DeckManager cards={cards ?? []} client:load />`. The heading (count) and "← Generuj więcej" link remain as static Astro elements above the island. The `cardsError` branch also remains: only render `DeckManager` when `!cardsError`.

### Success Criteria

#### Automated Verification

- TypeScript compiles without errors
- Lint passes

#### Manual Verification

- `/deck` page loads with existing cards and shows Edytuj + Usuń buttons on each card
- Clicking `Edytuj` expands inline textarea edit; `Zatwierdź` saves and collapses; card shows updated text immediately; Supabase row updated
- Clicking `Anuluj` on edit restores original text without API call
- Clicking `Usuń` shows inline Potwierdź/Anuluj confirmation; `Potwierdź` removes card from list and from Supabase
- Clicking `Anuluj` on delete dismisses confirmation without deleting
- Simulated network failure on edit shows per-card error and restores original text
- Simulated network failure on delete shows per-card error and restores the card in the list
- Deleting all cards shows the "Nie masz jeszcze żadnych fiszek" empty state

**Implementation Note**: Test the rollback paths explicitly (DevTools → offline before confirming edit/delete) before marking this phase done.

---

## Testing Strategy

### Unit Tests

- `src/pages/api/cards/[id].test.ts`: auth, validation (empty fields, >1000 chars, missing id), happy path (verifying trimmed values and user_id passed to Supabase), DB error path — for both PUT and DELETE.

### Integration Tests

- None configured (no Vitest integration setup in project).

### Manual Testing Steps

1. Create a card from the dashboard; confirm redirect to `/deck` and new card at top of list.
2. Edit a card inline; confirm UI updates immediately and Supabase row reflects the change.
3. Cancel an edit; confirm original text is restored with no API call made.
4. Delete a card with inline confirm; confirm it disappears from the list and is gone from Supabase.
5. Cancel a delete; confirm the card remains.
6. Test offline rollback for both edit and delete (DevTools → Network → Offline before confirming).
7. Verify the dashboard create form rejects empty front or back (button disabled).
8. Verify the dashboard create form rejects front or back > 1000 chars (button disabled).

## References

- Roadmap entry: `context/foundation/roadmap.md` — S-03
- Prerequisite: `context/changes/atomic-save-to-deck/plan.md`
- Reused endpoint: `src/pages/api/cards/save.ts`
- Inline-edit pattern reference: `src/components/generate/GenerateForm.tsx`
- Test pattern reference: `src/pages/api/cards/save.test.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PUT/DELETE API Endpoints

#### Automated

- [x] 1.1 All tests in `[id].test.ts` pass — 781c7e5
- [x] 1.2 TypeScript compiles without errors — 781c7e5
- [x] 1.3 Lint passes — 781c7e5

#### Manual

- [x] 1.4 PUT endpoint updates card in Supabase with valid session — 781c7e5
- [x] 1.5 DELETE endpoint removes card from Supabase with valid session — 781c7e5
- [x] 1.6 Both endpoints return 401 without a valid session cookie — 781c7e5

### Phase 2: CreateCardForm Island + Dashboard Integration

#### Automated

- [x] 2.1 TypeScript compiles without errors — 70309f3
- [x] 2.2 Lint passes — 70309f3

#### Manual

- [x] 2.3 Dashboard shows create form below existing links — 70309f3
- [x] 2.4 Valid submission creates card and redirects to `/deck` with new card visible — 70309f3
- [x] 2.5 Empty field keeps submit button disabled — 70309f3
- [x] 2.6 Over-1000-char input keeps submit button disabled — 70309f3
- [x] 2.7 Network failure shows inline error message — 70309f3

### Phase 3: DeckManager Island + /deck Integration

#### Automated

- [x] 3.1 TypeScript compiles without errors — d361b03
- [x] 3.2 Lint passes — d361b03

#### Manual

- [x] 3.3 `/deck` shows Edytuj + Usuń on each card — d361b03
- [x] 3.4 Edit inline saves and collapses with updated text — d361b03
- [x] 3.5 Cancel edit restores original text without API call — d361b03
- [x] 3.6 Delete confirm removes card from list and Supabase — d361b03
- [x] 3.7 Cancel delete leaves card intact — d361b03
- [x] 3.8 Offline rollback on edit shows error and restores text — d361b03
- [x] 3.9 Offline rollback on delete shows error and restores card — d361b03
- [x] 3.10 Empty collection shows empty-state message — d361b03

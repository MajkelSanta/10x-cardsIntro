# Flashcard CRUD Management (S-03) — Plan Brief

> Full plan: `context/changes/flashcard-crud-management/plan.md`

## What & Why

S-03 delivers the three missing CRUD operations for flashcards: manual card creation from the dashboard, and inline edit + inline-confirm delete on the collection page. After S-01 (AI generation) and S-02 (accept/save gate), users have cards in their deck but no way to correct errors or add cards without using the AI flow — S-03 closes that gap.

## Starting Point

`/deck` renders cards as static HTML with no controls. The only write path is `POST /api/cards/save` (batch insert, used by the AI flow). No `PUT` or `DELETE` endpoints exist. Dashboard is a static page with navigation links only.

## Desired End State

Dashboard has an inline "Utwórz fiszkę ręcznie" form; submitting it saves the card and redirects to `/deck`. The `/deck` collection page has per-card `Edytuj` and `Usuń` buttons: edit expands inline (matching the `GenerateForm` pattern), delete shows a two-button inline confirmation. Both use optimistic updates — the UI reflects the change immediately and rolls back with an error message if the server call fails.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Create form location | Dashboard (`/dashboard`) | PRD US-02 explicitly places manual creation on the dashboard | Plan |
| Edit UX | Inline textarea swap | Matches established `GenerateForm.tsx` pattern — no new components needed | Plan |
| Delete confirmation | Inline Potwierdź/Anuluj (no modal) | Guards against accidental deletion without requiring a Dialog component | Plan |
| Post-create navigation | Redirect to `/deck` | Consistent with GenerateForm redirect; user sees new card at top of list | Plan |
| Deck state management | Optimistic update + rollback | Zero page flicker on success; per-card rollback on failure | Plan |
| Single-card create endpoint | Reuse `POST /api/cards/save` | Already validates 1–1000 chars and handles FSRS zero-state for single-element arrays | Plan |
| Field length limits | 1–1000 chars per field | Matches existing save endpoint validation — no asymmetry between AI and manual cards | Plan |

## Scope

**In scope:** `PUT /api/cards/:id`, `DELETE /api/cards/:id`, `CreateCardForm` island, `DeckManager` island, dashboard + `/deck` page updates, API unit tests.

**Out of scope:** GET /api/cards endpoint, bulk operations, search/filter/pagination, React component unit tests, new shadcn Dialog component.

## Architecture / Approach

New dynamic API route `src/pages/api/cards/[id].ts` exports `PUT` and `DELETE`. Two new React islands: `CreateCardForm` (dashboard, calls existing `save` endpoint) and `DeckManager` (/deck, calls new PUT/DELETE endpoints). `/deck` fetches cards SSR and passes them as props to `DeckManager`; all mutations are client-side with optimistic state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. PUT/DELETE endpoints | `PUT` + `DELETE` for `/api/cards/:id` with auth, validation, tests | Supabase chain mock complexity in Vitest |
| 2. CreateCardForm + dashboard | Inline form on dashboard; redirect to `/deck` on save | None — reuses existing endpoint and redirect pattern |
| 3. DeckManager + /deck | Inline edit/delete with optimistic updates on collection page | Rollback state management for concurrent failures |

**Prerequisites:** S-02 done (deck page exists, save endpoint exists, RLS enabled on flashcards table).
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- `updated_at` may not have a database-level auto-update trigger — the plan sets it explicitly in the PUT payload as a safe fallback.
- The `destructive` Button variant is visually distinct (red) — confirmed present in `button.tsx`; no new shadcn installs needed.

## Success Criteria (Summary)

- User can create a card from the dashboard and see it appear in `/deck` immediately after redirect.
- User can edit any card inline on `/deck` and see the update reflected without a page reload.
- User can delete any card with a single confirmation step; card disappears from the list immediately; network failure restores it with an error message.

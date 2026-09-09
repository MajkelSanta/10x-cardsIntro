# Plan Brief: Atomic Save to Deck (S-02)

**Change:** atomic-save-to-deck | **Phases:** 3 | **Date:** 2026-09-09

## What we're building

Per-card accept/edit/reject review UI on `/generate`, atomic save to Supabase, and a `/deck` collection page.

## Key decisions

- `CardReview` local type in `GenerateForm.tsx` (not `types.ts`) — component-only state
- FSRS initial values hardcoded (all zeros, state: 0, due: NOW) — `ts-fsrs` not installed; S-04 owns algorithm
- Post-save redirect via `window.location.href = '/deck'` — no Astro navigate() in client islands
- `/deck` queries Supabase server-side directly — no GET /api/cards route (S-03 scope)
- Re-generate overwrites review state without warning — consistent with S-01

## Phase summary

| Phase | What | Files |
|-------|------|-------|
| 1 | Per-card review UI: accept/edit/reject buttons, inline edit, save button | `GenerateForm.tsx`, `GenerateForm.test.tsx` |
| 2 | POST /api/cards/save endpoint: auth + validation + atomic INSERT | `save.ts` (new), `save.test.ts` (new) |
| 3 | /deck page + middleware guard + dashboard link | `deck.astro` (new), `middleware.ts`, `dashboard.astro` |

## Insertion point

`GenerateForm.tsx:158-167` — `{cards.length > 0 && <ul>...}` block replaced entirely with `{reviews.length > 0 && ...}` block using `CardReview[]` state.

## Atomicity

Supabase `.from('flashcards').insert([...])` = single SQL INSERT. All rows land or none do. Save error shown inline if insert fails.

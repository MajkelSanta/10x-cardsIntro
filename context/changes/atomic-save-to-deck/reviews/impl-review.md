<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Atomic Save to Deck (S-02)

- **Plan**: context/changes/atomic-save-to-deck/plan.md
- **Scope**: Phase 3 of 3 (full plan)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Unbounded insert: no cap on card count

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cards/save.ts:25
- **Detail**: `cards` is validated as a non-empty array but has no upper bound. An authenticated client can POST an arbitrarily large array (e.g. 100k cards) producing one huge INSERT. The generator emits ~10 cards, but `save.ts` trusts the raw client payload, not generator output. Bounds the request/DB write cost.
- **Fix**: After the non-empty check, add `if (cards.length > 100) return 400 "Too many cards"`. One guard, matches the existing validation style.
- **Decision**: PENDING

### F2 — No length limit on front/back

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cards/save.ts:34
- **Detail**: Cards are validated for non-empty strings but not max length. The `flashcards` `front`/`back` columns are unbounded `text`, so a client can persist multi-megabyte strings. `generate.ts:40` already enforces a 5000-char cap on source text — the save boundary has no equivalent.
- **Fix**: In the per-card validation loop, reject `c.front.trim().length > 1000 || c.back.trim().length > 1000` with a 400.
- **Decision**: PENDING

### F3 — deck.astro ignores the query error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/deck.astro:8
- **Detail**: The query destructures only `{ data: cards }` and never inspects `error`. On a DB/network failure `cards` is `null` and the page silently renders the empty state ("Nie masz jeszcze żadnych fiszek") — indistinguishable from a genuinely empty collection, masking backend errors. Every API endpoint in the change handles `error` explicitly (e.g. save.ts:67); the SSR page does not.
- **Fix**: Destructure `error` too and render a distinct error state (or at least log it) when set.
- **Decision**: PENDING

### F4 — Unplanned Layout.astro change (dark mode)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/layouts/Layout.astro:1
- **Detail**: `<html lang="en">` → `<html lang="en" class="dark">`, added in the Phase 1 commit (b66c1ff) as a "dark mode fix". Not in the plan's Changes Required or What-We're-NOT-Doing. Benign and committed transparently — it makes the dark Tailwind variants the whole feature's styling relies on actually apply app-wide — but it silently restyles every existing page (dashboard, auth, generate).
- **Fix**: Document as a plan addendum noting the app-wide dark-mode enablement, so future reviews treat it as intended scope rather than drift.
- **Decision**: PENDING

### F5 — No pagination / unbounded select on /deck

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/deck.astro:10-14
- **Detail**: The deck query fetches the user's entire collection with no `limit`/`range`. Fine at MVP scale, but the list and payload grow unbounded per user over time. S-03 (CRUD) is the natural place to add paging.
- **Fix**: Add a `.limit(...)` or `.range(...)` when the collection can realistically grow large (defer to S-03).
- **Decision**: PENDING

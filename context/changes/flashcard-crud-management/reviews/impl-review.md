<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Flashcard CRUD Management (S-03) — Post-Triage

- **Plan**: context/changes/flashcard-crud-management/plan.md
- **Scope**: All phases (1–3 of 3) — post-triage state
- **Date**: 2026-09-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Verification

- `npx vitest run` — 68/68 pass ✅
- `npm run lint` — clean ✅
- `npm run build` — complete ✅

## Findings

### F1 — deck.astro: null supabase silently renders empty deck (L1 violation)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/deck.astro:9–16
- **Detail**: When `createClient()` returns `null` (missing env vars), the ternary at line 9 falls to `{ data: [], error: null }`. `cardsError` stays `null` and `DeckManager` renders with an empty list — the user sees "Nie masz jeszcze żadnych fiszek" instead of a service error. This violates **L1** (recorded in `context/foundation/lessons.md`): _null supabase must produce a visible error state, never empty data_. Note: this is a pre-existing pattern not introduced by this change; in the first review (F9) the user chose "record as lesson only" rather than fix immediately.
- **Fix A ⭐ Recommended**: Guard the null supabase case explicitly — set `cardsError = "service-unavailable"` when `!supabase`, leaving the ternary only for the `!user` fallback (which middleware should prevent from reaching this page anyway).
  - Strength: Eliminates the L1 violation; the existing `cardsError` render branch already handles this correctly.
  - Tradeoff: 3-line change — minimal risk.
  - Confidence: HIGH — the pattern is already in place; just needs the guard split.
  - Blind spot: None significant.
- **Fix B**: Accept as known risk — the middleware already blocks unauthenticated users, and missing env vars only occur in misconfigured environments where the whole app would be broken anyway.
  - Strength: Zero code change.
  - Tradeoff: L1 rule stays violated; confusing silent empty state persists for misconfigured deploys.
  - Confidence: MED — acceptable if the team consciously accepts this edge case.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — jawny guard `if (!supabase) cardsError = true`; naruszenie L1 zamknięte; lint OK; build OK

---

### F2 — [id].ts: count === null bypasses the 404 not-found guard on DELETE

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cards/[id].ts:134
- **Detail**: `if (count === 0)` at line 134 catches the 0-rows-matched case but not `count === null`. Supabase types `count` as `number | null` even when `count: "exact"` is set; if the driver ever returns `{ error: null, count: null }` (no documented scenario, but possible in edge-case driver versions), the endpoint would return 200 `{ deleted: true }` despite potentially deleting nothing.
- **Fix**: Change `if (count === 0)` → `if (!count)` to catch both 0 and null in a single guard.
- **Decision**: FIXED — count === 0 → !count; lint OK; 68/68 pass

### F3 — [id].test.ts: no 503 test for null createClient on PUT or DELETE

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/cards/[id].test.ts
- **Detail**: The PUT and DELETE suites cover 401, 400, 200, 404, and 500 but not the 503 path (when `createClient` returns null). The sibling `save.test.ts` also lacks this test. Now that L1 is a named project rule, the 503 branch should have explicit coverage so a regression (someone removing the null guard) is caught by CI.
- **Fix**: Add two tests — one for PUT 503, one for DELETE 503 — by making `createClientMock` return null and asserting the 503 response.
- **Decision**: FIXED — dodano PUT 503 i DELETE 503 testy; 70/70 pass

### F4 — DeckManager: edit and delete use asymmetric optimistic patterns

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/cards/DeckManager.tsx:45–92
- **Detail**: `handleSaveEdit` updates state first then calls the API; on failure it reverts to the previous values _at the same position_. `handleDelete` removes the card first then calls the API; on failure it _appends_ the card to the bottom of the list (explicit design decision from the first review, F2). The two flows are structurally inconsistent: edit preserves position on rollback; delete does not. For a short deck this is acceptable. For a long deck, a failed delete causes confusing reordering. Note: the append-to-end was an explicit Fix A from the previous triage.
- **Fix**: Accept as-is (design decision already made), or align by switching delete to pessimistic: keep the card in state with `isDeleting: true` styling and only remove it after a successful DELETE response — consistent with how edit uses `isSubmitting`.
- **Decision**: POMINIĘTO — świadoma decyzja projektowa z poprzedniego triage (Fix A)

### F5 — DeckManager: no ARIA feedback during confirming-delete mode

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/cards/DeckManager.tsx:153–176
- **Detail**: The confirming-delete branch shows strikethrough text and a confirmation prompt but provides no ARIA signal (no `role="alert"`, no `aria-live`, no `aria-label` on the destructive Potwierdź button). Screen reader users get no indication that a delete confirmation is active.
- **Fix**: Add `role="alert"` to the confirmation paragraph (line 155) so screen readers announce it immediately, and add `aria-label="Potwierdź usunięcie fiszki"` to the destructive Button.
- **Decision**: FIXED — role="alert" + aria-label dodane; lint OK; 70/70 pass

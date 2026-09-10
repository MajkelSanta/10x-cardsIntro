<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Flashcard CRUD Management (S-03)

- **Plan**: context/changes/flashcard-crud-management/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-09-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations

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

### F1 — Silent 0-row match returns 200 on PUT and DELETE

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cards/[id].ts:63–73, 103–113
- **Detail**: `supabase.update().eq("id", id).eq("user_id", user.id)` and the equivalent DELETE chain return `{ error: null }` whether 1 row or 0 rows matched. If the card doesn't exist, or belongs to another user (RLS handles ownership at DB level but JS check happens first), the endpoint returns `{ updated: true }` / `{ deleted: true }` with 200 — indistinguishable from a real update. The client UI has no way to surface "card not found" to the user.
- **Fix A ⭐ Recommended**: Chain `.select("id")` on the update call, check `data?.length === 0` → return 404 `{ error: "Card not found" }`. Same on DELETE using Supabase's `count` option.
  - Strength: Gives clients a real 404 path; costs one extra column in the DB response (negligible). Matches correctness expectations for a REST-ish API.
  - Tradeoff: Slightly more complex chain; DELETE with Supabase count requires checking `count === 0` on the response.
  - Confidence: HIGH — Supabase supports `.select()` on update and `{ count: "exact" }` on delete; both are documented and used across the ecosystem.
  - Blind spot: Haven't verified whether DeckManager's current error handling would surface a 404 correctly — it checks `!res.ok` which covers all non-2xx, so it would work.
- **Fix B**: Accept silent success as intentional idempotent semantics.
  - Strength: Simpler; ownership is enforced at DB level via RLS anyway — a non-existent or foreign card just silently no-ops, which is harmless.
  - Tradeoff: Client can't distinguish "saved" from "nothing happened" — could lead to confusing silent failures if the card was already deleted.
  - Confidence: MED — acceptable for MVP if the team consciously accepts idempotent semantics.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added .select("id") to PUT chain + count: "exact" to DELETE; 404 path added; 2 new tests added; 66/66 pass

### F2 — Stale cardIndex in optimistic delete rollback  <!-- DECISION: FIXED via Fix A — removed cardIndex param; rollback appends to end -->

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/cards/DeckManager.tsx:60–84
- **Detail**: `handleDelete(card, index)` captures `index` from the `.map()` render at click time. The card is then removed optimistically from state (line 61). If the fetch fails, the rollback calls `setCardStates(prev => { next.splice(cardIndex, 0, ...) })` — but `cardIndex` was captured from the pre-removal array. If any concurrent state change (a rapid second delete, an edit completing) altered the array between click and rollback, the card re-inserts at the wrong position or appends past the last valid index. In practice this is a low-probability race in a single-user app, but the logic is provably incorrect under concurrency.
- **Fix A ⭐ Recommended**: Remove the `cardIndex` parameter entirely; on rollback just append the card to the end of the list.
  - Strength: No stale closure; correct in all concurrent scenarios; 2-line change; position loss on failure is a minor UX trade-off most users won't notice.
  - Tradeoff: Card re-appears at the bottom rather than its original position after a failed delete.
  - Confidence: HIGH — the simpler pattern is used throughout the codebase for rollback.
  - Blind spot: None significant.
- **Fix B**: Track a `mode: "deleting"` state with reduced opacity; only remove the card from state after a confirmed successful DELETE response.
  - Strength: Card stays in its original position; cleaner mental model aligned with the `confirming-delete` pattern.
  - Tradeoff: Requires a new CardMode value, additional branch in the JSX, and a visual "in-flight" state.
  - Confidence: MED — non-trivial change; could be done in a follow-up.
  - Blind spot: Need to verify the disabled state on the Potwierdź button during in-flight request (similar to F3).
- **Decision**: FIXED via Fix A — removed cardIndex param; rollback appends to end

### F3 — No per-card submit guard on edit (double-submit possible)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/cards/DeckManager.tsx:37–57
- **Detail**: `handleSaveEdit` is async but there is no per-card `isSubmitting` flag. After clicking Zatwierdź, the card transitions to display mode optimistically (line 38) — but if the user clicks another card's Zatwierdź at the same time, or if the component re-renders before the fetch resolves, a second PUT can be triggered with stale `prevFront`/`prevBack` captured from the first click. `CreateCardForm.tsx` (line 10 + 83) sets `isSubmitting` to disable the button during in-flight requests; DeckManager doesn't replicate this per-card.
- **Fix**: Add `isSubmitting: boolean` to `CardState` (default `false`); set it `true` before `handleSaveEdit`, reset to `false` in the `finally` block or on rollback. Disable Zatwierdź while `card.isSubmitting`.
- **Decision**: FIXED — added isSubmitting: boolean to CardState; Zatwierdź disabled while card.isSubmitting

---

### F4 — DELETE test does not assert user_id filter

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/cards/[id].test.ts:171–174
- **Detail**: The DELETE happy-path test "calls supabase.delete with id and user_id filters" only asserts `expect(mockDelete).toHaveBeenCalled()` — it does not verify the `user_id` filter was applied. The PUT test at lines 128–129 explicitly checks both `eq("id", ...)` and `eq("user_id", ...)`. A regression that dropped the `user_id` constraint from DELETE would not be caught. Root cause: the `mockDelete` chain in `vi.hoisted` uses an anonymous `vi.fn()` for the first `.eq()` call, making it unassertable.
- **Fix**: In `vi.hoisted`, expose the first `.eq()` call of the delete chain as a named mock (e.g. `mockEqDeleteOuter`), then assert `mockEqDeleteOuter.toHaveBeenCalledWith("id", "card-99")` and `mockEqDelete.toHaveBeenCalledWith("user_id", "user-1")` in the happy-path test.
- **Decision**: FIXED — dodano mockEqDeleteOuter jako nazwany mock; asercja sprawdza .eq("id", "card-99") i .eq("user_id", "user-1"); 66/66 pass

### F5 — Error state cleared when user switches mode after a failed operation

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/cards/DeckManager.tsx:194–196
- **Detail**: `{card.error && <ServerError message={card.error} />}` is rendered only in the display-mode branch. After a failed edit (card rolls back to display + error set), if the user immediately clicks Edytuj again, `mode` switches to `editing` and the error message disappears — the user sees no indication that the previous save failed. Same for a failed delete rollback: if the user quickly tries to delete again, the error is gone.
- **Fix**: Either (a) also render `card.error` inside the editing and confirming-delete branches above the action buttons, or (b) explicitly clear `error` when the user enters edit/delete mode via `updateCard(id, { mode: "editing", error: null })`.
- **Decision**: FIXED — dodano error: null do obu przejść trybu (Edytuj → editing, Usuń → confirming-delete); zachowanie intencjonalne; lint OK; 66/66 pass

### F6 — Unplanned change to generate.astro

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/generate.astro:13
- **Detail**: A `← Dashboard` navigation link was added to `generate.astro`. None of the three plan phases mention this file. The change is a 4-line benign UX improvement (mirrors the `← Generuj więcej` link on `/deck`) and introduces no logic or dependencies — but it is untracked scope.
- **Fix**: No code change needed. Either accept as an informal addendum (note in plan's "What We're NOT Doing" was silent on navigation) or document it in the plan for audit trail completeness.
- **Decision**: ZAAKCEPTOWANO jako uzupełnienie — dodano notatkę Addendum w planie; brak zmian w kodzie

### F7 — JS clock used for updated_at instead of DB-side timestamp

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cards/[id].ts:58
- **Detail**: `updated_at: new Date().toISOString()` uses the Cloudflare Worker runtime clock. If the table had a `DEFAULT now()` trigger, omitting `updated_at` from the payload would be more reliable. Workers generally have accurate system time but the pattern diverges from what a DB trigger would guarantee. Low severity for this app.
- **Fix**: Omit `updated_at` from the update payload entirely if the `flashcards` table has an `ON UPDATE` trigger; otherwise accept the JS clock.
- **Decision**: POMINIĘTO — niskie znaczenie dla MVP; zegar JS akceptowalny

### F8 — Unvalidated id param returns 500 on malformed UUID input

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/cards/[id].ts:60, 101
- **Detail**: `id` is validated only for presence (`if (!id)`). A non-UUID string (e.g. `"not-a-uuid"`) is forwarded to Postgres which will throw a cast error, surfacing as a 500. Parameterized queries prevent SQL injection, but the caller gets a confusing 500 instead of a clean 400. Save.ts avoids this because IDs are always server-generated.
- **Fix**: Add a UUID format check (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) after the presence check; return 400 `{ error: "Invalid card id" }` on mismatch.
- **Decision**: FIXED — dodano walidację UUID regex do PUT i DELETE; 400 zamiast 500 dla błędnego formatu; 2 nowe testy; ID testowe zmienione na prawidłowe UUID; lint OK; 68/68 pass

### F9 — Null supabase client silently returns empty deck (pre-existing)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/deck.astro:9–16
- **Detail**: Pre-existing pattern (not introduced by Phase 3): when `createClient` returns `null` (missing env vars), the ternary falls through to `{ data: [], error: null }` — the page silently renders an empty deck with no error. The API route `[id].ts` (introduced in Phase 1) returns 503 in the same scenario. The two patterns are inconsistent. This is a pre-existing issue unrelated to the current change; flagged for awareness.
- **Fix**: Out of scope for this change. Consider adding a `cardsError` branch or a warning log when `!supabase` in a follow-up.
- **Decision**: ZAPISANO JAKO LEKCJĘ — L1 dodane do context/foundation/lessons.md; reguła: null supabase zawsze → widoczny błąd, nigdy cicha pusta lista

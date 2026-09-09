<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Atomic Save to Deck (S-02)

- **Plan**: context/changes/atomic-save-to-deck/plan.md
- **Mode**: Deep
- **Date**: 2026-09-09
- **Verdict**: SOUND
- **Findings**: 0 critical  2 warnings  0 observations

## Verdicts

| Dimension             | Verdict |
|-----------------------|---------|
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓, Progress↔Phase 3/3 ✓, 11 bullets = 11 checkboxes ✓

## Findings

### F1 — window.location.href test strategy not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — GenerateForm.test.tsx
- **Detail**: happy-dom (vitest.config.ts:4) ignores href assignment as a no-op. Zero precedent in codebase (`grep -rn "window.location" src/` = 0 results). Implementer would hit a wall without a mocking strategy.
- **Fix A ⭐ Recommended**: `vi.stubGlobal('location', { href: '' })` before render — same idiom as `vi.stubGlobal('fetch', ...)` already in the test file (line 20); `vi.unstubAllGlobals()` in `afterEach` (line 27) already covers cleanup.
- **Decision**: FIXED via Fix A — added `vi.stubGlobal` pattern to plan.md test description

### F2 — handleSave missing try-catch — isSaving stuck on network error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — handleSave function
- **Detail**: Original plan's handleSave handled `!res.ok` correctly but had no try-catch. If `fetch` throws (network disconnect, CORS), `isSaving` stays `true` permanently; save button disabled forever; no error shown. `handleSubmit` in the same file wraps its fetch in try-catch — same pattern needed here.
- **Fix**: Wrap handleSave body in try-catch; in catch: `setSaveError("Nie udało się połączyć z serwerem.")` + `setIsSaving(false)` via finally.
- **Decision**: FIXED — added try/catch/finally to handleSave code block in plan.md

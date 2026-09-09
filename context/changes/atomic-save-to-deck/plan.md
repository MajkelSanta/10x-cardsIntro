# Plan: Atomic Save to Deck (S-02)

- **Change ID:** atomic-save-to-deck
- **PRD refs:** FR-003, FR-005, US-01
- **Status:** planned
- **Created:** 2026-09-09

---

## Desired End State

User can review AI-generated draft cards on `/generate` with per-card accept/edit/reject UI, save all accepted cards atomically to their deck, and browse their full collection on a new `/deck` page.

**End-state checklist:**
- Each draft card shows Akceptuj / Edytuj / Odrzuć buttons (pending state)
- Editing a card: "Edytuj" → inline textareas → "Zatwierdź" (accepted) / "Anuluj" (pending)
- Rejected card: opacity-50 + strikethrough text + "Przywróć" button → pending
- Accepted card: green border + "Cofnij" button → pending; "Edytuj" still available
- "Zapisz zaakceptowane (N)" button: disabled when 0 accepted; N shows live count
- Save: POST /api/cards/save → on success redirect to `/deck`
- Save error: inline error message below save button (consistent with generate error UX)
- `/deck`: shows user's full flashcard collection (front/back, newest first, card count)
- `/deck` is auth-protected (unauthenticated → /auth/signin)
- Re-generating while mid-review: clears all card state without warning (consistent with S-01)

**Atomicity guarantee:** Supabase `from('flashcards').insert([...])` is a single SQL INSERT — all rows land or none do. If the insert fails, no partial state persists; saveError is shown inline.

---

## Current State Analysis

- `GenerateForm.tsx:158-167` renders `cards: DraftCard[]` as read-only `<ul>/<li>` — zero action buttons, zero per-card state
- `DraftCard = { front: string; back: string }` in `src/types.ts`; `Flashcard` (full DB entity with FSRS fields) also defined there
- `flashcards` table deployed (migration `20260906120000_flashcard_schema.sql`) with all FSRS fields; RLS enabled, 4 per-user policies
- `src/pages/api/cards/` has only `generate.ts` + `generate.test.ts` — no save endpoint
- `PROTECTED_ROUTES = ["/dashboard", "/generate"]` in `src/middleware.ts:4` — `/deck` not yet added
- `dashboard.astro` shows user email + sign-out; no link to /deck
- No Supabase INSERT in codebase yet — S-02 introduces the first
- `ts-fsrs` not in `package.json` — FSRS initial values hardcoded (all numeric zeros, state: 0, due: NOW, last_review: null)
- Vitest test suite: 25/25 passing (`npm test`)

---

## What We're NOT Doing

- No CRUD on /deck (manual create, edit, delete) — S-03
- No spaced-repetition review session — S-04
- No GET /api/cards route — `/deck.astro` queries Supabase server-side directly
- No "Start Review" CTA on /deck — dead UI until S-04 exists
- No confirmation dialog before re-generating over unsaved review state — consistent with S-01 behavior
- No bulk-accept button — parked per roadmap
- No card count widget on /dashboard — S-03 scope
- No pagination / `limit` on the `/deck` query (F5 from impl review) — collection is fetched whole; paging deferred to S-03 when CRUD lands

---

## Decisions and Assumptions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `CardReview` local type defined inside `GenerateForm.tsx`, not in `types.ts` | Not shared across files; `types.ts` holds API-boundary/DB types only |
| D2 | FSRS initial values hardcoded (stability: 0, difficulty: 0, state: 0, reps: 0, lapses: 0, elapsed_days: 0, scheduled_days: 0, due: NOW, last_review: null) | `ts-fsrs` not installed; S-04 owns algorithm integration |
| D3 | Post-save redirect via `window.location.href = '/deck'` from React island | No Astro `navigate()` available client-side in a `client:load` island |
| D4 | `editFront`/`editBack` always initialized from `front`/`back`; save payload always uses them | Uniform access path — whether edited or not |
| D5 | `/deck.astro` queries Supabase directly server-side (no GET /api/cards endpoint) | Simpler for S-02; S-03 can add the route when CRUD needs it |
| D6 | POST /api/cards/save rejects empty-string front/back after trim | Defense at API boundary even though UI prevents it |
| D7 | `Layout.astro` `<html>` gets `class="dark"` app-wide (impl-review F4 addendum) | The whole S-02 UI is styled for dark mode; committed in Phase 1 (b66c1ff) but originally out-of-plan. Recorded here so it is intended scope, not drift. Restyles every existing page (dashboard/auth/generate) — accepted. |
| D8 | Save endpoint caps at 100 cards/request and 1000 chars/field (impl-review F1+F2) | Bounds the write surface; generator emits ~10 cards, source text is already capped at 5000 chars in `generate.ts`. Both are hard 400s at the API boundary. |

---

## Phase 1: Per-card review UI

### Overview

Replace the read-only card list in `GenerateForm.tsx` with per-card review UI. Cards continue to stream in as `DraftCard[]`, but are immediately mapped to `CardReview[]` (status: `pending`). Each card renders differently based on its status. A save button appears below the list and fires POST /api/cards/save.

### Changes Required

**`src/components/generate/GenerateForm.tsx`**

- Above the component, add:
  ```typescript
  type CardStatus = "pending" | "accepted" | "editing" | "rejected";
  interface CardReview {
    front: string;
    back: string;
    status: CardStatus;
    editFront: string;
    editBack: string;
  }
  ```
- Replace `const [cards, setCards] = useState<DraftCard[]>([])` with `const [reviews, setReviews] = useState<CardReview[]>([])`; add `const [isSaving, setIsSaving] = useState(false)` and `const [saveError, setSaveError] = useState<string | null>(null)`
- In `handleSubmit`: at stream-start, replace `setCards([])` with `setReviews([]); setSaveError(null)`; when a parsed card arrives, replace `setCards(prev => [...prev, card])` with `setReviews(prev => [...prev, { front: card.front, back: card.back, status: "pending", editFront: card.front, editBack: card.back }])`
- Replace the `{cards.length > 0 && <ul>...</ul>}` block (lines 158–167) with a `reviews.length > 0 &&` block:
  - `<ul>` mapping over `reviews` with per-status rendering:
    - **pending**: card border, front/back text, 3 buttons: Akceptuj (→ accepted), Edytuj (→ editing), Odrzuć (→ rejected)
    - **accepted**: green border (`border-emerald-500/50`), front/back text, buttons: Cofnij (→ pending), Edytuj (→ editing)
    - **editing**: textareas pre-filled with `editFront`/`editBack` (onChange updates them), buttons: Zatwierdź (→ accepted using current textarea values), Anuluj (→ pending, resets editFront/editBack to front/back)
    - **rejected**: `opacity-50 line-through` on text, single button: Przywróć (→ pending)
  - Below `</ul>`: `acceptedCount` derived constant (`reviews.filter(r => r.status === "accepted").length`); Button "Zapisz zaakceptowane ({acceptedCount})" disabled when `acceptedCount === 0 || isSaving || isGenerating`, onClick fires `handleSave`
  - Below save button: `{saveError && <ServerError message={saveError} />}`
- Add `handleSave` function (wrap body in try-catch so network errors don't leave `isSaving: true`):
  ```typescript
  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = reviews
        .filter((r) => r.status === "accepted")
        .map((r) => ({ front: r.editFront, back: r.editBack }));
      const res = await fetch("/api/cards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: payload }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setSaveError(data.error ?? "Nie udało się zapisać fiszek.");
        return;
      }
      window.location.href = "/deck";
    } catch {
      setSaveError("Nie udało się połączyć z serwerem.");
    } finally {
      setIsSaving(false);
    }
  };
  ```

**`src/components/generate/GenerateForm.test.tsx`**

- Existing tests continue to pass (they use `screen.getByText` for card content — still works after state rename)
- Add suite **"GenerateForm — per-card review UI"**:
  - Generated card shows "Akceptuj", "Edytuj", "Odrzuć" buttons
  - "Akceptuj" → card shows "Cofnij" + "Edytuj"; "Akceptuj" disappears
  - "Odrzuć" → card gets opacity class; "Przywróć" appears; other buttons disappear
  - "Przywróć" on rejected → back to pending (3 buttons visible again)
  - "Edytuj" → textareas appear with original front/back values
  - "Anuluj" in edit mode → returns to pending (textareas gone, 3 buttons back)
  - "Zatwierdź" in edit mode → card accepted (textareas gone)
- Add suite **"GenerateForm — save button"**:
  - "Zapisz zaakceptowane" disabled when 0 cards accepted
  - "Zapisz zaakceptowane" enabled when ≥1 card accepted; label includes count
  - Save calls POST /api/cards/save with accepted cards only
  - Save with edited card → payload contains `editFront`/`editBack` values
  - Save success (200) → `window.location.href` set to `/deck`; test with `const loc = { href: '' }; vi.stubGlobal('location', loc)` before render, then assert `loc.href === '/deck'` after click — same idiom as `vi.stubGlobal('fetch', ...)` already in the file; `vi.unstubAllGlobals()` in `afterEach` already covers cleanup
  - Save error (500) → saveError message displayed; isSaving cleared

### Success Criteria

#### Automated Verification:
- `npm run lint` passes (no ESLint errors in modified files)
- `npm test` passes — all new GenerateForm review UI and save button tests green; 0 regressions in existing 25 tests

#### Manual Verification:
- Log in → /generate → paste ≥50 chars → generate → each card shows Akceptuj/Edytuj/Odrzuć; accept some, reject one (Przywróć works), edit one (Zatwierdź/Anuluj work); save button shows correct accepted count; clicking save fires POST request

---

## Phase 2: Save API endpoint

### Overview

Create `POST /api/cards/save`: auth check → validate `{ cards: {front, back}[] }` → atomic Supabase INSERT with FSRS initial values → `{ saved: N }` or error.

### Changes Required

**`src/pages/api/cards/save.ts`** (new file)

```typescript
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await context.request.json()) as { cards?: unknown };
  const { cards } = body;

  if (!Array.isArray(cards) || cards.length === 0) {
    return new Response(JSON.stringify({ error: "cards must be a non-empty array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const card of cards) {
    const c = card as { front?: unknown; back?: unknown };
    if (typeof c.front !== "string" || typeof c.back !== "string" || !c.front.trim() || !c.back.trim()) {
      return new Response(JSON.stringify({ error: "Each card must have non-empty front and back" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const rows = (cards as { front: string; back: string }[]).map((card) => ({
    user_id: user.id,
    front: card.front.trim(),
    back: card.back.trim(),
    stability: 0,
    difficulty: 0,
    due: now,
    state: 0,
    reps: 0,
    lapses: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    last_review: null,
  }));

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save cards" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ saved: rows.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

**`src/pages/api/cards/save.test.ts`** (new file)

Test cases:
- 401 when `context.locals.user` is null
- 400 when `cards` key is missing from body
- 400 when `cards` is an empty array (`[]`)
- 400 when a card has empty string `front` (after trim)
- 400 when a card has empty string `back` (after trim)
- 200 + Supabase `.insert()` called with correct rows: `user_id`, trimmed `front`/`back`, and FSRS zero-values
- 200 returns `{ saved: N }` for N cards
- 500 when Supabase `.insert()` returns an error

Follow the mock pattern from `generate.test.ts` (mock `@/lib/supabase` and `astro:env/server`).

### Success Criteria

#### Automated Verification:
- `npm run lint` passes
- `npm test` passes — all 8 save.test.ts cases green; 0 regressions in existing tests

#### Manual Verification:
- Authenticated user: POST /api/cards/save with `{ cards: [{front: "Q", back: "A"}] }` → 200 `{ saved: 1 }`; verify row in Supabase with correct FSRS initial values

---

## Phase 3: /deck collection page

### Overview

Create `src/pages/deck.astro` (SSR, Supabase query server-side), add `/deck` to `PROTECTED_ROUTES`, and link to it from the dashboard.

### Changes Required

**`src/middleware.ts`**

- Line 4: add `"/deck"` to PROTECTED_ROUTES array → `["/dashboard", "/generate", "/deck"]`

**`src/pages/deck.astro`** (new file)

- SSR (no `export const prerender` — inherits `output: "server"`)
- Server-side: `createClient(Astro.request.headers, Astro.cookies)` → `supabase.from("flashcards").select("id, front, back").eq("user_id", Astro.locals.user!.id).order("created_at", { ascending: false })`
- Render using `src/layouts/Layout.astro`:
  - Header: "Twoja kolekcja ({cards.length} fiszek)"
  - Link: "← Generuj więcej" → /generate
  - If `cards.length === 0`: empty state message "Nie masz jeszcze żadnych fiszek. Wróć do generowania!"
  - Otherwise: list of cards, each showing `front` (bold/white) and `back` (muted)

**`src/pages/dashboard.astro`**

- Add a link "Przeglądaj kolekcję →" (or similar) pointing to `/deck`

### Success Criteria

#### Automated Verification:
- `npm run lint` passes (middleware.ts, deck.astro, dashboard.astro)

#### Manual Verification:
- Unauthenticated: navigate to /deck → redirect to /auth/signin
- Full flow: /generate → accept cards → save → redirected to /deck → cards appear with correct count header
- /deck with no saved cards → empty state message shown
- /dashboard → link to /deck visible and navigates correctly

---

## Phase 4: Address implementation review findings

### Overview

Remediation phase for the S-02 implementation review (`reviews/impl-review.md`, 2026-09-09). Hardens the save endpoint's write surface (F1, F2), surfaces DB failures on `/deck` instead of masking them as an empty collection (F3), and records the out-of-plan `Layout.astro` dark-mode change as intended scope (F4). Pagination (F5) is explicitly deferred to S-03 — see "What We're NOT Doing".

### Changes Required

**`src/pages/api/cards/save.ts`** — bound the write surface (F1 + D8, F2 + D8)

- **Intent (F1):** reject oversized batches so an authenticated client can't force one huge INSERT.
- **Contract (F1):** after the existing `!Array.isArray(cards) || cards.length === 0` guard, add a `cards.length > 100` branch returning `400` with `{ error: "Too many cards (max 100)" }`, same response shape as the sibling 400s.
- **Intent (F2):** cap per-field length so unbounded `text` columns can't store multi-megabyte strings.
- **Contract (F2):** extend the per-card validation loop (currently the `typeof`/`.trim()` check) so a trimmed `front` or `back` longer than 1000 chars returns `400` `{ error: "Card front/back too long (max 1000 characters)" }`. Keep it in the same loop — one pass, one 400 shape.

**`src/pages/deck.astro`** — stop masking query failures (F3)

- **Intent:** distinguish a real DB/network error from a genuinely empty collection instead of silently rendering the empty state.
- **Contract:** destructure `error` alongside `data` from the Supabase query (currently only `{ data: cards }` at line 8). When `error` is truthy, render a distinct error state (e.g. "Nie udało się wczytać kolekcji. Spróbuj ponownie.") rather than the "Nie masz jeszcze żadnych fiszek" empty state. The empty state stays reserved for `error == null && cards.length === 0`.

**`src/pages/api/cards/save.test.ts`** — cover the new guards

- **Intent:** lock in the two new 400 branches so they don't regress.
- **Contract:** add two cases following the existing mock pattern — (a) a `cards` array of length 101 → `400`; (b) a card whose `front` (or `back`) exceeds 1000 chars → `400`. Assert Supabase `.insert()` is **not** called in either case.

**`context/changes/atomic-save-to-deck/plan.md`** — F4 addendum (this file)

- **Intent:** record the Phase-1 `Layout.astro` `class="dark"` change as intended scope, not drift.
- **Contract:** captured as decision **D7** above — no code change; documentation only.

### Success Criteria

#### Automated Verification:

- `npm run lint` passes (save.ts, deck.astro, save.test.ts)
- `npm test` passes — new save.test.ts cap + length cases green; 0 regressions in existing 46 tests

#### Manual Verification:

- POST /api/cards/save with 101 cards → 400; with a >1000-char front → 400 (no row written)
- Simulated deck query failure renders the error state, not the empty-collection message; a real empty collection still shows the empty state

**Implementation Note**: After automated verification passes, pause for manual confirmation before considering the phase done.

---

## Progress

### Phase 1: Per-card review UI

#### Automated Verification:
- [x] 1.1 npm run lint passes — b66c1ff
- [x] 1.2 npm test passes — GenerateForm review UI + save button tests green; 0 regressions — b66c1ff

#### Manual Verification:
- [x] 1.3 /generate: per-card buttons work; accept/reject/edit/restore work; save button shows count; save fires POST — b66c1ff

### Phase 2: Save API endpoint

#### Automated Verification:
- [x] 2.1 npm run lint passes — 20e62cf
- [x] 2.2 npm test passes — all 8 save.test.ts cases green; 0 regressions — 20e62cf

#### Manual Verification:
- [x] 2.3 POST /api/cards/save authenticated → 200 {saved: N}; unauthenticated → 401 — 20e62cf

### Phase 3: /deck collection page

#### Automated Verification:
- [x] 3.1 npm run lint passes — 5dc214f

#### Manual Verification:
- [x] 3.2 /deck unauthenticated → redirect to /auth/signin — 5dc214f
- [x] 3.3 Full flow: save cards → /deck shows cards with correct count — 5dc214f
- [x] 3.4 Empty state: /deck with no cards shows empty state message — 5dc214f
- [x] 3.5 Dashboard: link to /deck visible and works — 5dc214f

### Phase 4: Address implementation review findings

#### Automated Verification:

- [x] 4.1 npm run lint passes (save.ts, deck.astro, save.test.ts)
- [x] 4.2 npm test passes — new save.test.ts cap + length cases green; 0 regressions

#### Manual Verification:

- [ ] 4.3 POST 101 cards → 400; POST card with >1000-char field → 400 (no row written)
- [ ] 4.4 deck.astro query failure renders error state (not empty-collection message)

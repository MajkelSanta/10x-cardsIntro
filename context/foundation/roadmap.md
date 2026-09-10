---
project: "10xCards"
version: 1
status: draft
created: 2026-09-05
updated: 2026-09-10
prd_version: 2
main_goal: speed
top_blocker: capacity
milestone_id: full-learning-loop
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xCards

> Derived from context/foundation/prd.md (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Full Learning Loop** — Status: open

- **Intent:** Ship every must-have capability required for the complete user journey: paste text → AI proposes draft cards → explicit accept/reject gate → cards saved to deck → manual CRUD management → spaced-repetition review session → account lifecycle with deletion. This milestone validates the core product hypothesis.
- **Source materials:** `context/foundation/prd.md` (v2)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-010, US-01–US-04

## Vision recap

Creating flashcards manually is time-consuming, which discourages adoption of spaced repetition — a proven learning technique based on reviewing material at increasing intervals as memory fades. 10xCards takes an AI-first approach through a single, opinionated loop: paste source material → see AI-proposed candidate cards → explicitly accept or reject each → study with a known SRS algorithm. No manual authoring required before you can begin.

The product wedge — the one trait that, if removed, makes 10xCards indistinguishable from a generic AI tool — is that every card must be both grounded in the learner's own pasted text AND gated through an explicit accept/reject step before it lands in the deck. AI proposes; the learner decides; the algorithm schedules. The target user is an upskilling professional (developer, doctor, lawyer) with dense source material and limited time.

## North star

**S-01: first-gated-generation** — User can paste text, trigger AI generation, and see AI-proposed draft candidate cards ready for review.

> "North star" here means the smallest end-to-end user-visible flow whose successful delivery proves the core product hypothesis. S-01 proves AI generation works; S-02 (atomic-save-to-deck) immediately follows and proves the explicit gate works. Together they make the wedge real — S-01 is placed first because nothing else matters until generation produces viable candidates.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                | Prerequisites | PRD refs                               | Status   |
| ---- | ------------------------------- | ----------------------------------------------------------------------------------- | ------------- | -------------------------------------- | -------- |
| F-01 | flashcard-schema-migration      | (foundation) flashcard table with SR algorithm fields deployed; RLS enabled         | —             | FR-002, FR-004, FR-008, FR-009, FR-010 | done     |
| S-01 | first-gated-generation          | paste text → AI generates → sees draft candidate cards (not yet saved to deck)      | F-01          | FR-001, FR-002, US-01                  | done        |
| S-02 | atomic-save-to-deck             | review each draft card, accept/edit/reject; accepted cards atomically saved to deck | S-01          | FR-003, FR-005, US-01                  | done        |
| S-03 | flashcard-crud-management       | create cards manually, edit and delete existing cards                               | S-02          | FR-004, FR-006, FR-007, US-02          | done        |
| S-04 | srs-review-session              | start an SR review session with due cards and rate their recall                     | S-02          | FR-008, FR-009, US-03                  | proposed |
| S-05 | account-deletion-with-retention | request account deletion with 30-day data retention before permanent removal        | F-01          | FR-010, US-04                          | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                               | Note                                                                       |
| ------ | ----------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| A      | Generation & Management | `F-01` → `S-01` → `S-02` → `S-03`  | Core must-have path; S-02 is the explicit gate that makes the wedge real.  |
| B      | Learning Loop           | `S-04`                              | Joins Stream A at `S-02`; parallel with S-03 once S-02 is done.            |
| C      | Account Lifecycle       | `S-05`                              | Joins at `F-01`; parallel with S-01 once F-01 is done.                     |

## Baseline

What's already in place in the codebase as of 2026-09-05 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19, Tailwind 4, Radix UI/shadcn (`src/components/ui/button.tsx`, `src/pages/index.astro`)
- **Backend / API:** present — Astro API routes + middleware (`src/pages/api/auth/signin.ts`, `src/middleware.ts`)
- **Data:** partial — Supabase driver present (`src/lib/supabase.ts`); no schema migrations yet (`config.toml: schema_paths = []`)
- **Auth:** present — Supabase Auth fully wired, cookie sessions, PROTECTED_ROUTES (`src/middleware.ts:4,18-21`)
- **Deploy / infra:** present — Cloudflare Workers via `@astrojs/cloudflare` (per `tech-stack.md`)
- **Observability:** absent — no logging library, error tracking, or metrics

## Foundations

### F-01: Flashcard Schema Migration

- **Outcome:** (foundation) `flashcards` table deployed in Supabase with FSRS fields (`stability`, `difficulty`, `due`, `state`, `reps`, `lapses`, `elapsed_days`, `scheduled_days`, `last_review`) via `ts-fsrs`; Row-Level Security enabled so each user sees only their own cards.
- **Change ID:** `flashcard-schema-migration`
- **PRD refs:** FR-002 (accepted cards must be persisted after AI generation), FR-004 (manual card creation needs the same table), FR-008 (SR session queries cards by due date), FR-009 (recall rating updates SR algorithm state fields), FR-010 (deletion cascade needs flashcard table)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05 — every vertical slice either writes to or reads from the flashcard schema.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** SR library: wybrano FSRS via `ts-fsrs` (2026-09-05). Decyzja zamknięta.
- **Risk:** Schemat FSRS ma 9 pól — więcej niż SM-2, ale dokładniejszy model pamięci. Pola muszą dokładnie odpowiadać typom zwracanym przez `ts-fsrs`, inaczej algorytm da błędne interwały.
- **Status:** done

## Slices

### S-01: First Gated Generation (North Star)

- **Outcome:** User can paste source text, trigger AI card generation, and see a set of AI-proposed draft candidate cards — visible for review but not yet saved to their deck.
- **Change ID:** `first-gated-generation`
- **PRD refs:** FR-001 (user must be logged in to access the generation flow), FR-002 (paste text → AI generate), US-01 (generation step)
- **Prerequisites:** F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - Which LLM provider/API to use (OpenAI, Anthropic, OpenRouter, etc.) and which API key to configure. — Owner: user. Block: no (any provider works; affects only env var and API client, not data model).
  - What prompt strategy reliably produces quality flashcard pairs from arbitrary source text. — Owner: user. Block: no (can iterate during and after development).
- **Risk:** LLM integration is entirely absent from the starter and is the highest-effort element of this slice. Must be introduced here — there is no earlier slice that exercises it. If LLM call latency exceeds the PRD NFR ("within a few seconds"), a streaming or visible-progress approach is required at this layer.
- **Status:** done

### S-02: Atomic Save to Deck

- **Outcome:** User can review each draft candidate card, accept, edit, or reject it individually; all accepted cards are saved to their deck in a single atomic transaction — none land in the deck without explicit approval.
- **Change ID:** `atomic-save-to-deck`
- **PRD refs:** FR-003 (accept/edit/reject per card), FR-005 (collection view confirms saved cards), US-01 (gate + save step)
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The atomicity requirement (all accepted cards save or none do) must be verified: if the transaction fails mid-save, no partial state should persist. This is the integrity guarantee of the product wedge — a partial save would undermine the explicit-gate contract.
- **Status:** done

### S-03: Flashcard CRUD Management

- **Outcome:** User can create a flashcard manually (front/back), edit the front or back of any existing card, and delete a card from their collection.
- **Change ID:** `flashcard-crud-management`
- **PRD refs:** FR-004 (manual create), FR-006 (edit), FR-007 (delete), US-02
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends on the collection view built in S-02; any structural UI change in S-02 may require minor rework here. Low risk given the collection view is intentionally simple.
- **Status:** done

### S-04: Spaced-Repetition Review Session

- **Outcome:** User can start a review session showing cards due for review, rate their recall on each card, and have the SR algorithm update each card's next review date accordingly.
- **Change ID:** `srs-review-session`
- **PRD refs:** FR-008 (SR session with due cards), FR-009 (recall rating feeds SR algorithm), US-03
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - SR library: `ts-fsrs` (FSRS). Integration pattern: wywołaj `fsrs.next(card, now, rating)` po każdej ocenie użytkownika, zapisz zwrócone pola z powrotem do wiersza `flashcards`. — Owner: user. Block: no.
- **Risk:** SR algorithm correctness is hard to verify by hand. Acceptance criteria when `/10x-plan` runs must include: rate a card "again" → next review is tomorrow; rate "easy" → interval grows. Without this verification path the slice cannot be marked done.
- **Status:** proposed

### S-05: Account Deletion with Retention

- **Outcome:** User can request account deletion; their account and all associated flashcard data are retained for 30 days before permanent removal. User cannot log in after requesting deletion.
- **Change ID:** `account-deletion-with-retention`
- **PRD refs:** FR-010, US-04
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - What mechanism implements the 30-day soft-delete (a `deleted_at` column on user record, a Supabase scheduled job, or TTL policy). — Owner: user. Block: no (implementation detail for `/10x-plan`).
- **Risk:** Must ensure that a user who has requested deletion cannot log in or access data during the retention window. Auth layer enforcement is required and must be verified before the slice is marked done.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                       | GitHub issue                                                                          | Ready for `/10x-plan` | Notes                                           |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------- |
| F-01       | flashcard-schema-migration      | [#1](https://github.com/MajkelSanta/10x-cardsIntro/issues/1)                         | yes                   | SR library resolved (FSRS / ts-fsrs)            |
| S-01       | first-gated-generation          | [#2](https://github.com/MajkelSanta/10x-cardsIntro/issues/2)                         | no                    | Depends on F-01 done                            |
| S-02       | atomic-save-to-deck             | [#3](https://github.com/MajkelSanta/10x-cardsIntro/issues/3)                         | yes                   | S-01 done — run `/10x-plan atomic-save-to-deck` |
| S-03       | flashcard-crud-management       | [#4](https://github.com/MajkelSanta/10x-cardsIntro/issues/4)                         | yes                   | S-02 done — parallel with S-04                  |
| S-04       | srs-review-session              | [#5](https://github.com/MajkelSanta/10x-cardsIntro/issues/5)                         | yes                   | S-02 done — parallel with S-03                  |
| S-05       | account-deletion-with-retention | [#6](https://github.com/MajkelSanta/10x-cardsIntro/issues/6)                         | yes                   | F-01 done — parallel with S-02                  |

## Open Roadmap Questions

1. **What user stories cover authentication sign-up/sign-in flows?** — US-02 (manual card creation), US-03 (SR review session), and US-04 (account deletion) added in PRD v2. Auth flows are covered by FR-001 and the existing auth scaffold (`src/pages/api/auth/`). Block: no.

## Parked

- **No custom SR algorithm** — Why parked: PRD §Non-Goals; integrate an existing proven library (decision tracked in F-01 Unknown).
- **Multi-format import (PDF, DOCX, images)** — Why parked: PRD §Non-Goals; MVP accepts plain text paste only.
- **Sharing and collaboration** — Why parked: PRD §Non-Goals; single-user experience only in MVP.
- **Mobile app** — Why parked: PRD §Non-Goals; web only.
- **Bulk-accept with exceptions** — Why parked: PRD FR-003 Socratic note flags this as a post-MVP consideration if per-card review friction is validated with real users.
- **Observability / error tracking** — Why parked: absent from baseline, not required by PRD NFRs for MVP; add when the product has real users generating real errors.

## Milestone History

(Empty — this is the first milestone.)

## Done

- **S-03: Flashcard CRUD Management** — Archived 2026-09-10 → `context/archive/2026-09-10-flashcard-crud-management/`. Lesson: —.

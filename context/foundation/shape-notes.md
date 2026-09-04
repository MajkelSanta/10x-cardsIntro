---
project: "10xCards"
context_type: greenfield
created: 2026-06-25
updated: 2026-06-25

checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction — manual card-writing kills spaced-repetition adoption"
    - topic: "insight"
      decision: "existing tools bolt AI on as a feature; AI-first flow changes the whole UX"
    - topic: "primary persona scope"
      decision: "professional upskilling — developers, doctors, lawyers learning domain knowledge"
    - topic: "auth strategy"
      decision: "email+password or OAuth login; accounts stored server-side"
    - topic: "role model"
      decision: "flat — all users equal, no admin role in MVP"
  frs_drafted: 9
  quality_check_status: accepted
  product_type: web-app
  target_scale:
    users: medium
    qps: low
    data_volume: small
  timeline_budget:
    mvp_weeks: 3
    hard_deadline: null
    after_hours_only: true
---

## Vision & Problem Statement

Creating high-quality flashcards manually is time-consuming, which discourages learners from using spaced repetition — a proven, highly effective learning method. Professionals upskilling in new domains (developers learning a new stack, doctors studying new protocols, lawyers absorbing new case law) feel this pain most acutely: they have limited time and the material is dense.

Existing tools like Anki and Quizlet have added AI-powered generation as a bolt-on feature, but their UX still assumes the user writes cards manually. An AI-first approach changes the entire workflow: paste your source text, review generated cards, and start learning — instead of spending hours authoring before you can begin.

## User & Persona

**Primary persona: The Upskilling Professional**

A working professional learning new domain knowledge for their job. They know spaced repetition is effective but rarely use it because the card-creation overhead doesn't fit their schedule. They have source material (articles, documentation, notes) and want to convert it into study-ready flashcards with minimal effort.

## Access Control

Login via email+password or OAuth. User accounts stored server-side — flashcards accessible from any device. Flat user model: all users have the same capabilities. No admin panel or role separation in the MVP.

## Success Criteria

### Primary
- 75% of AI-generated flashcards are accepted by the user (edited or kept as-is)
- Users create 75% of their flashcards using AI generation (vs manual creation)

### Secondary
- User returns to the app within 7 days of first session (retention signal)

### Guardrails
- User data privacy: source text submitted for AI processing must not leak or be retained beyond the processing request

## Functional Requirements

### Authentication
- FR-001: User can create an account and log in via email+password or OAuth. Priority: must-have
  > Socrates: No counter-argument; account-based auth is essential for multi-device data storage.

### AI Generation
- FR-002: User can paste source text to generate flashcards via AI. Priority: must-have
  > Socrates: Counter-argument considered: "paste-only limits input quality — poorly formatted or truncated text may produce weak cards." Resolution: kept; paste is the simplest input for MVP. Guided input can be explored post-MVP if quality is an issue.
- FR-003: User can review AI-generated flashcards — accept, edit, or reject each one. Priority: must-have
  > Socrates: Counter-argument considered: "per-card review is too slow for 20+ cards — same friction we're eliminating." Resolution: kept; review ensures the 75% quality bar. Consider bulk-accept with exceptions post-MVP if review friction is validated.

### Flashcard Management
- FR-004: User can create flashcards manually (front/back). Priority: must-have
  > Socrates: No counter-argument; users need a way to add cards AI can't generate — edge cases, personal mnemonics, corrections.
- FR-005: User can browse their flashcard collection. Priority: must-have
  > Socrates: No counter-argument; a simple list is the right MVP approach for seeing what you have.
- FR-006: User can edit existing flashcards. Priority: must-have
  > Socrates: No counter-argument; table stakes CRUD.
- FR-007: User can delete flashcards. Priority: must-have
  > Socrates: No counter-argument; table stakes CRUD.

### Spaced Repetition
- FR-008: User can start a spaced-repetition review session with cards due for review. Priority: must-have
  > Socrates: Counter-argument considered: "building SR from scratch is scope creep." Resolution: kept; but must integrate an existing algorithm/library, not build custom. The idea notes explicitly say "integration with a ready-made repetition algorithm."
- FR-009: User can rate their recall during review to feed the SR algorithm. Priority: must-have
  > Socrates: Same as FR-008; use an existing SR algorithm, not a custom one.

## User Stories

### US-01: User generates flashcards from source text

- **Given** a logged-in user on the main dashboard
- **When** they paste source text and trigger AI generation
- **Then** they see a set of generated flashcards they can accept, edit, or reject individually, and accepted cards appear in their collection

#### Acceptance Criteria
- Generated cards have a clear front (question/prompt) and back (answer)
- User can accept, edit, or reject each card individually before saving
- Accepted/edited cards are persisted to the user's collection immediately

## Business Logic

Given a block of source text, the system extracts key concepts and transforms them into question-answer flashcard pairs optimized for spaced-repetition recall.

The rule consumes a single input: **source text** pasted by the user — an article excerpt, documentation fragment, lecture notes, or any prose containing domain knowledge. The output is a **set of flashcard pairs**, each with a front (question or prompt that tests recall) and a back (the answer or explanation). The user encounters this transformation immediately after pasting text: generated cards appear for review, and the user accepts, edits, or rejects each one before it enters their collection.

## Non-Functional Requirements

- A user sees generated flashcards appear within a few seconds of submitting source text; continuous visible progress is shown during any operation that takes longer than two seconds.
- The product remains usable on the latest two major versions of Chrome, Firefox, Safari, and Edge.

## Non-Goals

- No custom spaced-repetition algorithm — use an existing, proven algorithm/library. Building a proprietary SR engine (like SuperMemo or Anki's) is out of scope.
- No multi-format import (PDF, DOCX, images, etc.) — MVP accepts plain text paste only. No file upload or document parsing.
- No sharing or collaboration — no shared decks, team workspaces, or social features. Single-user experience only.
- No mobile app — web only. No native iOS/Android application in MVP scope.

# First Gated Generation — Plan Brief

> Full plan: `context/changes/first-gated-generation/plan.md`

## What & Why

Implementuje S-01 (North Star): użytkownik wkleja tekst źródłowy, klika Generate, i widzi 10 proponowanych roboczych fiszek pojawiających się stopniowo na stronie. Fiszki nie są jeszcze zapisywane — to jest S-02. Ten slice udowadnia, że integracja AI działa i wytwarza kandydatów wartych przeglądu.

## Starting Point

Czysty starter Astro 6 + Supabase Auth bez jakiejkolwiek integracji LLM. Brak schematu fiszek, brak zmiennych środowiskowych OpenRouter, brak stron ani komponentów poza auth. Infrastructure.md potwierdza OpenRouter jako wybrany provider.

## Desired End State

Użytkownik zalogowany przechodzi na `/generate`, wkleja fragment artykułu lub notatek (50–5000 znaków), klika Generate i obserwuje jak fiszki pojawiają się jedna po drugiej. Po zakończeniu widzi 10 par pytanie–odpowiedź. Niezalogowany dostęp do `/generate` przekierowuje do logowania.

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) | Source |
|---|---|---|---|
| Lokalizacja UI generowania | Nowa strona `/generate` | Czyste URL, łatwa ochrona przez middleware, nie zatłacza dashboardu | Plan |
| Tryb odpowiedzi LLM | Streaming (NDJSON per linia) | PRD wymaga widocznego postępu dla operacji > 2s; streaming spełnia wymóg od pierwszej fiszki | Plan |
| Klient LLM | `fetch()` bezpośrednio do OpenRouter API | Zero zależności, pełna kompatybilność z Cloudflare workerd | Plan |
| Model LLM | Zmienna środowiskowa `OPENROUTER_MODEL` | Łatwa zmiana modelu bez deploy; domyślnie `openai/gpt-4o-mini` | Plan |
| Liczba fiszek | Stała 10 | Przewidywalny UI, prosty prompt, wystarczające dla sesji przeglądu | Plan |
| Limity tekstu wejściowego | 50–5000 znaków | Chroni przed pustym wejściem i tekstami przekraczającymi okno kontekstowe tanich modeli | Plan |
| Zakres F-01 | Włączone jako Faza 1 | Mała migracja SQL bez samodzielnej wartości planistycznej; jeden plan do wykonania | Plan |
| Obsługa błędów | Inline komunikat błędu (wzorzec `ServerError`) | Spójne z istniejącymi komponentami auth; textarea pozostaje wypełniona | Plan |

## Scope

**W zakresie:**
- Migracja tabeli `flashcards` z polami FSRS i RLS (F-01)
- Zmienne środowiskowe OpenRouter w schemacie Astro env
- `POST /api/cards/generate` — streaming endpoint
- Strona `/generate` (chroniona) z formularzem i listą roboczych fiszek
- Link "Generuj fiszki" na dashboardzie

**Poza zakresem:**
- Zapisywanie fiszek do bazy (S-02)
- Akcje accept/edit/reject (S-02)
- Ręczne tworzenie fiszek (S-03)
- Instalacja `ts-fsrs` (S-04)
- Edycja globalnej nawigacji Topbar

## Architecture / Approach

Endpoint API (`/api/cards/generate`) działa jako cienki passthrough: odbiera żądanie POST z tekstem, otwiera strumieniujące żądanie do OpenRouter (SSE), akumuluje tokeny delta w buforze liniowym, i kiedy wykryje kompletną linię JSON `{"front":"...","back":"..."}` — emituje ją do klienta. Klient (React) odczytuje `response.body` jako `ReadableStream`, parsuje linie i dokłeja fiszki do stanu komponentu w czasie rzeczywistym.

```
User → /generate (Astro) → GenerateForm (React)
                                  ↓ POST /api/cards/generate
                             Astro API Route
                                  ↓ fetch() stream: true
                             OpenRouter API
                                  ↓ SSE delta tokens
                             Line buffer accumulation
                                  ↓ NDJSON card lines
                             GenerateForm state → card list
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Flashcard Schema Migration | Tabela `flashcards` z FSRS + RLS; typy TS w `src/types.ts` | Pola FSRS muszą dokładnie odpowiadać typom `ts-fsrs` (używanym w S-04) |
| 2. OpenRouter Streaming API | Endpoint `/api/cards/generate` strumieniujący NDJSON fiszki | Parsowanie częściowego JSON z tokenów SSE — nietrywialny edge case |
| 3. Generation Page UI | Strona `/generate` z formularzem + progresywna lista fiszek | React streaming state + obsługa przerwania strumienia |

**Prerequisites:** Działający lokalny Supabase (`npx supabase start`), klucz API OpenRouter w `.dev.vars`
**Estimated effort:** ~2–3 sesje robocze rozłożone na 3 fazy

## Open Risks & Assumptions

- **Parsowanie SSE → NDJSON**: LLM może zacząć linię JSON, przesłać połowę tokenu `{` i dokończyć w następnym chunku. Implementacja musi buforować i próbować parsować dopiero gdy znajdzie `\n`.
- **Cloudflare Workers + ReadableStream**: streaming działa natywnie, ale Supabase cookie writes muszą zakończyć się przed rozpoczęciem strumieniowania odpowiedzi (middleware ustawia ciasteczka synchronicznie, więc to nie jest problem w `/generate`).
- **Jakość promptu**: 75% akceptowalnych fiszek (cel PRD) zależy od promptu — wymaga iteracji po pierwszym wdrożeniu.

## Success Criteria (Summary)

- Użytkownik wkleja ~300 znaków, klika Generate, widzi 10 fiszek strumieniujących stopniowo
- Niezalogowany dostęp do `/generate` → przekierowanie do `/auth/signin`
- Walidacja wejścia (< 50 i > 5000 znaków) blokuje generowanie z komunikatem błędu

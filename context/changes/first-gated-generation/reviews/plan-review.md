<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First Gated Generation (S-01)

- **Plan**: context/changes/first-gated-generation/plan.md
- **Mode**: Deep
- **Date**: 2026-09-09
- **Verdict**: SOUND
- **Note**: Retrospektywny przegląd — zmiana już zaimplementowana, 25/25 testów przechodzi.
- **Findings**: 0 critical  1 warning  3 observations

## Verdicts

| Dimension             | Verdict |
|-----------------------|---------|
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

8/8 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — startsWith na PROTECTED_ROUTES tworzy ukryty zasięg

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — rzeczywisty kompromis; warto się zastanowić
- **Dimension**: Architectural Fitness
- **Location**: src/middleware.ts:18
- **Detail**: `PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))` cicho chroni każdą ścieżkę zaczynającą się od `/generate`, nie tylko dokładne `/generate`. Może zaskoczyć przyszłych implementorów dodających `/generate-*` z zamiarem otwartego dostępu.
- **Fix Applied**: Zmieniono na `PROTECTED_ROUTES.includes(context.url.pathname)` — exact-match. Każda chroniona ścieżka musi być jawnie wymieniona.
- **Decision**: FIXED via Fix B

### F2 — maxLength={5000} sprawia, że walidacja przepełnienia jest nieosiągalna w prawdziwej przeglądarce

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja
- **Dimension**: Lean Execution
- **Location**: src/components/generate/GenerateForm.tsx:136, 141, 146
- **Detail**: Atrybut `maxLength={5000}` powoduje ciche obcięcie tekstu przez przeglądarkę. `text.length > 5000` nigdy nie jest `true` w realnym użyciu — czerwony licznik i disabled dla przepełnienia są martwym kodem w przeglądarce (widoczne tylko w testach przez `fireEvent.change`).
- **Fix**: Usunięcie `maxLength` z textarea — React state jako jedyny egzekutor. Użytkownik dostaje widoczny feedback zamiast cichego obcięcia.
- **Decision**: ACCEPTED — ciche obcięcie akceptowalne dla S-01.

### F3 — rawBuffer fallback zduplikowany w endpoincie i kliencie; plan opisywał tylko kliencki

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Lean Execution
- **Location**: src/pages/api/cards/generate.ts:164-176 i src/components/generate/GenerateForm.tsx:95-118
- **Detail**: Plan opisywał fallback (parsuj rawBuffer jako JSON array jeśli zero linii NDJSON) jako zabezpieczenie klienckie. Implementacja dodała ten sam fallback też po stronie serwera. Oba nie mogą odpalić dla tego samego żądania — jeśli serwer emituje karty przez fallback, klient dostaje prawidłowe NDJSON i jego fallback nigdy nie odpali.
- **Decision**: NOTED — lekcja do przyszłych planów: dokumentuj server-side fallback żeby kliencka kopia była świadoma swojej roli.

### F4 — "dokładnie 10 fiszek" w desired end state przesadza z gwarancją

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Plan §Desired End State i manual test 3.4
- **Detail**: Fraza "dokładnie 10 fiszek widocznych" to kryterium sukcesu, ale kod tylko instruuje LLM promptem. Jeśli model zwróci 8 kart, UI pokazuje 8 bez komunikatu. Akceptowalne dla S-01, ale w przyszłych planach "dokładnie N" powinno być opisane jako "best-effort (instrukcja promptu)", nie twarda gwarancja kodu.
- **Decision**: ACCEPTED — S-01 ok; lekcja na przyszłość.

<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First Gated Generation

- **Plan**: `context/changes/first-gated-generation/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-06
- **Verdict**: SOUND (po naprawach)
- **Findings**: 0 critical | 2 warnings | 2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — SubmitButton jest niekompatybilny z fetch()-based form

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista
- **Dimension**: Blind Spots
- **Location**: Faza 3 — GenerateForm, kontrakt przycisku
- **Detail**: SubmitButton.tsx:14 używa useFormStatus() który aktywuje się tylko z React form action=. GenerateForm używa fetch() — pending zawsze będzie false.
- **Fix**: Użyj Button z @/components/ui/button z disabled={isGenerating} i własnym spinnerem.
- **Decision**: FIXED — zaktualizowano kontrakt Fazy 3.3

### F2 — LLM może wygenerować wieloliniowy JSON, psując NDJSON parser

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realne ryzyko; pauza i przemyślenie
- **Dimension**: Blind Spots
- **Location**: Faza 2 — endpoint + Faza 3 — klient
- **Detail**: Jeśli model wypisze JSON wieloliniowo, parser liniowy nie znajdzie żadnej karty. 0 fiszek bez komunikatu błędu.
- **Fix A ⭐ Zastosowany**: Dodaj fallback brace-counting po stronie klienta. Jeśli po zakończeniu stream cards.length === 0, sparsuj pełny rawBuffer jako JSON array.
- **Decision**: FIXED — dodano fallback do kontraktu GenerateForm (Faza 3.3)

### F3 — Brak ścieżki importu Layout w kontrakcie generate.astro

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja
- **Dimension**: Plan Completeness
- **Location**: Faza 3.2 — kontrakt generate.astro
- **Detail**: Plan mówił "wzorzec analogiczny do dashboard.astro" bez podania ścieżki importu.
- **Fix**: Dodano `import Layout from "@/layouts/Layout.astro"` do kontraktu.
- **Decision**: FIXED

### F4 — Link "Generuj fiszki" na dashboardzie powinien być <a>, nie React Button

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja
- **Dimension**: Plan Completeness
- **Location**: Faza 3.4 — kontrakt dashboard.astro
- **Detail**: dashboard.astro to Astro component — React Button wymagałby client:load. Właściwy wzorzec: <a> z Tailwind.
- **Fix**: Zmieniono kontrakt na <a href="/generate"> z klasami Tailwind.
- **Decision**: FIXED

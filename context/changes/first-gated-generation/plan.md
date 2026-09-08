# First Gated Generation — Implementation Plan

## Overview

Implementuje S-01 (North Star): użytkownik wkleja tekst źródłowy, wyzwala generowanie AI przez OpenRouter i widzi 10 proponowanych roboczych fiszek strumieniujących stopniowo na stronę. Fiszki są wyświetlane do przeglądu, ale jeszcze nie zapisywane. Plan zawiera też F-01 (migracja schematu fiszek) jako Fazę 1.

## Current State Analysis

- Brak schematu fiszek — katalog `supabase/migrations/` nie istnieje
- Brak integracji LLM — zero kodu związanego z OpenRouter, brak zmiennych środowiskowych AI
- `wrangler.jsonc` ma już zastosowaną poprawkę `disable_nodejs_process_v2` (bezpieczne do deploy)
- Auth i middleware są w pełni skonfigurowane — `Astro.locals.user` dostępne w każdym żądaniu
- Wzorzec zmiennych środowiskowych: deklaracja w `astro.config.mjs` `env.schema`, import z `astro:env/server`
- Brak `src/types.ts`

## Desired End State

- Tabela `flashcards` wdrożona w Supabase ze wszystkimi polami FSRS i RLS per-użytkownik
- `GET /generate` (chroniona) renderuje formularz textarea + pustą listę fiszek
- `POST /api/cards/generate` przyjmuje tekst (50–5000 znaków), strumieniuje NDJSON — jeden obiekt `{front, back}` per linia
- W trakcie strumieniowania fiszki pojawiają się jedna po drugiej na stronie `/generate`
- Przy błędzie (LLM, nieparsowalna odpowiedź, sieć) — inline komunikat błędu pod formularzem; textarea pozostaje wypełniona
- Niezalogowany dostęp do `/generate` → przekierowanie do `/auth/signin`
- Tekst źródłowy nie jest logowany ani przechowywany poza cyklem życia żądania API

### Key Discoveries

- `src/lib/supabase.ts:3` — zmienne importowane z `astro:env/server`; ten sam wzorzec dla `OPENROUTER_API_KEY`
- `src/middleware.ts:4,18-21` — tablica `PROTECTED_ROUTES` rządzi przekierowaniami auth; `/generate` musi być dodane
- `src/components/auth/ServerError.tsx` — istniejący komponent do wyświetlania błędów; reużyć
- `src/components/auth/SubmitButton.tsx` — przycisk submit z loading state via `useFormStatus`; reużyć
- `astro.config.mjs:17-22` — `env.schema` to jedyne miejsce deklaracji nowych sekretów serwera

## What We're NOT Doing

- Nie zapisujemy fiszek do bazy danych — to jest S-02 (atomic-save-to-deck)
- Nie implementujemy akcji accept/edit/reject per fiszka — to S-02
- Nie budujemy UI ręcznego tworzenia fiszek — to S-03
- Nie instalujemy `ts-fsrs` — potrzebne dopiero gdy działa algorytm SR w S-04
- Nie edytujemy `Topbar.astro` z globalną nawigacją — minimalny link z dashboardu wystarczy

## Implementation Approach

Trzy sekwencyjne fazy: (1) migracja schematu — zakłada tabelę fiszek od której zależy każdy kolejny slice, (2) integracja OpenRouter — zmienne środowiskowe i endpoint API ze strumieniowaniem, (3) UI generowania — chroniona strona Astro z komponentem React otwierającym stream i akumulującym fiszki w stanie.

**Podejście strumieniowania**: endpoint API otwiera strumieniowe żądanie do OpenRouter (format SSE), czyta tokeny delta z każdego zdarzenia SSE, akumuluje je w buforze liniowym i kiedy w buforze pojawi się `\n` + parsowalna linia JSON (kompletna fiszka), zapisuje tę linię JSON do strumienia odpowiedzi klienta. Klient czyta body Response jako ReadableStream, dzieli po `\n` i parsuje każdą fiszkę do stanu React.

## Critical Implementation Details

**Strumieniowanie SSE → NDJSON**: OpenRouter strumieniuje zdarzenia SSE w formacie `data: {"choices":[{"delta":{"content":"..."}}]}`. Endpoint musi akumulować tokeny w buforze, szukać `\n` i próbować parsować jako JSON każdy pełny fragment. Linia jest kompletna gdy buffer zawiera `\n` i substring przed `\n` jest poprawnym JSON z kluczami `front` i `back`.

**Cloudflare Workers streaming**: `new ReadableStream({ async start(controller) {...} })` działa natywnie. Zwrócenie `new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } })` ze zhandlera Astro API poprawnie strumieniuje przez workerd.

**Auth w API route**: użyć `context.locals.user` z parametru `APIContext`, nie `Astro.locals`.

---

## Phase 1: Flashcard Schema Migration

### Overview

Tworzy tabelę `flashcards` z wszystkimi polami algorytmu FSRS i bezpieczeństwem na poziomie wiersza (RLS). Jednorazowa migracja odblokwująca każdy kolejny slice (S-01 do S-05). Zakłada też `src/types.ts` z współdzielonymi kontraktami typów.

### Changes Required

#### 1. Katalog migracji

**File**: `supabase/migrations/`

**Intent**: Katalog nie istnieje; stwórz go żeby Supabase CLI wykrył migracje.

**Contract**: Pusty katalog pod właściwą ścieżką.

#### 2. Migracja schematu fiszek

**File**: `supabase/migrations/20260906120000_flashcard_schema.sql`

**Intent**: Deklaruje tabelę `flashcards`, wszystkie pola FSRS i cztery polityki RLS (SELECT, INSERT, UPDATE, DELETE) tak żeby każdy użytkownik widział tylko swoje fiszki.

**Contract**:
Nazwa tabeli: `public.flashcards`
Kolumny:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `front text NOT NULL`
- `back text NOT NULL`
- Pola FSRS: `stability float8 DEFAULT 0`, `difficulty float8 DEFAULT 0`, `due timestamptz DEFAULT now()`, `state smallint DEFAULT 0`, `reps integer DEFAULT 0`, `lapses integer DEFAULT 0`, `elapsed_days float8 DEFAULT 0`, `scheduled_days float8 DEFAULT 0`, `last_review timestamptz`
- `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`

RLS: włączone (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). Cztery polityki z warunkiem `auth.uid() = user_id`.

#### 3. Typy TypeScript

**File**: `src/types.ts` (utwórz)

**Intent**: Ustanawia współdzielone kontrakty typów dla domeny fiszek importowane przez wszystkie kolejne slices.

**Contract**:
```typescript
export interface DraftCard {
  front: string;
  back: string;
}

export interface Flashcard {
  id: string;
  user_id: string;
  front: string;
  back: string;
  stability: number;
  difficulty: number;
  due: string;
  state: 0 | 1 | 2 | 3;
  reps: number;
  lapses: number;
  elapsed_days: number;
  scheduled_days: number;
  last_review: string | null;
  created_at: string;
  updated_at: string;
}
```

### Success Criteria

#### Automated Verification

- Migracja aplikuje się bez błędów: `npx supabase db push`
- TypeScript kompiluje się: `npm run build`

#### Manual Verification

- W Supabase Studio (http://localhost:54323) tabela `flashcards` widoczna z wszystkimi oczekiwanymi kolumnami i prawidłowymi typami
- RLS włączone na tabeli
- Cztery polityki RLS obecne

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej — poczekaj na ręczne potwierdzenie manualne przed przejściem do Fazy 2.

---

## Phase 2: OpenRouter Streaming API Endpoint

### Overview

Wpina sekrety OpenRouter do schematu env Astro i tworzy endpoint `POST /api/cards/generate`. Endpoint autentykuje użytkownika, waliduje wejście, wywołuje OpenRouter z `stream: true` i przesyła sparsowane linie fiszek jako strumieniującą odpowiedź NDJSON.

### Changes Required

#### 1. Zmienne środowiskowe OpenRouter w schemacie Astro

**File**: `astro.config.mjs`

**Intent**: Deklaruje `OPENROUTER_API_KEY` i `OPENROUTER_MODEL` jako server-only secrets dostępne przez `astro:env/server` w routach API.

**Contract**: Dodaj dwa wpisy do obiektu `env.schema` obok istniejących wpisów `SUPABASE_*`:
```
OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })
OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true })
```

#### 2. Sekrety dev

**File**: `.dev.vars`

**Intent**: Dostarcza działające credentiale do lokalnego developmentu.

**Contract**: Dodaj wpisy `OPENROUTER_API_KEY=<prawdziwy klucz>` i `OPENROUTER_MODEL=openai/gpt-4o-mini` (użytkownik dostarcza prawdziwą wartość klucza).

#### 3. Aktualizacja .env.example

**File**: `.env.example`

**Intent**: Dokumentuje dwie nowe wymagane zmienne dla przyszłych deweloperów.

**Contract**: Dodaj wpisy `OPENROUTER_API_KEY=###` i `OPENROUTER_MODEL=###`.

#### 4. Endpoint generowania

**File**: `src/pages/api/cards/generate.ts`

**Intent**: Przyjmuje POST z `{ text: string }`, waliduje auth i długość wejścia (50–5000 znaków), wywołuje OpenRouter z `stream: true`, parsuje tokeny delta SSE w kompletne linie JSON fiszek i strumieniuje je do klienta jako NDJSON.

**Contract**:
- Export: `export const POST: APIRoute`
- Sprawdzenie auth: `context.locals.user` — zwróć 401 jeśli brak
- Walidacja wejścia: `text` między 50–5000 znaków — zwróć 400 `{ error: "..." }` jeśli nieprawidłowe
- Żądanie OpenRouter: POST `https://openrouter.ai/api/v1/chat/completions`, nagłówek `Authorization: Bearer ${OPENROUTER_API_KEY}`, body `{ model: OPENROUTER_MODEL ?? "openai/gpt-4o-mini", stream: true, messages: [system + user] }`
- System prompt: instruuje model generować dokładnie 10 fiszek, po jednej na linię, jako `{"front":"...","back":"..."}` bez żadnego innego tekstu
- Passthrough strumieniowania: czyta linie SSE `data:`, wyodrębnia `choices[0].delta.content`, akumuluje w buforze liniowym, emituje kompletne linie fiszek do klienta
- Odpowiedź: `new Response(readableStream, { headers: { "Content-Type": "application/x-ndjson" } })`
- Błąd z OpenRouter (nie-2xx): zwróć 502 `{ error: "Generation failed" }`

**Uwaga produkcyjna**: po deploy dodaj sekrety przez Wrangler CLI: `npx wrangler secret put OPENROUTER_API_KEY` oraz `npx wrangler secret put OPENROUTER_MODEL`.

### Success Criteria

#### Automated Verification

- `npm run build` kończy się sukcesem
- `npm run lint` przechodzi bez błędów

#### Manual Verification

- Z działającym `npm run dev`, POST na http://localhost:4321/api/cards/generate z prawidłowym tekstem (sesja zalogowanego użytkownika) → streaming response, fiszki pojawiają się jako kolejne linie JSON
- POST bez sesji auth → 401
- POST z tekstem < 50 znaków → 400 z opisowym komunikatem błędu
- POST z tekstem > 5000 znaków → 400 z opisowym komunikatem błędu

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej — poczekaj na ręczne potwierdzenie manualne przed przejściem do Fazy 3.

---

## Phase 3: Generation Page UI

### Overview

Tworzy chronioną stronę Astro `/generate` i komponent React `GenerateForm` obsługujący pełne UX: textarea z licznikiem znaków, przycisk Generate z loading state, stopniowe pojawianie się fiszek podczas strumieniowania i inline wyświetlanie błędów.

### Changes Required

#### 1. Dodaj /generate do chronionych tras

**File**: `src/middleware.ts`

**Intent**: Zapewnia, że niezalogowani użytkownicy próbujący wejść na `/generate` są przekierowywani do `/auth/signin`.

**Contract**: Dodaj `"/generate"` do tablicy `PROTECTED_ROUTES` w linii 4.

#### 2. Strona generowania

**File**: `src/pages/generate.astro`

**Intent**: Renderuje szkielet strony Astro z layoutem i klienckim komponentem `GenerateForm`.

**Contract**: Wzorzec analogiczny do `dashboard.astro` — `import Layout from "@/layouts/Layout.astro"`. Renderuje `<GenerateForm client:load />`. Czyta `Astro.locals.user` dla kontekstu strony, ale nie przekazuje propsów użytkownika do komponentu (API obsługuje auth niezależnie).

#### 3. Komponent React GenerateForm

**File**: `src/components/generate/GenerateForm.tsx`

**Intent**: Zarządza całym UX generowania — wejście textarea z walidacją, fetch z obsługą strumienia, progresywne wyświetlanie fiszek i obsługa błędów.

**Contract**:
- Stan: `text` (string), `cards` (DraftCard[]), `isGenerating` (boolean), `error` (string | null)
- Submit: POST na `/api/cards/generate` z `{ text }`, odczyt `response.body` jako `ReadableStream`, podział po `\n`, parsowanie każdej przyciętej linii jako JSON, doklejanie poprawnych obiektów `{ front, back }` do stanu `cards`; równolegle akumuluj surowy tekst w osobnej zmiennej `rawBuffer`
- Fallback: po zakończeniu strumienia jeśli `cards.length === 0` (np. LLM wypisał wieloliniowy JSON), spróbuj sparsować `rawBuffer` jako JSON array `[{front, back}, ...]` i ustaw `cards` z wyniku; jeśli nadal brak — pokaż błąd "Nie udało się wygenerować fiszek. Spróbuj ponownie."
- Odpowiedź nie-2xx: odczyt JSON body, ustawienie `error` z pola `error`
- Textarea: walidacja min/max długości (`minLength={50}` `maxLength={5000}`) + widoczny licznik znaków `{text.length}/5000`
- Przycisk Generate: użyj `Button` z `@/components/ui/button` z `disabled={isGenerating}` i własnym spinnerem (inline `animate-spin` div) — NIE używaj `SubmitButton`, który opiera się na `useFormStatus()` i nie aktywuje się przy `fetch()`
- Wyświetlanie błędów: reużywa istniejącego komponentu `ServerError` z komunikatem błędu
- Wyświetlanie fiszek: lista poniżej formularza, każda fiszka pokazuje front i back; fiszki pojawiają się w miarę dodawania do stanu
- Import: `DraftCard` z `@/types`

#### 4. Link na dashboardzie do /generate

**File**: `src/pages/dashboard.astro`

**Intent**: Daje zalogowanym użytkownikom wyraźny punkt wejścia do przepływu generowania.

**Contract**: Dodaj `<a href="/generate">` stylowany klasami Tailwind spójnymi z istniejącymi elementami dashboardu (np. `rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20 text-white inline-block mt-6`). Użyj czystego znacznika `<a>` — nie importuj React Button (dashboard.astro to komponent Astro, client:load byłby zbędny dla statycznego linku).

### Success Criteria

#### Automated Verification

- `npm run build` kończy się sukcesem
- `npm run lint` przechodzi bez błędów (brak błędów TypeScript, brak naruszeń React Compiler)

#### Manual Verification

- Zalogowany, nawigacja do `/dashboard` → link "Generuj fiszki" widoczny
- Kliknięcie linku → nawigacja do `/generate`
- Wklejenie ~300 znaków tekstu → kliknięcie Generate → pojawia się loading state → fiszki strumieniują jedna po drugiej
- Po zakończeniu: dokładnie 10 fiszek widocznych, każda z frontem i backiem
- Wpisanie < 50 znaków → Generate zablokowany lub błąd walidacji
- Wpisanie > 5000 znaków → licznik sygnalizuje przekroczenie / Generate zablokowany
- Wylogowany → bezpośrednia nawigacja na `/generate` → przekierowanie do `/auth/signin`

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej — poczekaj na manualne potwierdzenie wszystkich kroków przed zamknięciem S-01.

---

## Testing Strategy

### Manual Testing Steps

1. Uruchom lokalne Supabase: `npx supabase start`
2. Zastosuj migrację: `npx supabase db push`
3. Uruchom dev server: `npm run dev`
4. Zaloguj się na `/auth/signin`
5. Przejdź na `/generate`, wklej fragment ~300 znaków, kliknij Generate
6. Zweryfikuj: 10 fiszek pojawia się stopniowo
7. Sprawdź zakładkę Network w DevTools — Content-Type to `application/x-ndjson`, dane przychodzą jako chunki
8. Wyloguj się, wejdź bezpośrednio na `/generate` — potwierdź przekierowanie do `/auth/signin`

## Performance Considerations

NFR wymaga "ciągłego widocznego postępu" dla operacji przekraczających 2 sekundy. Strumieniowanie spełnia ten wymóg — pierwsza fiszka pojawia się w ciągu 1–2 sekund od wysłania żądania (zaraz po pojawieniu się pierwszej kompletnej linii JSON), nawet jeśli całkowite generowanie trwa 8+ sekund.

## References

- PRD: `context/foundation/prd.md` (v2)
- Infrastructure: `context/foundation/infrastructure.md`
- Change identity: `context/changes/first-gated-generation/change.md`
- Roadmap: `context/foundation/roadmap.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Flashcard Schema Migration

#### Automated

- [x] 1.1 Migracja aplikuje się bez błędów: `npx supabase db push`
- [x] 1.2 TypeScript kompiluje się: `npm run build`

#### Manual

- [x] 1.3 Tabela `flashcards` widoczna w Supabase Studio z wszystkimi kolumnami
- [x] 1.4 RLS włączone i cztery polityki RLS obecne

### Phase 2: OpenRouter Streaming API Endpoint

#### Automated

- [ ] 2.1 `npm run build` kończy się sukcesem
- [ ] 2.2 `npm run lint` przechodzi bez błędów

#### Manual

- [ ] 2.3 Streaming POST do `/api/cards/generate` zwraca fiszki jako NDJSON
- [ ] 2.4 Niezalogowany POST zwraca 401
- [ ] 2.5 POST z tekstem < 50 znaków zwraca 400
- [ ] 2.6 POST z tekstem > 5000 znaków zwraca 400

### Phase 3: Generation Page UI

#### Automated

- [ ] 3.1 `npm run build` kończy się sukcesem
- [ ] 3.2 `npm run lint` przechodzi bez błędów

#### Manual

- [ ] 3.3 Dashboard pokazuje link "Generuj fiszki"
- [ ] 3.4 Nawigacja do `/generate`, wklejenie tekstu → 10 fiszek strumieniuje stopniowo
- [ ] 3.5 Walidacja znaków działa (< 50 zablokowane, > 5000 zablokowane)
- [ ] 3.6 Wylogowany → `/generate` przekierowuje do `/auth/signin`

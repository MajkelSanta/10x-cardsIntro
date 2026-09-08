create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text not null,

  -- FSRS algorithm fields (ts-fsrs compatible)
  stability float8 not null default 0,
  difficulty float8 not null default 0,
  due timestamptz not null default now(),
  state smallint not null default 0, -- 0=New 1=Learning 2=Review 3=Relearning
  reps integer not null default 0,
  lapses integer not null default 0,
  elapsed_days float8 not null default 0,
  scheduled_days float8 not null default 0,
  last_review timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flashcards enable row level security;

create policy "Users can select own flashcards"
  on public.flashcards for select
  using (auth.uid() = user_id);

create policy "Users can insert own flashcards"
  on public.flashcards for insert
  with check (auth.uid() = user_id);

create policy "Users can update own flashcards"
  on public.flashcards for update
  using (auth.uid() = user_id);

create policy "Users can delete own flashcards"
  on public.flashcards for delete
  using (auth.uid() = user_id);

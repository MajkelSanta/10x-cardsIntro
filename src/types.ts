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

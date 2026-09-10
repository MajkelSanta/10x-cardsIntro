import { useState } from "react";

import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Card {
  id: string;
  front: string;
  back: string;
}

type CardMode = "display" | "editing" | "confirming-delete";

interface CardState extends Card {
  mode: CardMode;
  editFront: string;
  editBack: string;
  error: string | null;
  isSubmitting: boolean;
}

interface Props {
  cards: Card[];
}

function toState(cards: Card[]): CardState[] {
  return cards.map((c) => ({
    ...c,
    mode: "display",
    editFront: c.front,
    editBack: c.back,
    error: null,
    isSubmitting: false,
  }));
}

export function DeckManager({ cards: initialCards }: Props) {
  const [cardStates, setCardStates] = useState<CardState[]>(() => toState(initialCards));

  const updateCard = (id: string, patch: Partial<CardState>) => {
    setCardStates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleSaveEdit = async (id: string, newFront: string, newBack: string, prevFront: string, prevBack: string) => {
    updateCard(id, { front: newFront, back: newBack, mode: "display", isSubmitting: true, error: null });
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: newFront, back: newBack }),
      });
      if (!res.ok) {
        let msg = "Nie udało się zapisać zmian.";
        try {
          const data = (await res.json()) as { error?: string };
          msg = data.error ?? msg;
        } catch {
          // non-JSON
        }
        updateCard(id, { front: prevFront, back: prevBack, isSubmitting: false, error: msg });
      } else {
        updateCard(id, { isSubmitting: false });
      }
    } catch {
      updateCard(id, {
        front: prevFront,
        back: prevBack,
        isSubmitting: false,
        error: "Nie udało się połączyć z serwerem.",
      });
    }
  };

  const handleDelete = async (card: CardState) => {
    setCardStates((prev) => prev.filter((c) => c.id !== card.id));
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        let msg = "Nie udało się usunąć fiszki.";
        try {
          const data = (await res.json()) as { error?: string };
          msg = data.error ?? msg;
        } catch {
          // non-JSON
        }
        setCardStates((prev) => [...prev, { ...card, mode: "display", error: msg }]);
      }
    } catch {
      setCardStates((prev) => [...prev, { ...card, mode: "display", error: "Nie udało się połączyć z serwerem." }]);
    }
  };

  if (cardStates.length === 0) {
    return <p className="text-center text-blue-100/60">Nie masz jeszcze żadnych fiszek. Wróć do generowania!</p>;
  }

  return (
    <>
      <p className="mb-4 text-sm text-blue-100/60">{cardStates.length} fiszek</p>
      <ul className="flex flex-col gap-3">
        {cardStates.map((card) => (
          <li key={card.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
            {card.mode === "editing" ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={card.editFront}
                  onChange={(e) => {
                    updateCard(card.id, { editFront: e.target.value });
                  }}
                  rows={2}
                  aria-label="Przód fiszki"
                  className="w-full resize-none rounded border border-white/20 bg-white/10 p-2 text-sm text-white focus:ring-1 focus:ring-blue-400/50 focus:outline-none"
                />
                <textarea
                  value={card.editBack}
                  onChange={(e) => {
                    updateCard(card.id, { editBack: e.target.value });
                  }}
                  rows={2}
                  aria-label="Tył fiszki"
                  className="w-full resize-none rounded border border-white/20 bg-white/10 p-2 text-sm text-blue-100/70 focus:ring-1 focus:ring-blue-400/50 focus:outline-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={
                      !card.editFront.trim() ||
                      card.editFront.trim().length > 1000 ||
                      !card.editBack.trim() ||
                      card.editBack.trim().length > 1000 ||
                      card.isSubmitting
                    }
                    onClick={() => {
                      void handleSaveEdit(card.id, card.editFront.trim(), card.editBack.trim(), card.front, card.back);
                    }}
                  >
                    Zatwierdź
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCard(card.id, { mode: "display", editFront: card.front, editBack: card.back });
                    }}
                  >
                    Anuluj
                  </Button>
                </div>
              </div>
            ) : card.mode === "confirming-delete" ? (
              <div className="flex flex-col gap-2">
                <p className={cn("font-semibold text-white line-through")}>{card.front}</p>
                <p className="mt-1 text-sm text-blue-100/60 line-through">{card.back}</p>
                <p role="alert" className="text-sm text-red-400">
                  Czy na pewno chcesz usunąć tę fiszkę?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    aria-label="Potwierdź usunięcie fiszki"
                    onClick={() => {
                      void handleDelete(card);
                    }}
                  >
                    Potwierdź
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCard(card.id, { mode: "display" });
                    }}
                  >
                    Anuluj
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <p className="font-semibold text-white">{card.front}</p>
                  <p className="mt-1 text-sm text-blue-100/60">{card.back}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCard(card.id, { mode: "editing", error: null });
                    }}
                  >
                    Edytuj
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCard(card.id, { mode: "confirming-delete", error: null });
                    }}
                  >
                    Usuń
                  </Button>
                </div>
                {card.error && <ServerError message={card.error} />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

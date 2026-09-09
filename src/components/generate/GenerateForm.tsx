import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { DraftCard } from "@/types";

type CardStatus = "pending" | "accepted" | "editing" | "rejected";

interface CardReview {
  front: string;
  back: string;
  status: CardStatus;
  editFront: string;
  editBack: string;
}

export function GenerateForm() {
  const [text, setText] = useState("");
  const [reviews, setReviews] = useState<CardReview[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateReview = (index: number, patch: Partial<CardReview>) => {
    setReviews((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

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
        let errorMsg = "Nie udało się zapisać fiszek.";
        try {
          const data = (await res.json()) as { error?: string };
          errorMsg = data.error ?? errorMsg;
        } catch {
          // non-JSON error response
        }
        setSaveError(errorMsg);
        return;
      }
      window.location.href = "/deck";
    } catch {
      setSaveError("Nie udało się połączyć z serwerem.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    setReviews([]);
    setSaveError(null);

    let response: Response;
    try {
      response = await fetch("/api/cards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
      setIsGenerating(false);
      return;
    }

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Nie udało się wygenerować fiszek. Spróbuj ponownie.");
      setIsGenerating(false);
      return;
    }

    if (!response.body) {
      setError("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
      setIsGenerating(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = "";
    let rawBuffer = "";
    let cardsEmitted = 0;

    try {
      let shouldRead = true;
      while (shouldRead) {
        const { done, value } = await reader.read();
        if (done) {
          shouldRead = false;
        } else {
          const chunk = decoder.decode(value, { stream: true });
          rawBuffer += chunk;
          lineBuffer += chunk;

          let nl: number;
          while ((nl = lineBuffer.indexOf("\n")) !== -1) {
            const line = lineBuffer.slice(0, nl).trim();
            lineBuffer = lineBuffer.slice(nl + 1);
            if (!line) continue;
            try {
              const card = JSON.parse(line) as Record<string, unknown>;
              if (typeof card.front === "string" && typeof card.back === "string") {
                const newCard: DraftCard = { front: card.front, back: card.back };
                setReviews((prev) => [
                  ...prev,
                  {
                    front: newCard.front,
                    back: newCard.back,
                    status: "pending",
                    editFront: newCard.front,
                    editBack: newCard.back,
                  },
                ]);
                cardsEmitted++;
              }
            } catch {
              // partial or non-card line
            }
          }
        }
      }

      // Flush remaining lineBuffer
      const remaining = lineBuffer.trim();
      if (remaining) {
        try {
          const card = JSON.parse(remaining) as Record<string, unknown>;
          if (typeof card.front === "string" && typeof card.back === "string") {
            setReviews((prev) => [
              ...prev,
              {
                front: card.front as string,
                back: card.back as string,
                status: "pending",
                editFront: card.front as string,
                editBack: card.back as string,
              },
            ]);
            cardsEmitted++;
          }
        } catch {
          // not a valid card
        }
      }

      // Fallback: try rawBuffer as a JSON array
      if (cardsEmitted === 0) {
        if (rawBuffer.trim()) {
          try {
            const arr = JSON.parse(rawBuffer.trim()) as unknown;
            if (Array.isArray(arr)) {
              const parsed = (arr as Record<string, unknown>[])
                .filter((item) => typeof item.front === "string" && typeof item.back === "string")
                .map((item) => ({
                  front: item.front as string,
                  back: item.back as string,
                  status: "pending",
                  editFront: item.front as string,
                  editBack: item.back as string,
                }));
              if (parsed.length > 0) {
                setReviews(parsed);
              } else {
                setError("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
              }
            } else {
              setError("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
            }
          } catch {
            setError("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
          }
        } else {
          setError("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
        }
      }
    } catch {
      setError("Nie udało się wygenerować fiszek. Spróbuj ponownie.");
    } finally {
      setIsGenerating(false);
    }
  };

  const acceptedCount = reviews.filter((r) => r.status === "accepted").length;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            minLength={50}
            maxLength={5000}
            placeholder="Wklej tekst źródłowy (50–5000 znaków)..."
            rows={8}
            className="w-full resize-none rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
          />
          <p className={cn("text-right text-xs", text.length > 5000 ? "text-red-400" : "text-white/50")}>
            {text.length}/5000
          </p>
        </div>
        <ServerError message={error} />
        <Button type="submit" disabled={isGenerating || text.length < 50 || text.length > 5000} className="self-start">
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Generowanie...
            </span>
          ) : (
            "Generuj fiszki"
          )}
        </Button>
      </form>

      {reviews.length > 0 && (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {reviews.map((review, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-lg border p-4 transition-opacity",
                  review.status === "accepted" && "border-emerald-500/50 bg-emerald-950/20",
                  review.status === "pending" && "border-white/10 bg-white/5",
                  review.status === "editing" && "border-blue-400/40 bg-blue-950/20",
                  review.status === "rejected" && "border-white/10 bg-white/5 opacity-50",
                )}
              >
                {review.status === "editing" ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={review.editFront}
                      onChange={(e) => {
                        updateReview(i, { editFront: e.target.value });
                      }}
                      rows={2}
                      aria-label="Przód fiszki"
                      className="w-full resize-none rounded border border-white/20 bg-white/10 p-2 text-sm text-white focus:ring-1 focus:ring-blue-400/50 focus:outline-none"
                    />
                    <textarea
                      value={review.editBack}
                      onChange={(e) => {
                        updateReview(i, { editBack: e.target.value });
                      }}
                      rows={2}
                      aria-label="Tył fiszki"
                      className="w-full resize-none rounded border border-white/20 bg-white/10 p-2 text-sm text-blue-100/70 focus:ring-1 focus:ring-blue-400/50 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          updateReview(i, {
                            status: "accepted",
                            front: review.editFront,
                            back: review.editBack,
                          });
                        }}
                      >
                        Zatwierdź
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateReview(i, { status: "pending", editFront: review.front, editBack: review.back });
                        }}
                      >
                        Anuluj
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div>
                      <p
                        className={cn(
                          "text-sm font-semibold text-white",
                          review.status === "rejected" && "line-through",
                        )}
                      >
                        {review.front}
                      </p>
                      <p
                        className={cn("mt-1 text-sm text-blue-100/70", review.status === "rejected" && "line-through")}
                      >
                        {review.back}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {review.status === "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            updateReview(i, { status: "pending" });
                          }}
                        >
                          Przywróć
                        </Button>
                      ) : (
                        <>
                          {review.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                updateReview(i, { status: "accepted" });
                              }}
                            >
                              Akceptuj
                            </Button>
                          )}
                          {review.status === "accepted" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                updateReview(i, { status: "pending" });
                              }}
                            >
                              Cofnij
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              updateReview(i, { status: "editing" });
                            }}
                          >
                            Edytuj
                          </Button>
                          {review.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                updateReview(i, { status: "rejected" });
                              }}
                            >
                              Odrzuć
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <Button
            onClick={handleSave}
            disabled={acceptedCount === 0 || isSaving || isGenerating}
            className="self-start"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Zapisywanie...
              </span>
            ) : (
              `Zapisz zaakceptowane (${acceptedCount})`
            )}
          </Button>
          <ServerError message={saveError} />
        </div>
      )}
    </div>
  );
}

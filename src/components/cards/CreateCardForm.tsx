import { useState } from "react";

import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CreateCardForm() {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frontTrimmed = front.trim();
  const backTrimmed = back.trim();
  const canSubmit =
    frontTrimmed.length >= 1 && frontTrimmed.length <= 1000 && backTrimmed.length >= 1 && backTrimmed.length <= 1000;

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [{ front: frontTrimmed, back: backTrimmed }] }),
      });
      if (!res.ok) {
        let msg = "Nie udało się zapisać fiszki.";
        try {
          const data = (await res.json()) as { error?: string };
          msg = data.error ?? msg;
        } catch {
          // non-JSON response
        }
        setError(msg);
        return;
      }
      window.location.href = "/deck";
    } catch {
      setError("Nie udało się połączyć z serwerem.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex w-full flex-col gap-3 text-left">
      <h2 className="text-sm font-semibold text-white/70">Utwórz fiszkę ręcznie</h2>
      <div className="flex flex-col gap-1">
        <textarea
          value={front}
          onChange={(e) => {
            setFront(e.target.value);
          }}
          placeholder="Przód (pytanie / prompt)"
          maxLength={1000}
          rows={3}
          aria-label="Przód fiszki"
          className="w-full resize-none rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        />
        <p className={cn("text-right text-xs", front.length > 1000 ? "text-red-400" : "text-white/40")}>
          {front.length}/1000
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <textarea
          value={back}
          onChange={(e) => {
            setBack(e.target.value);
          }}
          placeholder="Tył (odpowiedź)"
          maxLength={1000}
          rows={3}
          aria-label="Tył fiszki"
          className="w-full resize-none rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-blue-400/50 focus:outline-none"
        />
        <p className={cn("text-right text-xs", back.length > 1000 ? "text-red-400" : "text-white/40")}>
          {back.length}/1000
        </p>
      </div>
      <ServerError message={error} />
      <Button type="submit" disabled={!canSubmit || isSubmitting} className="self-start">
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Zapisywanie...
          </span>
        ) : (
          "Dodaj fiszkę"
        )}
      </Button>
    </form>
  );
}

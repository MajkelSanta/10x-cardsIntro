import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { DraftCard } from "@/types";

export function GenerateForm() {
  const [text, setText] = useState("");
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    setCards([]);

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
                setCards((prev) => [...prev, newCard]);
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
            setCards((prev) => [...prev, { front: card.front as string, back: card.back as string }]);
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
              const parsed: DraftCard[] = (arr as Record<string, unknown>[])
                .filter((item) => typeof item.front === "string" && typeof item.back === "string")
                .map((item) => ({ front: item.front as string, back: item.back as string }));
              if (parsed.length > 0) {
                setCards(parsed);
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

      {cards.length > 0 && (
        <ul className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">{card.front}</p>
              <p className="mt-1 text-sm text-blue-100/70">{card.back}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

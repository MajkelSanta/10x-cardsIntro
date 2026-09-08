import type { APIRoute } from "astro";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";

const SYSTEM_PROMPT = `You are a flashcard generator. Generate exactly 10 flashcards from the provided text.
Output each flashcard on a separate line as a JSON object with exactly these two keys: {"front":"...","back":"..."}.
Output only the 10 JSON lines — no other text, no numbering, no markdown formatting.`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let text: string;
  try {
    const body = (await context.request.json()) as { text?: unknown };
    const rawText = body.text;
    if (typeof rawText !== "string") {
      return new Response(JSON.stringify({ error: "text field is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    text = rawText;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (text.length < 50) {
    return new Response(JSON.stringify({ error: "Text must be at least 50 characters" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (text.length > 5000) {
    return new Response(JSON.stringify({ error: "Text must not exceed 5000 characters" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const model = OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
  } catch {
    return new Response(JSON.stringify({ error: "Generation failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return new Response(JSON.stringify({ error: "Generation failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstreamBody = upstreamResponse.body;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = upstreamBody.getReader();

      let sseBuffer = "";
      let cardBuffer = "";
      let rawBuffer = "";
      let cardsEmitted = 0;

      try {
        let sseStreamDone = false;
        while (!sseStreamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = sseBuffer.indexOf("\n")) !== -1) {
            const sseLine = sseBuffer.slice(0, nl).trim();
            sseBuffer = sseBuffer.slice(nl + 1);

            if (!sseLine.startsWith("data:")) continue;
            const payload = sseLine.slice(5).trim();
            if (payload === "[DONE]") {
              sseStreamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
              const content = parsed.choices?.[0]?.delta?.content;
              if (typeof content !== "string") continue;

              rawBuffer += content;
              cardBuffer += content;

              let cnl: number;
              while ((cnl = cardBuffer.indexOf("\n")) !== -1) {
                const cardLine = cardBuffer.slice(0, cnl).trim();
                cardBuffer = cardBuffer.slice(cnl + 1);
                if (!cardLine) continue;
                try {
                  const card = JSON.parse(cardLine) as Record<string, unknown>;
                  if (typeof card.front === "string" && typeof card.back === "string") {
                    controller.enqueue(encoder.encode(cardLine + "\n"));
                    cardsEmitted++;
                  }
                } catch {
                  // incomplete or non-card JSON line
                }
              }
            } catch {
              // not valid SSE JSON payload
            }
          }
        }

        // Flush any remaining content in cardBuffer
        const remaining = cardBuffer.trim();
        if (remaining) {
          try {
            const card = JSON.parse(remaining) as Record<string, unknown>;
            if (typeof card.front === "string" && typeof card.back === "string") {
              controller.enqueue(encoder.encode(remaining + "\n"));
              cardsEmitted++;
            }
          } catch {
            // not a valid card
          }
        }

        // Fallback: if no cards emitted, try rawBuffer as a JSON array
        if (cardsEmitted === 0 && rawBuffer.trim()) {
          try {
            const arr = JSON.parse(rawBuffer.trim()) as unknown;
            if (Array.isArray(arr)) {
              for (const item of arr as Record<string, unknown>[]) {
                if (typeof item.front === "string" && typeof item.back === "string") {
                  controller.enqueue(encoder.encode(JSON.stringify({ front: item.front, back: item.back }) + "\n"));
                }
              }
            }
          } catch {
            // rawBuffer was not a JSON array
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
};

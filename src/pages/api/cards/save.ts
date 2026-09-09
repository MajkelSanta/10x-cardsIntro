import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { cards?: unknown };
  try {
    body = (await context.request.json()) as { cards?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { cards } = body;

  if (!Array.isArray(cards) || cards.length === 0) {
    return new Response(JSON.stringify({ error: "cards must be a non-empty array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (cards.length > 100) {
    return new Response(JSON.stringify({ error: "Too many cards (max 100)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const card of cards) {
    const c = card as { front?: unknown; back?: unknown };
    if (typeof c.front !== "string" || typeof c.back !== "string" || !c.front.trim() || !c.back.trim()) {
      return new Response(JSON.stringify({ error: "Each card must have non-empty front and back" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (c.front.trim().length > 1000 || c.back.trim().length > 1000) {
      return new Response(JSON.stringify({ error: "Card front/back too long (max 1000 characters)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const rows = (cards as { front: string; back: string }[]).map((card) => ({
    user_id: user.id,
    front: card.front.trim(),
    back: card.back.trim(),
    stability: 0,
    difficulty: 0,
    due: now,
    state: 0,
    reps: 0,
    lapses: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    last_review: null,
  }));

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save cards" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ saved: rows.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

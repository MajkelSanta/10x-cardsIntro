import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const PUT: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing card id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { front?: unknown; back?: unknown };
  try {
    body = (await context.request.json()) as { front?: unknown; back?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { front, back } = body;
  if (typeof front !== "string" || typeof back !== "string" || !front.trim() || !back.trim()) {
    return new Response(JSON.stringify({ error: "front and back must be non-empty strings" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (front.trim().length > 1000 || back.trim().length > 1000) {
    return new Response(JSON.stringify({ error: "front/back too long (max 1000 characters)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("flashcards")
    .update({
      front: front.trim(),
      back: back.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to update card" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ updated: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing card id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("flashcards").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to delete card" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

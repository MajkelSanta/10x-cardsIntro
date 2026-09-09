import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./generate";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCtx({ user = { id: "user-1", email: "test@example.com" }, body = { text: "a".repeat(100) } } = {}) {
  return {
    locals: { user },
    request: { json: vi.fn().mockResolvedValue(body) },
  };
}

function makeSseStream(cards: { front: string; back: string }[]) {
  const encoder = new TextEncoder();
  const lines = cards
    .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(c) + "\n" } }] })}\n`)
    .join("");
  const done = "data: [DONE]\n";

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines + done));
      controller.close();
    },
  });
}

// ── auth ─────────────────────────────────────────────────────────────────────

describe("POST /api/cards/generate — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    const res = await POST(makeCtx({ user: null }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

// ── input validation ──────────────────────────────────────────────────────────

describe("POST /api/cards/generate — input validation", () => {
  it("returns 400 when request body is invalid JSON", async () => {
    const ctx = {
      locals: { user: { id: "user-1" } },
      request: { json: vi.fn().mockRejectedValue(new SyntaxError("bad json")) },
    };
    const res = await POST(ctx as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when text field is missing", async () => {
    const res = await POST(makeCtx({ body: {} }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when text is shorter than 50 characters", async () => {
    const res = await POST(makeCtx({ body: { text: "short" } }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/50/);
  });

  it("returns 400 when text is longer than 5000 characters", async () => {
    const res = await POST(makeCtx({ body: { text: "a".repeat(5001) } }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/5000/);
  });

  it("accepts text of exactly 50 characters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(makeSseStream([{ front: "Q", back: "A" }]), { status: 200 })),
    );
    const res = await POST(makeCtx({ body: { text: "a".repeat(50) } }) as never);
    expect(res.status).not.toBe(400);
    vi.unstubAllGlobals();
  });

  it("accepts text of exactly 5000 characters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(makeSseStream([{ front: "Q", back: "A" }]), { status: 200 })),
    );
    const res = await POST(makeCtx({ body: { text: "a".repeat(5000) } }) as never);
    expect(res.status).not.toBe(400);
    vi.unstubAllGlobals();
  });
});

// ── upstream errors ───────────────────────────────────────────────────────────

describe("POST /api/cards/generate — upstream errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 502 when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    const res = await POST(makeCtx() as never);
    expect(res.status).toBe(502);
  });

  it("returns 502 when OpenRouter responds with non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    const res = await POST(makeCtx() as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Generation failed" });
  });
});

// ── happy path ────────────────────────────────────────────────────────────────

describe("POST /api/cards/generate — streaming happy path", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          makeSseStream([
            { front: "What is the capital of France?", back: "Paris" },
            { front: "What is 2 + 2?", back: "4" },
          ]),
          { status: 200 },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 200 with Content-Type application/x-ndjson", async () => {
    const res = await POST(makeCtx() as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
  });

  it("streams valid NDJSON lines with front and back fields", async () => {
    const res = await POST(makeCtx() as never);
    const text = await res.text();
    const lines = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { front: string; back: string });

    expect(lines.length).toBeGreaterThan(0);
    for (const card of lines) {
      expect(typeof card.front).toBe("string");
      expect(typeof card.back).toBe("string");
    }
  });

  it("calls OpenRouter with the correct model and stream flag", async () => {
    await POST(makeCtx() as never);
    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body as string) as { stream: boolean; model: string };
    expect(body.stream).toBe(true);
    expect(typeof body.model).toBe("string");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./save";

const { mockInsert, createClientMock } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const createClientMock = vi.fn().mockReturnValue({
    from: () => ({ insert: mockInsert }),
  });
  return { mockInsert, createClientMock };
});

vi.mock("@/lib/supabase", () => ({ createClient: createClientMock }));

function makeCtx({
  user = { id: "user-1", email: "test@example.com" } as { id: string; email: string } | null,
  body = { cards: [{ front: "Q1", back: "A1" }] } as unknown,
} = {}) {
  return {
    locals: { user },
    request: {
      json: vi.fn().mockResolvedValue(body),
      headers: new Headers(),
    },
    cookies: {},
  };
}

describe("POST /api/cards/save — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    const res = await POST(makeCtx({ user: null }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("POST /api/cards/save — input validation", () => {
  beforeEach(() => {
    mockInsert.mockResolvedValue({ error: null });
  });

  it("returns 400 when cards key is missing from body", async () => {
    const res = await POST(makeCtx({ body: {} }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when cards is an empty array", async () => {
    const res = await POST(makeCtx({ body: { cards: [] } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when a card has empty front after trim", async () => {
    const res = await POST(makeCtx({ body: { cards: [{ front: "  ", back: "A" }] } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when a card has empty back after trim", async () => {
    const res = await POST(makeCtx({ body: { cards: [{ front: "Q", back: "  " }] } }) as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/cards/save — happy path", () => {
  beforeEach(() => {
    mockInsert.mockResolvedValue({ error: null });
  });

  it("returns 200 with { saved: N } for N cards", async () => {
    const cards = [
      { front: "Q1", back: "A1" },
      { front: "Q2", back: "A2" },
    ];
    const res = await POST(makeCtx({ body: { cards } }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: 2 });
  });

  it("calls supabase.insert with correct rows including user_id, trimmed text, and FSRS zero-values", async () => {
    const cards = [{ front: "  Q  ", back: "  A  " }];
    await POST(makeCtx({ body: { cards } }) as never);
    const [rows] = mockInsert.mock.calls[0] as [Record<string, unknown>[]];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.user_id).toBe("user-1");
    expect(row.front).toBe("Q");
    expect(row.back).toBe("A");
    expect(row.stability).toBe(0);
    expect(row.difficulty).toBe(0);
    expect(row.state).toBe(0);
    expect(row.reps).toBe(0);
    expect(row.lapses).toBe(0);
    expect(row.elapsed_days).toBe(0);
    expect(row.scheduled_days).toBe(0);
    expect(row.last_review).toBeNull();
  });
});

describe("POST /api/cards/save — database error", () => {
  it("returns 500 when supabase insert returns an error", async () => {
    mockInsert.mockResolvedValue({ error: { message: "db error" } });
    const res = await POST(makeCtx() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save cards" });
  });
});

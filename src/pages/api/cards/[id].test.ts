import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT, DELETE } from "./[id]";

const {
  mockSelectUpdate,
  mockEqUpdateInner,
  mockEqUpdateOuter,
  mockUpdate,
  mockEqDelete,
  mockEqDeleteOuter,
  createClientMock,
} = vi.hoisted(() => {
  const mockSelectUpdate = vi
    .fn()
    .mockResolvedValue({ data: [{ id: "00000000-0000-0000-0000-000000000001" }], error: null });
  const mockEqUpdateInner = vi.fn().mockReturnValue({ select: mockSelectUpdate });
  const mockEqUpdateOuter = vi.fn().mockReturnValue({ eq: mockEqUpdateInner });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdateOuter });
  const mockEqDelete = vi.fn().mockResolvedValue({ error: null, count: 1 });
  const mockEqDeleteOuter = vi.fn().mockReturnValue({ eq: mockEqDelete });
  const mockDelete = vi.fn().mockReturnValue({ eq: mockEqDeleteOuter });

  const createClientMock = vi.fn().mockReturnValue({
    from: () => ({ update: mockUpdate, delete: mockDelete }),
  });

  return {
    mockSelectUpdate,
    mockEqUpdateInner,
    mockEqUpdateOuter,
    mockUpdate,
    mockEqDelete,
    mockEqDeleteOuter,
    createClientMock,
  };
});

vi.mock("@/lib/supabase", () => ({ createClient: createClientMock }));

function makePutCtx({
  user = { id: "user-1", email: "test@example.com" },
  body = { front: "Q", back: "A" },
  params = { id: "00000000-0000-0000-0000-000000000001" },
}: {
  user?: { id: string; email: string } | null;
  body?: Record<string, unknown>;
  params?: { id?: string };
} = {}) {
  return {
    locals: { user },
    request: {
      json: vi.fn().mockResolvedValue(body),
      headers: new Headers(),
    },
    cookies: {},
    params,
  };
}

function makeDeleteCtx({
  user = { id: "user-1", email: "test@example.com" },
  params = { id: "00000000-0000-0000-0000-000000000001" },
}: {
  user?: { id: string; email: string } | null;
  params?: { id?: string };
} = {}) {
  return {
    locals: { user },
    request: { headers: new Headers() },
    cookies: {},
    params,
  };
}

// ── PUT ─────────────────────────────────────────────────────────────────────

describe("PUT /api/cards/[id] — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    const res = await PUT(makePutCtx({ user: null }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("PUT /api/cards/[id] — id validation", () => {
  it("returns 400 when id param is missing", async () => {
    const res = await PUT(makePutCtx({ params: {} }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing card id" });
  });

  it("returns 400 when id param is not a valid UUID", async () => {
    const res = await PUT(makePutCtx({ params: { id: "not-a-uuid" } }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid card id" });
  });
});

describe("PUT /api/cards/[id] — input validation", () => {
  beforeEach(() => {
    mockSelectUpdate.mockResolvedValue({ data: [{ id: "card-1" }], error: null });
  });

  it("returns 400 when front is missing", async () => {
    const res = await PUT(makePutCtx({ body: { back: "A" } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when back is missing", async () => {
    const res = await PUT(makePutCtx({ body: { front: "Q" } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when front is empty after trim", async () => {
    const res = await PUT(makePutCtx({ body: { front: "   ", back: "A" } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when back is empty after trim", async () => {
    const res = await PUT(makePutCtx({ body: { front: "Q", back: "   " } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when front exceeds 1000 characters", async () => {
    const res = await PUT(makePutCtx({ body: { front: "x".repeat(1001), back: "A" } }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when back exceeds 1000 characters", async () => {
    const res = await PUT(makePutCtx({ body: { front: "Q", back: "x".repeat(1001) } }) as never);
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/cards/[id] — happy path", () => {
  beforeEach(() => {
    mockSelectUpdate.mockResolvedValue({ data: [{ id: "card-1" }], error: null });
  });

  it("returns 200 with { updated: true }", async () => {
    const res = await PUT(makePutCtx() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: true });
  });

  it("calls supabase.update with trimmed values and filters by id and user_id", async () => {
    const cardId = "00000000-0000-0000-0000-000000000042";
    await PUT(makePutCtx({ body: { front: "  Q  ", back: "  A  " }, params: { id: cardId } }) as never);
    const [updatePayload] = mockUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(updatePayload.front).toBe("Q");
    expect(updatePayload.back).toBe("A");
    expect(updatePayload.updated_at).toBeDefined();
    expect(mockEqUpdateOuter).toHaveBeenCalledWith("id", cardId);
    expect(mockEqUpdateInner).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("PUT /api/cards/[id] — not found", () => {
  it("returns 404 when card does not exist or is not owned by user", async () => {
    mockSelectUpdate.mockResolvedValue({ data: [], error: null });
    const res = await PUT(makePutCtx() as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Card not found" });
  });
});

describe("PUT /api/cards/[id] — service unavailable", () => {
  it("returns 503 when createClient returns null", async () => {
    createClientMock.mockReturnValueOnce(null);
    const res = await PUT(makePutCtx() as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service unavailable" });
  });
});

describe("PUT /api/cards/[id] — database error", () => {
  it("returns 500 when supabase update returns an error", async () => {
    mockSelectUpdate.mockResolvedValue({ data: null, error: { message: "db error" } });
    const res = await PUT(makePutCtx() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update card" });
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/cards/[id] — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    const res = await DELETE(makeDeleteCtx({ user: null }) as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("DELETE /api/cards/[id] — id validation", () => {
  it("returns 400 when id param is missing", async () => {
    const res = await DELETE(makeDeleteCtx({ params: {} }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing card id" });
  });

  it("returns 400 when id param is not a valid UUID", async () => {
    const res = await DELETE(makeDeleteCtx({ params: { id: "not-a-uuid" } }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid card id" });
  });
});

describe("DELETE /api/cards/[id] — happy path", () => {
  beforeEach(() => {
    mockEqDelete.mockResolvedValue({ error: null, count: 1 });
  });

  it("returns 200 with { deleted: true }", async () => {
    const res = await DELETE(makeDeleteCtx() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });

  it("calls supabase.delete with id and user_id filters", async () => {
    const cardId = "00000000-0000-0000-0000-000000000099";
    await DELETE(makeDeleteCtx({ params: { id: cardId } }) as never);
    expect(mockEqDeleteOuter).toHaveBeenCalledWith("id", cardId);
    expect(mockEqDelete).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("DELETE /api/cards/[id] — not found", () => {
  it("returns 404 when card does not exist or is not owned by user", async () => {
    mockEqDelete.mockResolvedValue({ error: null, count: 0 });
    const res = await DELETE(makeDeleteCtx() as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Card not found" });
  });
});

describe("DELETE /api/cards/[id] — service unavailable", () => {
  it("returns 503 when createClient returns null", async () => {
    createClientMock.mockReturnValueOnce(null);
    const res = await DELETE(makeDeleteCtx() as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service unavailable" });
  });
});

describe("DELETE /api/cards/[id] — database error", () => {
  it("returns 500 when supabase delete returns an error", async () => {
    mockEqDelete.mockResolvedValue({ error: { message: "db error" }, count: null });
    const res = await DELETE(makeDeleteCtx() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete card" });
  });
});

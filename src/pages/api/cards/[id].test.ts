import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT, DELETE } from "./[id]";

const { mockEqDelete, mockEqUpdateInner, mockEqUpdateOuter, mockUpdate, mockDelete, createClientMock } = vi.hoisted(
  () => {
    const mockEqDelete = vi.fn().mockResolvedValue({ error: null });
    const mockEqUpdateInner = vi.fn().mockResolvedValue({ error: null });
    const mockEqUpdateOuter = vi.fn().mockReturnValue({ eq: mockEqUpdateInner });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqUpdateOuter });
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEqDelete }) });

    const createClientMock = vi.fn().mockReturnValue({
      from: () => ({ update: mockUpdate, delete: mockDelete }),
    });

    return { mockEqDelete, mockEqUpdateInner, mockEqUpdateOuter, mockUpdate, mockDelete, createClientMock };
  },
);

vi.mock("@/lib/supabase", () => ({ createClient: createClientMock }));

function makePutCtx({
  user = { id: "user-1", email: "test@example.com" },
  body = { front: "Q", back: "A" },
  params = { id: "card-1" },
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
  params = { id: "card-1" },
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
});

describe("PUT /api/cards/[id] — input validation", () => {
  beforeEach(() => {
    mockEqUpdateInner.mockResolvedValue({ error: null });
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
    mockEqUpdateInner.mockResolvedValue({ error: null });
  });

  it("returns 200 with { updated: true }", async () => {
    const res = await PUT(makePutCtx() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: true });
  });

  it("calls supabase.update with trimmed values and filters by id and user_id", async () => {
    await PUT(makePutCtx({ body: { front: "  Q  ", back: "  A  " }, params: { id: "card-42" } }) as never);
    const [updatePayload] = mockUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(updatePayload.front).toBe("Q");
    expect(updatePayload.back).toBe("A");
    expect(updatePayload.updated_at).toBeDefined();
    expect(mockEqUpdateOuter).toHaveBeenCalledWith("id", "card-42");
    expect(mockEqUpdateInner).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("PUT /api/cards/[id] — database error", () => {
  it("returns 500 when supabase update returns an error", async () => {
    mockEqUpdateInner.mockResolvedValue({ error: { message: "db error" } });
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
});

describe("DELETE /api/cards/[id] — happy path", () => {
  beforeEach(() => {
    mockEqDelete.mockResolvedValue({ error: null });
  });

  it("returns 200 with { deleted: true }", async () => {
    const res = await DELETE(makeDeleteCtx() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });

  it("calls supabase.delete with id and user_id filters", async () => {
    await DELETE(makeDeleteCtx({ params: { id: "card-99" } }) as never);
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe("DELETE /api/cards/[id] — database error", () => {
  it("returns 500 when supabase delete returns an error", async () => {
    mockEqDelete.mockResolvedValue({ error: { message: "db error" } });
    const res = await DELETE(makeDeleteCtx() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to delete card" });
  });
});

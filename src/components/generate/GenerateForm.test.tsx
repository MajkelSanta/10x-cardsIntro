import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerateForm } from "./GenerateForm";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeNdjsonStream(cards: { front: string; back: string }[]) {
  const encoder = new TextEncoder();
  const ndjson = cards.map((c) => JSON.stringify(c)).join("\n") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ndjson));
      controller.close();
    },
  });
}

function stubFetchOk(cards: { front: string; back: string }[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(makeNdjsonStream(cards), { status: 200 })));
}

function stubFetchError(status: number, error: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── button disabled logic ─────────────────────────────────────────────────────

describe("GenerateForm — button disabled logic", () => {
  it("button is disabled when textarea is empty", () => {
    render(<GenerateForm />);
    expect(screen.getByRole("button", { name: /generuj fiszki/i })).toBeDisabled();
  });

  it("button is disabled when text is shorter than 50 characters", async () => {
    const user = userEvent.setup();
    render(<GenerateForm />);
    await user.type(screen.getByRole("textbox"), "short");
    expect(screen.getByRole("button", { name: /generuj fiszki/i })).toBeDisabled();
  });

  it("button is enabled when text is between 50 and 5000 characters", () => {
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    expect(screen.getByRole("button", { name: /generuj fiszki/i })).not.toBeDisabled();
  });

  it("button is disabled when text exceeds 5000 characters", () => {
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(5001) } });
    expect(screen.getByRole("button", { name: /generuj fiszki/i })).toBeDisabled();
  });
});

// ── character counter ─────────────────────────────────────────────────────────

describe("GenerateForm — character counter", () => {
  it("shows 0/5000 initially", () => {
    render(<GenerateForm />);
    expect(screen.getByText("0/5000")).toBeInTheDocument();
  });

  it("updates counter as user types", async () => {
    const user = userEvent.setup();
    render(<GenerateForm />);
    await user.type(screen.getByRole("textbox"), "hello");
    expect(screen.getByText("5/5000")).toBeInTheDocument();
  });

  it("counter turns red when text exceeds 5000 characters", () => {
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(5001) } });
    const counter = screen.getByText("5001/5000");
    expect(counter).toHaveClass("text-red-400");
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe("GenerateForm — error handling", () => {
  it("displays error message when API returns an error", async () => {
    stubFetchError(503, "Service unavailable");
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => {
      expect(screen.getByText("Service unavailable")).toBeInTheDocument();
    });
  });

  it("displays fallback error when API body has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => {
      expect(screen.getByText(/nie udało się wygenerować/i)).toBeInTheDocument();
    });
  });

  it("clears previous error when a new generation starts", async () => {
    stubFetchError(503, "First error");
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => expect(screen.getByText("First error")).toBeInTheDocument());

    stubFetchOk([{ front: "Q", back: "A" }]);
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => expect(screen.queryByText("First error")).not.toBeInTheDocument());
  });
});

// ── happy path ────────────────────────────────────────────────────────────────

describe("GenerateForm — happy path", () => {
  it("renders received cards after successful generation", async () => {
    stubFetchOk([
      { front: "What is the capital of France?", back: "Paris" },
      { front: "What is 2 + 2?", back: "4" },
    ]);
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => {
      expect(screen.getByText("What is the capital of France?")).toBeInTheDocument();
      expect(screen.getByText("Paris")).toBeInTheDocument();
      expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
    });
  });

  it("clears previous cards when a new generation starts", async () => {
    stubFetchOk([{ front: "Old card", back: "Old answer" }]);
    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => expect(screen.getByText("Old card")).toBeInTheDocument());

    stubFetchOk([{ front: "New card", back: "New answer" }]);
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));
    await waitFor(() => {
      expect(screen.queryByText("Old card")).not.toBeInTheDocument();
      expect(screen.getByText("New card")).toBeInTheDocument();
    });
  });

  it("button shows loading state during generation", async () => {
    let resolveStream!: () => void;
    const neverEndingStream = new ReadableStream({
      start() {
        void new Promise<void>((r) => (resolveStream = r));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(neverEndingStream, { status: 200 })));

    render(<GenerateForm />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(100) } });
    await userEvent.click(screen.getByRole("button", { name: /generuj fiszki/i }));

    await waitFor(() => {
      expect(screen.getByText(/generowanie/i)).toBeInTheDocument();
    });

    resolveStream();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { UiLabPage } from "./ui-lab-page";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UI lab", () => {
  it("renders the TanStack Table piece", () => {
    render(<UiLabPage />);

    expect(screen.getByRole("cell", { name: "Ada Lovelace" })).toBeTruthy();
  });

  it("renders the TanStack Charts piece", () => {
    render(<UiLabPage />);

    expect(screen.getByRole("img", { name: "Weekly focus minutes" })).toBeTruthy();
  });

  it("renders the dnd kit sortable list piece", () => {
    render(<UiLabPage />);

    expect(screen.getByRole("list", { name: "Sample tasks" })).toBeTruthy();
    expect(screen.getByText("Draft roadmap")).toBeTruthy();
  });

  it("renders the Excalidraw board wrapper inside its loading boundary", () => {
    render(<UiLabPage />);

    expect(screen.getByRole("region", { name: "Drawing board" })).toBeTruthy();
  });

  it("renders the Magic UI piece", () => {
    render(<UiLabPage />);

    expect(screen.getByText("Small steps, steady progress")).toBeTruthy();
  });

  it("renders the Motion Primitives piece", () => {
    render(<UiLabPage />);

    expect(screen.getByText("Motion primitive sample")).toBeTruthy();
  });

  it("renders the Kibo UI code block piece", () => {
    render(<UiLabPage />);

    expect(screen.getByText("const answer = 42")).toBeTruthy();
  });

  it("renders the Amicro piece", () => {
    render(<UiLabPage />);

    expect(screen.getByText("Amicro animation sample")).toBeTruthy();
  });

  it("renders the MDXCN Callout piece", () => {
    render(<UiLabPage />);

    expect(screen.getAllByRole("note")).toHaveLength(2);
    expect(screen.getByText("MDXCN callout sample")).toBeTruthy();
    expect(screen.getByText("Provider content from MDX.")).toBeTruthy();
  });

  it("renders the UI lab through App at /ui-lab", async () => {
    window.history.replaceState({}, "", "/ui-lab");

    render(<App />);

    // The route is behind a dynamic import, so the lab resolves one tick later.
    expect(await screen.findByRole("heading", { level: 1, name: "UI Lab" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Drawing board" })).toBeTruthy();
  });
});

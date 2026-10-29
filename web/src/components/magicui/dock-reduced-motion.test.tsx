import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

Object.defineProperty(window, "requestAnimationFrame", {
  configurable: true,
  writable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
});
Object.defineProperty(window, "cancelAnimationFrame", {
  configurable: true,
  writable: true,
  value: (id: number) => window.clearTimeout(id),
});

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as unknown as typeof IntersectionObserver;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

describe("Dock reduced motion", () => {
  it("keeps icon dimensions at rest when the user prefers reduced motion", async () => {
    const { Dock, DockIcon } = await import("@/components/magicui/dock");
    render(<Dock aria-label="Reduced motion dock"><DockIcon aria-label="Reduced motion item">Item</DockIcon></Dock>);
    const dock = screen.getByLabelText("Reduced motion dock");
    const icon = screen.getByLabelText("Reduced motion item");
    vi.spyOn(icon, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 0, width: 40, height: 40, top: 0, right: 140, bottom: 40, left: 100,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(dock, { pageX: 120 });
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    expect(icon.style.width).toBe("40px");
    expect(icon.style.height).toBe("40px");
  });
});

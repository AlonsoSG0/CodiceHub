import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphHeatmap } from "@/components/mdxcn/graph-heatmap";

// jsdom has no IntersectionObserver, and the vendored component reveals its rows with `whileInView`.
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The legend paints one of every glyph, so a cell must always be read from inside its row. */
function cellsOf(label: string): HTMLElement[] {
  const row = screen.getByText(label).closest("li");
  if (!row) throw new Error(`the row labelled ${label} did not render`);
  return [...row.querySelectorAll<HTMLElement>("[aria-hidden='true']")];
}

describe("MDXCN GraphHeatmap", () => {
  it("renders the frame title and one intensity glyph per cell", () => {
    render(
      <GraphHeatmap
        title="Habits"
        columns={["L", "M"]}
        rows={[{ label: "Lectura", values: [4, 0] }]}
      />,
    );

    expect(screen.getByText(/Habits/)).toBeInTheDocument();
    expect(cellsOf("Lectura")).toHaveLength(2);
  });

  it("maps a full day to the accent token and an empty day to the frame token", () => {
    render(
      <GraphHeatmap
        title="Habits"
        columns={["L", "M"]}
        rows={[{ label: "Lectura", values: [4, 0] }]}
      />,
    );

    const [full, empty] = cellsOf("Lectura");

    expect(full!.textContent).toBe("█");
    expect(full!.className).toContain("text-graph-accent");
    expect(empty!.textContent).toBe("·");
    expect(empty!.className).toContain("text-graph-frame");
  });

  it("keeps the scale comparable across rows through max", () => {
    render(
      <GraphHeatmap
        title="Habits"
        columns={["L"]}
        rows={[
          { label: "Lectura", values: [2] },
          { label: "Gym", values: [4] },
        ]}
        max={4}
      />,
    );

    // 2 of a locked 4 is a middle level, not the top one.
    expect(cellsOf("Lectura")[0]!.className).not.toContain("text-graph-accent");
    expect(cellsOf("Gym")[0]!.className).toContain("text-graph-accent");
  });
});

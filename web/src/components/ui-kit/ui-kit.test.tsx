import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DataTable, MiniChart, SortableList, BoardCanvas } from "./index";
import type { DataTableColumn } from "./index";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockExcalidraw = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));
vi.mock("@excalidraw/excalidraw", () => ({ Excalidraw: mockExcalidraw }));

afterEach(cleanup);

globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
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

describe("ui-kit wrappers", () => {
  it("renders data in the TanStack table", () => {
    interface Person { name: string; role: string }
    const columns: DataTableColumn<Person>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "role", header: "Role" },
    ];

    render(<DataTable columns={columns} data={[{ name: "Ada", role: "Engineer" }]} />);
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Ada" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Engineer" })).toBeTruthy();
  });

  it("renders chart data with its accessible label", () => {
    render(<MiniChart label="Weekly activity" data={[{ label: "Mon", value: 4 }, { label: "Tue", value: 7 }]} />);
    expect(screen.getByRole("img", { name: "Weekly activity" })).toBeTruthy();
  });

  it("renders the board through its lazy loading boundary", () => {
    render(<BoardCanvas fallback={<p>Board is loading</p>} />);
    expect(screen.getByText("Board is loading")).toBeTruthy();
  });

  it("forwards initial data and change handling to Excalidraw", async () => {
    const initialData = { elements: [], appState: { viewBackgroundColor: "#fff" } };
    const onChange = vi.fn();
    render(<BoardCanvas initialData={initialData} onChange={onChange} />);

    await waitFor(() => {
      expect(mockExcalidraw.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ initialData, onChange }),
      );
    });
  });

  it("renders sortable list items", () => {
    render(<SortableList items={["Alpha", "Beta"]} getItemId={(item) => item} renderItem={(item) => item} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Alpha"), expect.stringContaining("Beta")]));
  });

  it("reorders items through the accessible keyboard-operable controls", () => {
    const onItemsChange = vi.fn();
    render(<SortableList items={["Alpha", "Beta"]} getItemId={(item) => item} renderItem={(item) => item} onItemsChange={onItemsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Move Beta up" }));

    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Beta");
    expect(items[1].textContent).toContain("Alpha");
    expect(onItemsChange).toHaveBeenCalledWith(["Beta", "Alpha"]);
  });

  it("rejects static Excalidraw JavaScript imports anywhere under web/src", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const sourceFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const filePath = resolve(directory, entry);
        if (statSync(filePath).isDirectory()) visit(filePath);
        else if (/\.(?:[cm]?[jt]sx?)$/.test(filePath)) sourceFiles.push(filePath);
      }
    };
    visit(sourceRoot);

    const staticPackageImport = /^\s*import\s+(?!type\b|\s*\()(?:(?:[\w*\s{},]+)\s+from\s+)?["']@excalidraw\/excalidraw(?:\/(?!index\.css)[^"']*)?["']/m;
    const violations = sourceFiles.filter((filePath) => staticPackageImport.test(readFileSync(filePath, "utf8")));
    expect(violations).toEqual([]);
  });
});

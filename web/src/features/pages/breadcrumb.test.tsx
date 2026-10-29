import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { PageMeta } from "@/lib/api";
import { Breadcrumb } from "./breadcrumb";

const pages: PageMeta[] = [
  { id: "root", parentId: null, title: "Root page", icon: null, position: 0, updatedAt: "", deletedAt: null, favorite: false, sectionId: null },
  { id: "child", parentId: "root", title: "Child page", icon: null, position: 0, updatedAt: "", deletedAt: null, favorite: false, sectionId: null },
  { id: "leaf", parentId: "child", title: "Leaf page", icon: null, position: 0, updatedAt: "", deletedAt: null, favorite: false, sectionId: null },
];

function renderBreadcrumb(pageId: string | null, section: "Notes" | "Trash" | "UI Lab") {
  return render(
    <MemoryRouter>
      <Breadcrumb pages={pages} pageId={pageId} section={section as never} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("Breadcrumb", () => {
  it("shows one Notes crumb when no page is selected", () => {
    renderBreadcrumb(null, "Notes");

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getAllByRole("listitem").map((item) => item.textContent?.replaceAll("/", "").trim()))
      .toEqual(["My workspace", "Notes"]);
  });

  it("names Trash and never falls back to Welcome", () => {
    renderBreadcrumb(null, "Trash");

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent).toContain("Trash");
    expect(breadcrumb.textContent).not.toContain("Welcome");
  });

  it("shows the section and two ancestors before the selected page", () => {
    renderBreadcrumb("leaf", "Notes");

    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(breadcrumb.textContent?.replaceAll("/", " ").replace(/\s+/g, " ").trim())
      .toBe("My workspace Notes Root page Child page Leaf page");
    expect(within(breadcrumb).getAllByRole("listitem").map((item) => item.textContent?.replaceAll("/", "").trim()))
      .toEqual(["My workspace", "Notes", "Root page", "Child page", "Leaf page"]);
  });

  it("links the section crumb to the section root", () => {
    renderBreadcrumb("leaf", "Notes");

    expect(screen.getByRole("link", { name: "Notes" }).getAttribute("href")).toBe("/notes");
  });
});

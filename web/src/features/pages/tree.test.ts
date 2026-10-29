import { describe, expect, it } from "vitest";
import type { PageMeta } from "@/lib/api";
import * as treeModule from "./tree.js";
import type { PageTreeNode } from "./tree.js";
import { buildPageTree, getAncestorChain } from "./tree.js";

type DropIntent =
  | { kind: "before" | "after"; targetId: string }
  | { kind: "onto" | "first-child"; targetId: string }
  | { kind: "root"; sectionId?: string | null }
  | { kind: "position"; parentId: string | null; position: number };

type MoveResolution =
  | { ok: true; body: { parentId: string | null; position: number; sectionId?: string | null } }
  | { ok: false; reason: string };

type ResolvePageMove = (pages: PageMeta[], pageId: string, intent: DropIntent) => MoveResolution;
const resolvePageMove = (treeModule as unknown as { resolvePageMove?: ResolvePageMove }).resolvePageMove;

function resolveMove(pages: PageMeta[], pageId: string, intent: DropIntent): MoveResolution | undefined {
  return resolvePageMove?.(pages, pageId, intent);
}

function meta(id: string, parentId: string | null, position: number): PageMeta {
  return {
    id,
    parentId,
    title: id,
    icon: null,
    position,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    favorite: false,
    sectionId: null,
  };
}

describe("page tree utilities", () => {
  it("nests a flat page list and sorts siblings by position", () => {
    const tree = buildPageTree([
      meta("child-late", "root", 2),
      meta("root", null, 0),
      meta("child-early", "root", 0),
    ]);

    expect(tree).toEqual([
      {
        ...meta("root", null, 0),
        children: [
          { ...meta("child-early", "root", 0), children: [] },
          { ...meta("child-late", "root", 2), children: [] },
        ],
      },
    ]);
  });

  it("keeps multiple roots ordered by position", () => {
    expect(buildPageTree([meta("second", null, 1), meta("first", null, 0)]).map((node: PageTreeNode) => node.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps an orphan visible as a root instead of crashing or dropping it", () => {
    const orphan = meta("orphan", "missing-parent", 3);

    expect(buildPageTree([orphan])).toEqual([{ ...orphan, children: [] }]);
  });

  it("returns the root-to-page ancestor chain for a deep page", () => {
    const pages = [meta("root", null, 0), meta("middle", "root", 0), meta("leaf", "middle", 0)];

    expect(getAncestorChain(pages, "leaf").map((page: PageMeta) => page.id)).toEqual(["root", "middle", "leaf"]);
  });

  it("returns an empty chain for an unknown page", () => {
    expect(getAncestorChain([meta("root", null, 0)], "missing")).toEqual([]);
  });

  describe("page move intent resolution", () => {
    const siblings = [meta("a", null, 0), meta("b", null, 1), meta("c", null, 2)];

    it("moves above a sibling at its final 0-based position", () => {
      expect(resolveMove(siblings, "c", { kind: "before", targetId: "b" })).toEqual({
        ok: true,
        body: { parentId: null, position: 1 },
      });
    });

    it("moves below a sibling at its final 0-based position", () => {
      expect(resolveMove(siblings, "a", { kind: "after", targetId: "b" })).toEqual({
        ok: true,
        body: { parentId: null, position: 1 },
      });
    });

    it("re-parents onto a row after its existing children", () => {
      const pages = [
        meta("source", null, 0),
        meta("target", null, 1),
        meta("child", "target", 0),
      ];
      expect(resolveMove(pages, "source", { kind: "onto", targetId: "target" })).toEqual({
        ok: true,
        body: { parentId: "target", position: 1 },
      });
    });

    it("inserts into the gap before a target's first child", () => {
      const pages = [
        meta("source", null, 0),
        meta("target", null, 1),
        meta("first", "target", 0),
        meta("second", "target", 1),
      ];
      expect(resolveMove(pages, "source", { kind: "first-child", targetId: "target" })).toEqual({
        ok: true,
        body: { parentId: "target", position: 0 },
      });
    });

    it("counts root positions inside the destination shelf and reports a shelf change", () => {
      const pages = [
        meta("one", null, 0),
        { ...meta("source", "one", 0) },
        { ...meta("other", null, 0), sectionId: "reading" },
      ];

      // Same shelf: the payload stays the one an ordinary move always sent.
      expect(resolveMove(pages, "source", { kind: "root", sectionId: null })).toEqual({
        ok: true,
        body: { parentId: null, position: 1 },
      });

      // Another shelf: the position counts that shelf's roots and the shelf travels with the move.
      expect(resolveMove(pages, "source", { kind: "root", sectionId: "reading" })).toEqual({
        ok: true,
        body: { parentId: null, position: 1, sectionId: "reading" },
      });
    });

    it("inherits the target's shelf when a page lands before, after or inside it", () => {
      const pages = [
        meta("one", null, 0),
        { ...meta("other", null, 0), sectionId: "reading" },
        { ...meta("inner", "other", 0), sectionId: "reading" },
      ];

      expect(resolveMove(pages, "one", { kind: "after", targetId: "other" })).toEqual({
        ok: true,
        body: { parentId: null, position: 1, sectionId: "reading" },
      });
      expect(resolveMove(pages, "one", { kind: "onto", targetId: "inner" })).toEqual({
        ok: true,
        body: { parentId: "inner", position: 0, sectionId: "reading" },
      });
    });

    it("drops a nested page at the end of the root list", () => {
      const pages = [meta("one", null, 0), meta("source", "one", 0), meta("two", null, 1)];
      expect(resolveMove(pages, "source", { kind: "root" })).toEqual({
        ok: true,
        body: { parentId: null, position: 2 },
      });
    });

    it.each([
      ["below zero", -4, 0],
      ["past the end", 99, 2],
    ])("clamps an explicit destination %s", (_label, requested, position) => {
      expect(resolveMove(siblings, "b", { kind: "position", parentId: null, position: requested as number })).toEqual({
        ok: true,
        body: { parentId: null, position },
      });
    });

    it("refuses to move a page onto itself", () => {
      expect(resolveMove(siblings, "b", { kind: "onto", targetId: "b" })).toEqual({
        ok: false,
        reason: "cannot_move_into_descendant",
      });
    });

    it("refuses to move a page onto one of its descendants", () => {
      const pages = [meta("root", null, 0), meta("child", "root", 0), meta("leaf", "child", 0)];
      expect(resolveMove(pages, "root", { kind: "onto", targetId: "leaf" })).toEqual({
        ok: false,
        reason: "cannot_move_into_descendant",
      });
    });
  });
});

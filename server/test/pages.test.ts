import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const clientModule = await import("../src/db/client.js").catch(() => undefined);
const repositoryModule = await import("../src/pages/repository.js").catch(() => undefined);

describe("pages repository API", () => {
  it("exports the database factory and typed repository factory", () => {
    expect(clientModule).toBeDefined();
    expect(repositoryModule).toBeDefined();
    expect(clientModule?.createDb).toBeTypeOf("function");
    expect(repositoryModule?.createPagesRepository).toBeTypeOf("function");
  });
});

if (clientModule && repositoryModule) {
  const { createDb } = clientModule;
  const { createPagesRepository, PageError } = repositoryModule;

  describe("pages repository", () => {
    let db: ReturnType<typeof createDb>;
    let repo: ReturnType<typeof createPagesRepository>;

    beforeEach(() => {
      const path = join(mkdtempSync(join(tmpdir(), "chub-pages-")), "chub.db");
      db = createDb(path);
      repo = createPagesRepository(db);
    });

    afterEach(() => db?.$client.close());

    const dumpPages = () =>
      db.$client
        .prepare(
          "SELECT id, parent_id, title, content, position, created_at, updated_at, deleted_at FROM pages ORDER BY id"
        )
        .all();

    const expectContiguousPositions = () => {
      const rows = dumpPages() as Array<{ parent_id: string | null; position: number }>;
      const positionsByParent = new Map<string | null, number[]>();
      for (const row of rows) {
        const positions = positionsByParent.get(row.parent_id) ?? [];
        positions.push(row.position);
        positionsByParent.set(row.parent_id, positions);
      }
      for (const positions of positionsByParent.values()) {
        expect(positions.sort((left, right) => left - right)).toEqual(positions.map((_, index) => index));
      }
    };

    const expectCode = (operation: () => unknown, code: string) => {
      try {
        operation();
        throw new Error(`Expected PageError with code ${code}`);
      } catch (error) {
        expect(error).toBeInstanceOf(PageError);
        expect((error as InstanceType<typeof PageError>).code).toBe(code);
      }
    };

    it("automatically migrates a fresh file and installs the FTS5 index", () => {
      const names = db.$client
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name")
        .all() as Array<{ name: string }>;
      expect(names.map(({ name }) => name)).toEqual(
        expect.arrayContaining(["pages", "pages_fts", "pages_ai", "pages_au", "pages_ad"])
      );
      expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    });

    it("keeps the FTS5 index synchronized on insert, update, and delete", () => {
      const page = repo.create({ title: "cobalt" });
      const search = (term: string) =>
        db.$client.prepare("SELECT title, content FROM pages_fts WHERE pages_fts MATCH ?").all(term);
      repo.update(page.id, {
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "amber" }] }] },
      });
      expect(search("cobalt")).toHaveLength(1);
      expect(search("amber")).toHaveLength(1);

      repo.update(page.id, {
        title: "silver",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "jade" }] }] },
      });
      expect(search("cobalt")).toHaveLength(0);
      expect(search("amber")).toHaveLength(0);
      expect(search("silver")).toHaveLength(1);
      expect(search("jade")).toHaveLength(1);

      repo.purge(page.id);
      expect(search("silver")).toHaveLength(0);
      expect(search("jade")).toHaveLength(0);
    });

    it("creates root pages and subpages, defaults title/content, and rejects unknown parents", () => {
      const root = repo.create({});
      const child = repo.create({ parentId: root.id, title: "Child" });

      expect(root).toMatchObject({
        id: expect.any(String),
        parentId: null,
        title: "",
        position: 0,
        content: { type: "doc", content: [] },
      });
      expect(root.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(root.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      const storedRoot = dumpPages().find((row) => (row as { id: string }).id === root.id) as {
        created_at: string;
        updated_at: string;
      };
      expect(storedRoot.created_at).toBe(root.updatedAt);
      expect(storedRoot.updated_at).toBe(root.updatedAt);
      expect(child).toMatchObject({ parentId: root.id, title: "Child", position: 0 });
      expect(child.content).toEqual({ type: "doc", content: [] });
      expectContiguousPositions();
      expectCode(() => repo.create({ parentId: "missing" }), "parent_not_found");
    });

    it("returns an ordered, content-free tree and content-free trash metadata", () => {
      const second = repo.create({ title: "Second" });
      const first = repo.create({ title: "First", position: 0 });
      const firstChild = repo.create({ parentId: first.id, title: "Child", position: 0 });
      const secondChild = repo.create({ parentId: second.id, title: "Second child", position: 0 });
      const lastChild = repo.create({ parentId: first.id, title: "Last child" });
      repo.softDelete(lastChild.id);

      const tree = repo.tree();
      const childrenInParentOrder = [
        { id: firstChild.id, parentId: first.id, position: 0 },
        { id: secondChild.id, parentId: second.id, position: 0 },
      ].sort((left, right) => left.parentId.localeCompare(right.parentId));
      expect(tree.map(({ id, parentId, position }) => ({ id, parentId, position }))).toEqual([
        { id: first.id, parentId: null, position: 0 },
        { id: second.id, parentId: null, position: 1 },
        ...childrenInParentOrder,
      ]);
      expect(tree.every((page) => !Object.hasOwn(page, "content"))).toBe(true);
      expect(repo.listTrash()).toEqual([
        expect.objectContaining({ id: lastChild.id, parentId: first.id, deletedAt: expect.any(String) }),
      ]);
      expect(repo.listTrash().every((page) => !Object.hasOwn(page, "content"))).toBe(true);
      expectContiguousPositions();
    });

    it("round-trips title and the exact Tiptap JSON written", () => {
      const page = repo.create({ title: "Before" });
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      const updated = repo.update(page.id, { title: "After", content });

      expect(updated).toMatchObject({ id: page.id, title: "After", content });
      expect(repo.get(page.id)).toMatchObject({ title: "After", content });
      expect((dumpPages()[0] as { content: string }).content).toBe(JSON.stringify(content));
      expectCode(() => repo.get("missing"), "page_not_found");
    });

    it("stores the favourite flag without touching recency and keeps it across edits", () => {
      const page = repo.create({ title: "Kept" });
      expect(page.favorite).toBe(false);
      const before = repo.tree().find(({ id }) => id === page.id)?.updatedAt;

      const favorited = repo.update(page.id, { favorite: true }) as { favorite: boolean; updatedAt: string };
      expect(favorited.favorite).toBe(true);
      expect(favorited.updatedAt).toBe(before);
      expect(repo.tree().find(({ id }) => id === page.id)?.updatedAt).toBe(before);

      const edited = repo.update(page.id, { title: "Renamed" }) as { favorite: boolean; title: string };
      expect(edited).toMatchObject({ favorite: true, title: "Renamed" });

      expect(repo.update(page.id, { favorite: false })).toMatchObject({ favorite: false });
      expect(repo.tree().find(({ id }) => id === page.id)?.favorite).toBe(false);
    });

    it("duplicates a page and its subtree immediately after the original", () => {
      const original = repo.create({ title: "Original", icon: "star" });
      const following = repo.create({ title: "Following" });
      const child = repo.create({ parentId: original.id, title: "Child" });
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
      repo.update(child.id, { content });

      const copy = repo.duplicate(original.id);
      expect(copy).toMatchObject({ title: "Original (copy)", icon: "star", favorite: false, parentId: null });
      expect(copy.id).not.toBe(original.id);

      const roots = repo.tree().filter(({ parentId }) => parentId === null).map(({ title }) => title);
      expect(roots).toEqual(["Original", "Original (copy)", "Following"]);

      const copiedChildren = repo.tree().filter(({ parentId }) => parentId === copy.id);
      expect(copiedChildren).toHaveLength(1);
      expect(copiedChildren[0]?.id).not.toBe(child.id);
      expect(repo.get(copiedChildren[0]!.id)).toMatchObject({ title: "Child", content });
      expect(repo.tree().find(({ id }) => id === following.id)?.position).toBe(2);
      expectCode(() => repo.duplicate("missing"), "page_not_found");
    });

    it("lists the pages that mention a page with the sentence that carries it", () => {
      const target = repo.create({ title: "Target" });
      const source = repo.create({ title: "Source" });
      const unrelated = repo.create({ title: "Unrelated" });
      const mention = (pageId: string) => ({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "See " }, { type: "pageMention", attrs: { pageId } }],
          },
        ],
      });
      repo.update(source.id, { content: mention(target.id) });
      repo.update(unrelated.id, { content: mention("someone-else") });

      repo.softDelete(source.id);
      expect(repo.backlinks(target.id)).toEqual([]);
      repo.restore(source.id);

      expect(repo.backlinks(target.id)).toEqual([
        { id: source.id, title: "Source", icon: null, context: "See" },
      ]);
      expect(repo.backlinks(unrelated.id)).toEqual([]);
      expectCode(() => repo.backlinks("missing"), "page_not_found");
    });

    it("keeps one root order per shelf and carries a subtree when it changes shelf", () => {
      const shelf = repo.createSection("Reading");
      const firstDefault = repo.create({ title: "A" });
      const inShelf = repo.create({ title: "B", sectionId: shelf.id });
      repo.create({ title: "C" });

      expect(repo.get(firstDefault.id)).toMatchObject({ position: 0, sectionId: null });
      expect(repo.get(inShelf.id)).toMatchObject({ position: 0, sectionId: shelf.id });

      const child = repo.create({ parentId: inShelf.id, title: "B1" });
      expect(repo.get(child.id).sectionId).toBe(shelf.id);
      expectCode(() => repo.create({ sectionId: "missing-section" }), "section_not_found");

      // A child of a default-shelf page adopts that shelf.
      const changed = repo.move(inShelf.id, { parentId: firstDefault.id, position: 0 });
      expect(repo.get(inShelf.id)).toMatchObject({ parentId: firstDefault.id, sectionId: null });
      expect(repo.get(child.id)).toMatchObject({ parentId: inShelf.id, sectionId: null });
      expect(changed.map(({ id }) => id)).toEqual(expect.arrayContaining([inShelf.id, child.id]));

      // And moving it back to a shelf's top level takes the subtree with it.
      repo.move(inShelf.id, { parentId: null, position: 0, sectionId: shelf.id });
      expect(repo.get(child.id).sectionId).toBe(shelf.id);
      expect(repo.tree().filter(({ parentId, sectionId }) => parentId === null && sectionId === shelf.id).map(({ title }) => title)).toEqual(["B"]);

      const copy = repo.duplicate(inShelf.id);
      expect(copy.sectionId).toBe(shelf.id);
    });

    it("deletes a shelf and returns its pages to the default one", () => {
      const shelf = repo.createSection("Reading");
      repo.create({ title: "Kept" });
      const moved = repo.create({ title: "Moved", sectionId: shelf.id });
      const child = repo.create({ parentId: moved.id, title: "Child" });

      expect(repo.deleteSection(shelf.id)).toBe(shelf.id);
      expect(repo.sections()).toEqual([]);
      expect(repo.get(moved.id)).toMatchObject({ sectionId: null, parentId: null });
      expect(repo.get(child.id)).toMatchObject({ sectionId: null, parentId: moved.id });
      expect(repo.tree().filter(({ parentId }) => parentId === null).map(({ title }) => title)).toEqual(["Kept", "Moved"]);
      expectCode(() => repo.deleteSection(shelf.id), "section_not_found");
    });

    it("creates, lists and renames shelves in creation order", () => {
      expect(repo.sections()).toEqual([]);
      const first = repo.createSection("Reading");
      const second = repo.createSection("Work");

      expect(repo.sections()).toEqual([first, second]);
      expect(repo.renameSection(first.id, "Books")).toMatchObject({ id: first.id, name: "Books", position: 0 });
      expect(repo.sections().map(({ name }) => name)).toEqual(["Books", "Work"]);
      expectCode(() => repo.renameSection("missing", "x"), "section_not_found");
    });

    it("reorders shelves and keeps their positions contiguous", () => {
      const reading = repo.createSection("Reading");
      const work = repo.createSection("Work");
      const ideas = repo.createSection("Ideas");

      expect(repo.moveSection(ideas.id, 0).map(({ name, position }) => [name, position])).toEqual([
        ["Ideas", 0],
        ["Reading", 1],
        ["Work", 2],
      ]);
      expect(repo.sections().map(({ name }) => name)).toEqual(["Ideas", "Reading", "Work"]);

      // Moving a shelf to where it already is changes nothing.
      expect(repo.moveSection(ideas.id, 0)).toEqual([]);
      expectCode(() => repo.moveSection("missing", 0), "section_not_found");

      // Deleting one keeps the rest contiguous.
      repo.deleteSection(work.id);
      expect(repo.sections().map(({ name, position }) => [name, position])).toEqual([
        ["Ideas", 0],
        ["Reading", 1],
      ]);
    });

    it("reports page_not_found for every operation on an unknown id", () => {
      const missing = "00000000-0000-4000-8000-000000000000";
      expectCode(() => repo.get(missing), "page_not_found");
      expectCode(() => repo.update(missing, { title: "ignored" }), "page_not_found");
      expectCode(() => repo.move(missing, { parentId: null, position: 0 }), "page_not_found");
      expectCode(() => repo.softDelete(missing), "page_not_found");
      expectCode(() => repo.restore(missing), "page_not_found");
      expectCode(() => repo.purge(missing), "page_not_found");
      const page = repo.create({});
      expectCode(() => repo.move(page.id, { parentId: missing, position: 0 }), "parent_not_found");
    });

    it("reorders siblings and returns only rows whose positions changed", () => {
      const a = repo.create({ title: "A" });
      const b = repo.create({ title: "B" });
      const c = repo.create({ title: "C" });

      const changed = repo.move(c.id, { parentId: null, position: 0 });
      expect(changed.map(({ id, position }) => ({ id, position }))).toEqual([
        { id: c.id, position: 0 },
        { id: a.id, position: 1 },
        { id: b.id, position: 2 },
      ]);
      expect(repo.tree().map(({ id, position }) => [id, position])).toEqual([
        [c.id, 0],
        [a.id, 1],
        [b.id, 2],
      ]);
      expectContiguousPositions();
    });

    it("reparents across sibling lists and clamps the requested position at both ends", () => {
      const source = repo.create({ title: "Source" });
      const destination = repo.create({ title: "Destination" });
      const a = repo.create({ parentId: source.id, title: "A" });
      const b = repo.create({ parentId: source.id, title: "B" });
      const c = repo.create({ parentId: source.id, title: "C" });
      const x = repo.create({ parentId: destination.id, title: "X" });
      const y = repo.create({ parentId: destination.id, title: "Y" });

      const toFront = repo.move(c.id, { parentId: source.id, position: -50 });
      expect(toFront.map(({ id, position }) => [id, position])).toEqual([[c.id, 0], [a.id, 1], [b.id, 2]]);
      expectContiguousPositions();
      const toEnd = repo.move(c.id, { parentId: destination.id, position: 999 });
      expect(toEnd.map(({ id, parentId, position }) => [id, parentId, position])).toEqual([
        [a.id, source.id, 0],
        [b.id, source.id, 1],
        [c.id, destination.id, 2],
      ]);
      expect(repo.tree().filter(({ parentId }) => parentId === source.id).map(({ position }) => position)).toEqual([0, 1]);
      expect(repo.tree().filter(({ parentId }) => parentId === destination.id).map(({ position }) => position)).toEqual([0, 1, 2]);
      expect(repo.get(a.id).parentId).toBe(source.id);
      expect(repo.get(b.id).parentId).toBe(source.id);
      expect(repo.get(x.id).parentId).toBe(destination.id);
      expect(repo.get(y.id).parentId).toBe(destination.id);
      expectContiguousPositions();
    });

    it("rejects descendant cycles without changing the complete page dump", () => {
      const root = repo.create({ title: "Root" });
      const child = repo.create({ parentId: root.id, title: "Child" });
      const grandchild = repo.create({ parentId: child.id, title: "Grandchild" });
      const before = JSON.stringify(dumpPages());

      expectCode(() => repo.move(root.id, { parentId: root.id, position: 0 }), "cannot_move_into_descendant");
      expect(JSON.stringify(dumpPages())).toBe(before);
      expectCode(() => repo.move(root.id, { parentId: grandchild.id, position: 0 }), "cannot_move_into_descendant");
      expect(JSON.stringify(dumpPages())).toBe(before);
    });

    it("soft-deletes, restores, and purges exactly a three-level subtree", () => {
      const root = repo.create({ title: "Root" });
      const child = repo.create({ parentId: root.id, title: "Child" });
      const grandchild = repo.create({ parentId: child.id, title: "Grandchild" });
      const sibling = repo.create({ title: "Sibling" });
      const subtreeIds = [root.id, child.id, grandchild.id].sort();

      expect(repo.softDelete(root.id).sort()).toEqual(subtreeIds);
      expectContiguousPositions();
      expect(repo.tree().map(({ id }) => id)).toEqual([sibling.id]);
      expect(repo.listTrash().map(({ id }) => id).sort()).toEqual(subtreeIds);
      expect(repo.listTrash().every(({ deletedAt }) => deletedAt !== null)).toBe(true);
      expect(repo.restore(root.id).sort()).toEqual(subtreeIds);
      expectContiguousPositions();
      expect(repo.get(root.id).deletedAt).toBeNull();
      expect(repo.get(child.id).deletedAt).toBeNull();
      expect(repo.get(grandchild.id).deletedAt).toBeNull();
      expect(repo.tree().map(({ id }) => id)).toContain(root.id);

      repo.softDelete(root.id);
      expect(repo.purge(root.id).sort()).toEqual(subtreeIds);
      expectContiguousPositions();
      for (const id of subtreeIds) expectCode(() => repo.get(id), "page_not_found");
      expect(repo.tree().map(({ id, position }) => [id, position])).toEqual([[sibling.id, 0]]);
    });

    it("restores a child to the root end when its parent is still deleted", () => {
      const parent = repo.create({ title: "Deleted parent" });
      const rootSibling = repo.create({ title: "Visible root sibling" });
      const child = repo.create({ parentId: parent.id, title: "Restored child" });
      const grandchild = repo.create({ parentId: child.id, title: "Grandchild" });

      expect(repo.softDelete(parent.id).sort()).toEqual([parent.id, child.id, grandchild.id].sort());
      expectContiguousPositions();
      expect(repo.restore(child.id).sort()).toEqual([child.id, grandchild.id].sort());
      expectContiguousPositions();
      expect(repo.get(parent.id).deletedAt).not.toBeNull();
      expect(repo.get(child.id)).toMatchObject({ parentId: null, position: 2, deletedAt: null });
      expect(repo.get(grandchild.id)).toMatchObject({ parentId: child.id, position: 0, deletedAt: null });
      expect(repo.tree().filter(({ parentId }) => parentId === null).map(({ id, position }) => [id, position])).toEqual([
        [rootSibling.id, 1],
        [child.id, 2],
      ]);
    });

    it("restores to the original position when the parent is active", () => {
      const parent = repo.create({ title: "Parent" });
      const first = repo.create({ parentId: parent.id, title: "First" });
      const restored = repo.create({ parentId: parent.id, title: "Restored" });
      const last = repo.create({ parentId: parent.id, title: "Last" });

      expect(repo.softDelete(restored.id)).toEqual([restored.id]);
      expectContiguousPositions();
      expect(repo.restore(restored.id)).toEqual([restored.id]);
      expectContiguousPositions();
      expect(repo.get(restored.id)).toMatchObject({ parentId: parent.id, position: 1, deletedAt: null });
      expect(repo.tree().filter(({ parentId }) => parentId === parent.id).map(({ id, position }) => [id, position])).toEqual([
        [first.id, 0],
        [restored.id, 1],
        [last.id, 2],
      ]);
    });

    it("does not restore a child independently deleted before its ancestor", () => {
      const parent = repo.create({ title: "Parent" });
      const child = repo.create({ parentId: parent.id, title: "Independently deleted child" });
      const grandchild = repo.create({ parentId: child.id, title: "Grandchild" });

      expect(repo.softDelete(child.id).sort()).toEqual([child.id, grandchild.id].sort());
      expect(repo.softDelete(parent.id)).toEqual([parent.id]);
      expect(repo.restore(parent.id)).toEqual([parent.id]);
      expectContiguousPositions();
      expect(repo.get(parent.id).deletedAt).toBeNull();
      expect(repo.get(child.id).deletedAt).not.toBeNull();
      expect(repo.get(grandchild.id).deletedAt).not.toBeNull();
      expect(repo.tree().map(({ id }) => id)).toEqual([parent.id]);
    });

    it("returns empty arrays for mutations that change nothing", () => {
      const page = repo.create({ title: "Same" });
      expect(repo.update(page.id, { title: "Same" })).toEqual([]);
      expect(repo.move(page.id, { parentId: null, position: 0 })).toEqual([]);
      expect(repo.softDelete(page.id)).toEqual([page.id]);
      expect(repo.softDelete(page.id)).toEqual([]);
      expect(repo.restore(page.id)).toEqual([page.id]);
      expect(repo.restore(page.id)).toEqual([]);
    });

    it("rolls back a multi-row move when a later row update fails", () => {
      const a = repo.create({ title: "A" });
      const b = repo.create({ title: "B" });
      const c = repo.create({ title: "C" });
      db.$client.exec(
        `CREATE TRIGGER fail_late_reindex BEFORE UPDATE OF position ON pages
         WHEN OLD.position = 0 BEGIN SELECT RAISE(ABORT, 'forced reindex failure'); END;`
      );
      const before = JSON.stringify(dumpPages());

      expect(() => repo.move(c.id, { parentId: null, position: 0 })).toThrow(/forced reindex failure/);
      expect(JSON.stringify(dumpPages())).toBe(before);
      expect(repo.tree().map(({ id, position }) => [id, position])).toEqual([
        [a.id, 0],
        [b.id, 1],
        [c.id, 2],
      ]);
    });
  });
}

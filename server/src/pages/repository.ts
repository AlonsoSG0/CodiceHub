import { randomUUID } from "node:crypto";
import { asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import { pageSections, pages, type PageRow } from "../db/schema.js";

export type PageMeta = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
  updatedAt: string;
  deletedAt: string | null;
  favorite: boolean;
  /** The sidebar shelf that owns this page. `null` is the default `Pages` shelf. */
  sectionId: string | null;
};

/** A sidebar shelf the user created. The default shelf is `sectionId === null` and has no row here. */
export type PageSection = {
  id: string;
  name: string;
  position: number;
};

export type Page = PageMeta & { content: unknown };

/** A page that mentions this one, plus the sentence that carries the mention. */
export type PageBacklink = {
  id: string;
  title: string;
  icon: string | null;
  context: string;
};

export type PageErrorCode = "page_not_found" | "parent_not_found" | "cannot_move_into_descendant" | "section_not_found";

export class PageError extends Error {
  constructor(readonly code: PageErrorCode) {
    super(code);
    this.name = "PageError";
  }
}

export type CreatePageInput = {
  parentId?: string | null;
  sectionId?: string | null;
  title?: string;
  icon?: string | null;
  position?: number;
};

export type UpdatePageInput = {
  title?: string;
  icon?: string | null;
  content?: unknown;
  favorite?: boolean;
};

export type MovePageInput = {
  parentId: string | null;
  position: number;
  /** Only meaningful for a top-level move; a child always follows its parent's shelf. */
  sectionId?: string | null;
};

export interface PagesRepository {
  tree(): PageMeta[];
  listTrash(): PageMeta[];
  get(id: string): Page;
  create(input: CreatePageInput): Page;
  update(id: string, input: UpdatePageInput): Page | [];
  move(id: string, input: MovePageInput): PageMeta[];
  duplicate(id: string): Page;
  backlinks(id: string): PageBacklink[];
  softDelete(id: string): string[];
  restore(id: string): string[];
  purge(id: string): string[];
  sections(): PageSection[];
  createSection(name: string): PageSection;
  renameSection(id: string, name: string): PageSection;
  moveSection(id: string, position: number): PageSection[];
  deleteSection(id: string): string;
}

export function toPageMeta(row: PageRow): PageMeta {
  return {
    id: row.id,
    parentId: row.parentId,
    title: row.title,
    icon: row.icon,
    position: row.position,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    favorite: row.favorite === 1,
    sectionId: row.sectionId,
  };
}

function toPage(row: PageRow): Page {
  let content: unknown;
  try {
    content = JSON.parse(row.content) as unknown;
  } catch (cause) {
    throw new Error("stored page content is invalid JSON", { cause });
  }
  return { ...toPageMeta(row), content };
}

function now(): string {
  return new Date().toISOString();
}

function copyTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed === "" ? "" : `${trimmed} (copy)`;
}

function paragraphText(value: unknown): string {
  if (Array.isArray(value)) return value.map(paragraphText).join("");
  if (typeof value !== "object" || value === null) return "";
  const node = value as Record<string, unknown>;
  const own = typeof node.text === "string" ? node.text : "";
  return own + paragraphText(node.content);
}

function mentionsPage(value: unknown, pageId: string): boolean {
  if (Array.isArray(value)) return value.some((child) => mentionsPage(child, pageId));
  if (typeof value !== "object" || value === null) return false;
  const node = value as Record<string, unknown>;
  if (node.type === "pageMention") {
    const attrs = node.attrs;
    if (typeof attrs === "object" && attrs !== null) {
      return (attrs as Record<string, unknown>).pageId === pageId;
    }
  }
  return mentionsPage(node.content, pageId);
}

/** The text of the first block that mentions the page: enough to recognise it, short enough for one line. */
function mentionContext(serialized: string, pageId: string): string {
  let document: unknown;
  try {
    document = JSON.parse(serialized);
  } catch {
    return "";
  }

  const blocks = (document as { content?: unknown }).content;
  if (!Array.isArray(blocks)) return "";

  for (const block of blocks) {
    if (!mentionsPage(block, pageId)) continue;
    return paragraphText(block).replace(/\s+/gu, " ").trim().slice(0, 160);
  }
  return "";
}

function clampPosition(position: number, siblingCount: number): number {
  const requested = Number.isFinite(position) ? Math.trunc(position) : position > 0 ? siblingCount : 0;
  return Math.max(0, Math.min(requested, siblingCount));
}

export function createPagesRepository(db: ChubDatabase): PagesRepository {
  const allRows = (): PageRow[] => db.select().from(pages).orderBy(asc(pages.position), asc(pages.id)).all();

  const findRow = (id: string): PageRow | undefined =>
    db.select().from(pages).where(eq(pages.id, id)).get();

  const requirePage = (id: string): PageRow => {
    const row = findRow(id);
    if (!row) throw new PageError("page_not_found");
    return row;
  };

  const siblingRows = (parentId: string | null, sectionId: string | null): PageRow[] =>
    allRows()
      .filter((row) =>
        parentId === null ? row.parentId === null && row.sectionId === sectionId : row.parentId === parentId,
      )
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));

  const findSection = (id: string): PageSection | undefined => {
    const row = db.select().from(pageSections).where(eq(pageSections.id, id)).get();
    return row === undefined ? undefined : { id: row.id, name: row.name, position: row.position };
  };

  const allSections = (): PageSection[] =>
    db
      .select()
      .from(pageSections)
      .orderBy(asc(pageSections.position), asc(pageSections.id))
      .all()
      .map((row) => ({ id: row.id, name: row.name, position: row.position }));

  const requireSection = (id: string): PageSection => {
    const section = findSection(id);
    if (!section) throw new PageError("section_not_found");
    return section;
  };

  const subtreeRows = (rootId: string): PageRow[] => {
    const byParent = new Map<string, PageRow[]>();
    for (const row of allRows()) {
      if (row.parentId === null) continue;
      const siblings = byParent.get(row.parentId) ?? [];
      siblings.push(row);
      byParent.set(row.parentId, siblings);
    }

    const result: PageRow[] = [];
    const seen = new Set<string>();
    const pending = [rootId];
    while (pending.length > 0) {
      const id = pending.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const row = findRow(id);
      if (!row) continue;
      result.push(row);
      for (const child of byParent.get(id) ?? []) pending.push(child.id);
    }
    return result;
  };

  const setPosition = (
    id: string,
    parentId: string | null,
    sectionId: string | null,
    position: number,
    updatedAt: string,
  ): boolean => {
    const row = requirePage(id);
    if (row.parentId === parentId && row.sectionId === sectionId && row.position === position) return false;
    db.$client
      .prepare("UPDATE pages SET parent_id = ?, section_id = ?, position = ?, updated_at = ? WHERE id = ?")
      .run(parentId, sectionId, position, updatedAt, id);
    return true;
  };

  const reindex = (
    rows: PageRow[],
    parentId: string | null,
    sectionId: string | null,
    updatedAt: string,
    changedIds: Set<string>,
  ): void => {
    rows.forEach((row, position) => {
      if (setPosition(row.id, parentId, sectionId, position, updatedAt)) changedIds.add(row.id);
    });
  };

  const nextDeletionTimestamp = (): string => {
    const existing = new Set(allRows().flatMap((row) => (row.deletedAt === null ? [] : [row.deletedAt])));
    let milliseconds = Date.now();
    let timestamp = new Date(milliseconds).toISOString();
    while (existing.has(timestamp)) {
      milliseconds += 1;
      timestamp = new Date(milliseconds).toISOString();
    }
    return timestamp;
  };

  return {
    tree(): PageMeta[] {
      return db
        .select()
        .from(pages)
        .where(isNull(pages.deletedAt))
        .orderBy(asc(pages.parentId), asc(pages.position), asc(pages.id))
        .all()
        .map(toPageMeta);
    },

    listTrash(): PageMeta[] {
      return db
        .select()
        .from(pages)
        .where(isNotNull(pages.deletedAt))
        .orderBy(asc(pages.parentId), asc(pages.position), asc(pages.id))
        .all()
        .map(toPageMeta);
    },

    get(id: string): Page {
      return toPage(requirePage(id));
    },

    create(input: CreatePageInput): Page {
      const parentId = input.parentId ?? null;
      const title = input.title ?? "";
      const insert = db.$client.transaction(() => {
        const parent = parentId === null ? undefined : findRow(parentId);
        if (parentId !== null && !parent) throw new PageError("parent_not_found");

        // A page under a parent lives on its parent's shelf; a root lives on the one it was created in.
        const sectionId = parent ? parent.sectionId : input.sectionId ?? null;
        if (sectionId !== null) requireSection(sectionId);

        const siblings = siblingRows(parentId, sectionId);
        const position = input.position === undefined ? siblings.length : clampPosition(input.position, siblings.length);
        const id = randomUUID();
        const timestamp = now();
        db.$client
          .prepare(
            "INSERT INTO pages (id, parent_id, section_id, title, icon, content, position, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
          )
          .run(id, parentId, sectionId, title, input.icon ?? null, '{"type":"doc","content":[]}', position, timestamp, timestamp);

        const order = [...siblings];
        order.splice(position, 0, requirePage(id));
        reindex(order, parentId, sectionId, timestamp, new Set());
        return toPage(requirePage(id));
      });
      return insert.immediate();
    },

    update(id: string, input: UpdatePageInput): Page | [] {
      const update = db.$client.transaction(() => {
        const row = requirePage(id);
        const title = input.title ?? row.title;
        const icon = input.icon === undefined ? row.icon : input.icon;
        const favorite = input.favorite === undefined ? row.favorite : input.favorite ? 1 : 0;
        let content = row.content;
        if (input.content !== undefined) {
          const serialized = JSON.stringify(input.content);
          if (serialized === undefined) throw new TypeError("content must be JSON-serializable");
          content = serialized;
        }

        const edited = title !== row.title || icon !== row.icon || content !== row.content;
        // A favourite is a shelf, not an edit: it must not move the page in recency order.
        if (!edited && favorite === row.favorite) return [] as [];

        if (edited) {
          db.$client
            .prepare("UPDATE pages SET title = ?, icon = ?, content = ?, updated_at = ? WHERE id = ?")
            .run(title, icon, content, now(), id);
        }
        if (favorite !== row.favorite) {
          db.$client.prepare("UPDATE pages SET favorite = ? WHERE id = ?").run(favorite, id);
        }
        return toPage(requirePage(id));
      });
      return update.immediate();
    },

    move(id: string, input: MovePageInput): PageMeta[] {
      const move = db.$client.transaction(() => {
        const page = requirePage(id);
        const destinationParentId = input.parentId;
        const destinationParent = destinationParentId === null ? undefined : findRow(destinationParentId);
        if (destinationParentId !== null && !destinationParent) throw new PageError("parent_not_found");
        if (destinationParentId !== null && subtreeRows(id).some((row) => row.id === destinationParentId)) {
          throw new PageError("cannot_move_into_descendant");
        }

        // A child follows its parent's shelf; only a top-level move can change the shelf.
        const destinationSectionId = destinationParent
          ? destinationParent.sectionId
          : input.sectionId === undefined
            ? page.sectionId
            : input.sectionId;
        if (destinationSectionId !== null) requireSection(destinationSectionId);

        const timestamp = now();
        const changedIds = new Set<string>();
        const sameSiblings = destinationParentId === page.parentId && destinationSectionId === page.sectionId;

        if (sameSiblings) {
          const siblings = siblingRows(page.parentId, page.sectionId).filter((row) => row.id !== id);
          const position = clampPosition(input.position, siblings.length);
          const ordered = [...siblings];
          ordered.splice(position, 0, page);
          reindex(ordered, page.parentId, page.sectionId, timestamp, changedIds);
        } else {
          const subtreeIds = subtreeRows(id).map((row) => row.id);
          const sourceSiblings = siblingRows(page.parentId, page.sectionId).filter((row) => row.id !== id);
          reindex(sourceSiblings, page.parentId, page.sectionId, timestamp, changedIds);

          if (destinationSectionId !== page.sectionId) {
            const placeholders = subtreeIds.map(() => "?").join(", ");
            db.$client
              .prepare(`UPDATE pages SET section_id = ? WHERE id IN (${placeholders})`)
              .run(destinationSectionId, ...subtreeIds);
            // The descendants moved shelf too, so the client has to receive them to redraw both trees.
            for (const subtreeId of subtreeIds) changedIds.add(subtreeId);
          }

          const destinationSiblings = siblingRows(destinationParentId, destinationSectionId);
          const position = clampPosition(input.position, destinationSiblings.length);
          const ordered = [...destinationSiblings];
          ordered.splice(position, 0, page);
          if (setPosition(id, destinationParentId, destinationSectionId, position, timestamp)) changedIds.add(id);
          ordered.forEach((row, siblingPosition) => {
            if (row.id !== id && setPosition(row.id, destinationParentId, destinationSectionId, siblingPosition, timestamp)) {
              changedIds.add(row.id);
            }
          });
        }

        return [...changedIds].map((changedId) => toPageMeta(requirePage(changedId)));
      });
      return move.immediate();
    },

    duplicate(id: string): Page {
      const duplicate = db.$client.transaction(() => {
        const source = requirePage(id);
        const timestamp = now();
        const subtree = subtreeRows(id);
        const idMap = new Map(subtree.map((row) => [row.id, randomUUID()]));
        const newRootId = idMap.get(id)!;

        const insert = db.$client.prepare(
          "INSERT INTO pages (id, parent_id, section_id, title, icon, content, position, created_at, updated_at, deleted_at, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)",
        );
        for (const row of subtree) {
          const copyId = idMap.get(row.id)!;
          const parentId = row.id === id ? source.parentId : idMap.get(row.parentId ?? "") ?? null;
          const title = row.id === id ? copyTitle(row.title) : row.title;
          insert.run(copyId, parentId, row.sectionId, title, row.icon, row.content, row.position, timestamp, timestamp);
        }

        // The copy sits immediately after the page it duplicates, so the pair reads together in the sidebar.
        const siblings = siblingRows(source.parentId, source.sectionId).filter((row) => row.id !== newRootId);
        const sourceIndex = siblings.findIndex((row) => row.id === id);
        const ordered = [...siblings];
        ordered.splice(sourceIndex + 1, 0, requirePage(newRootId));
        reindex(ordered, source.parentId, source.sectionId, timestamp, new Set());

        return toPage(requirePage(newRootId));
      });
      return duplicate.immediate();
    },

    backlinks(id: string): PageBacklink[] {
      requirePage(id);
      // The LIKE only narrows the candidates; the document walk below is what decides, so a body that merely
      // contains the text of an id can never produce a backlink.
      const rows = db.$client
        .prepare(
          `SELECT id, title, icon, content FROM pages
           WHERE deleted_at IS NULL AND id <> ? AND content LIKE ?
           ORDER BY title COLLATE NOCASE, id`,
        )
        .all(id, `%"pageId":"${id}"%`) as Array<{ id: string; title: string; icon: string | null; content: string }>;

      return rows.flatMap((row) => {
        let document: unknown;
        try {
          document = JSON.parse(row.content);
        } catch {
          return [];
        }
        if (!mentionsPage(document, id)) return [];
        return [{ id: row.id, title: row.title, icon: row.icon, context: mentionContext(row.content, id) }];
      });
    },

    softDelete(id: string): string[] {
      const softDelete = db.$client.transaction(() => {
        const page = requirePage(id);
        const timestamp = page.deletedAt ?? nextDeletionTimestamp();
        const changed = subtreeRows(id).filter((row) => row.deletedAt === null);
        const statement = db.$client.prepare("UPDATE pages SET deleted_at = ?, updated_at = ? WHERE id = ?");
        for (const row of changed) statement.run(timestamp, timestamp, row.id);
        return changed.map((row) => row.id);
      });
      return softDelete.immediate();
    },

    restore(id: string): string[] {
      const restore = db.$client.transaction(() => {
        const page = requirePage(id);
        if (page.deletedAt === null) return [];

        const timestamp = now();
        const restored = subtreeRows(id).filter((row) => row.deletedAt === page.deletedAt);
        if (restored.length === 0) return [];

        const parent = page.parentId === null ? undefined : findRow(page.parentId);
        const parentIsDeleted = parent !== undefined && parent.deletedAt !== null;
        if (parentIsDeleted) {
          const sourceSiblings = siblingRows(page.parentId, page.sectionId).filter((row) => row.id !== id);
          reindex(sourceSiblings, page.parentId, page.sectionId, timestamp, new Set());
          const rootSiblings = siblingRows(null, page.sectionId);
          const rootPosition = rootSiblings.length;
          db.$client
            .prepare("UPDATE pages SET parent_id = NULL, position = ?, deleted_at = NULL, updated_at = ? WHERE id = ?")
            .run(rootPosition, timestamp, id);
        }

        const update = db.$client.prepare("UPDATE pages SET deleted_at = NULL, updated_at = ? WHERE id = ?");
        for (const row of restored) {
          if (row.id === id && parentIsDeleted) continue;
          update.run(timestamp, row.id);
        }
        return restored.map((row) => row.id);
      });
      return restore.immediate();
    },

    purge(id: string): string[] {
      const purge = db.$client.transaction(() => {
        requirePage(id);
        const subtree = subtreeRows(id);
        const subtreeIds = new Set(subtree.map((row) => row.id));
        const affectedParents = new Map<string, string | null>();
        for (const row of subtree) {
          if (row.parentId !== null && !subtreeIds.has(row.parentId)) affectedParents.set(row.parentId, row.sectionId);
          if (row.parentId === null) affectedParents.set("root", row.sectionId);
        }

        const remove = db.$client.prepare("DELETE FROM pages WHERE id = ?");
        for (const row of [...subtree].reverse()) remove.run(row.id);

        const timestamp = now();
        const changedIds = new Set<string>();
        for (const [parentKey, sectionId] of affectedParents) {
          const parentId = parentKey === "root" ? null : parentKey;
          reindex(siblingRows(parentId, sectionId), parentId, sectionId, timestamp, changedIds);
        }
        return subtree.map((row) => row.id);
      });
      return purge.immediate();
    },

    sections(): PageSection[] {
      return allSections();
    },

    createSection(name: string): PageSection {
      const position = allSections().reduce((next, section) => Math.max(next, section.position + 1), 0);
      const id = randomUUID();
      const timestamp = now();
      db.$client
        .prepare("INSERT INTO page_sections (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, name, position, timestamp, timestamp);
      return requireSection(id);
    },

    renameSection(id: string, name: string): PageSection {
      requireSection(id);
      db.$client.prepare("UPDATE page_sections SET name = ?, updated_at = ? WHERE id = ?").run(name, now(), id);
      return requireSection(id);
    },

    moveSection(id: string, position: number): PageSection[] {
      const move = db.$client.transaction(() => {
        const section = requireSection(id);
        const siblings = allSections().filter((candidate) => candidate.id !== id);
        const target = clampPosition(position, siblings.length);
        const ordered = [...siblings];
        ordered.splice(target, 0, section);

        const timestamp = now();
        const changed: PageSection[] = [];
        ordered.forEach((candidate, index) => {
          if (candidate.position === index) return;
          db.$client
            .prepare("UPDATE page_sections SET position = ?, updated_at = ? WHERE id = ?")
            .run(index, timestamp, candidate.id);
          changed.push({ ...candidate, position: index });
        });
        return changed.sort((left, right) => left.position - right.position);
      });
      return move.immediate();
    },

    deleteSection(id: string): string {
      const remove = db.$client.transaction(() => {
        requireSection(id);
        const timestamp = now();
        const roots = siblingRows(null, id);
        const defaultRoots = siblingRows(null, null);
        db.$client
          .prepare("UPDATE pages SET section_id = NULL WHERE id IN (SELECT id FROM pages WHERE section_id = ?)")
          .run(id);
        db.$client.prepare("DELETE FROM page_sections WHERE id = ?").run(id);
        // Deleting a shelf should not leave a hole in the shelf order either.
        for (const [position, section] of allSections().entries()) {
          if (section.position === position) continue;
          db.$client.prepare("UPDATE page_sections SET position = ? WHERE id = ?").run(position, section.id);
        }

        // The pages survive the shelf: they become the last roots of the default `Pages` shelf.
        const ordered = [...defaultRoots, ...roots];
        reindex(ordered, null, null, timestamp, new Set());
        return id;
      });
      return remove.immediate();
    },
  };
}

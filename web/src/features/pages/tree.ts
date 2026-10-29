import type { PageMeta } from "@/lib/api";

export type PageTreeNode = PageMeta & { children: PageTreeNode[] };

/** `sectionId` is present only when the move changes the page's shelf; absent keeps the current one. */
export type PageMoveBody = { parentId: string | null; position: number; sectionId?: string | null };

export type PageDropIntent =
  | { kind: "before" | "after"; targetId: string }
  | { kind: "onto" | "first-child"; targetId: string }
  | { kind: "root"; sectionId?: string | null }
  | { kind: "position"; parentId: string | null; position: number };

export type PageMoveResolution =
  | { ok: true; body: PageMoveBody }
  | { ok: false; reason: "page_not_found" | "parent_not_found" | "invalid_position" | "invalid_target" | "cannot_move_into_descendant" };

/** Roots are siblings within one shelf; children are siblings within one parent. */
function siblingsOf(pages: PageMeta[], parentId: string | null, sectionId: string | null, pageId: string): PageMeta[] {
  return pages.filter((candidate) => {
    if (candidate.id === pageId) return false;
    if (parentId !== null) return candidate.parentId === parentId;
    return candidate.parentId === null && (candidate.sectionId ?? null) === (sectionId ?? null);
  });
}

export function resolvePageMove(pages: PageMeta[], pageId: string, intent: PageDropIntent): PageMoveResolution {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const page = pageById.get(pageId);
  if (!page) return { ok: false, reason: "page_not_found" };

  let parentId: string | null;
  let sectionId: string | null = page.sectionId;
  let position: number;
  let requestedPosition: number | undefined;

  switch (intent.kind) {
    case "before":
    case "after": {
      const target = pageById.get(intent.targetId);
      if (!target) return { ok: false, reason: "page_not_found" };
      parentId = target.parentId;
      sectionId = target.sectionId;
      const siblings = siblingsOf(pages, parentId, sectionId, pageId).sort((a, b) => a.position - b.position);
      const targetIndex = siblings.findIndex((candidate) => candidate.id === target.id);
      if (targetIndex < 0) return { ok: false, reason: "invalid_target" };
      requestedPosition = targetIndex + (intent.kind === "after" ? 1 : 0);
      break;
    }
    case "onto": {
      if (intent.targetId === pageId) return { ok: false, reason: "cannot_move_into_descendant" };
      const target = pageById.get(intent.targetId);
      if (!target) return { ok: false, reason: "page_not_found" };
      parentId = target.id;
      sectionId = target.sectionId;
      requestedPosition = pages.filter((candidate) => candidate.parentId === parentId && candidate.id !== pageId).length;
      break;
    }
    case "first-child": {
      const target = pageById.get(intent.targetId);
      if (!target) return { ok: false, reason: "page_not_found" };
      parentId = target.id;
      sectionId = target.sectionId;
      requestedPosition = 0;
      break;
    }
    case "root":
      parentId = null;
      sectionId = intent.sectionId === undefined ? page.sectionId : intent.sectionId;
      requestedPosition = siblingsOf(pages, null, sectionId, pageId).length;
      break;
    case "position":
      parentId = intent.parentId;
      if (parentId !== null) {
        const parent = pageById.get(parentId);
        if (!parent) return { ok: false, reason: "parent_not_found" };
        sectionId = parent.sectionId;
      }
      requestedPosition = intent.position;
      break;
    default:
      return { ok: false, reason: "invalid_target" };
  }

  if (parentId !== null && !pageById.has(parentId)) return { ok: false, reason: "parent_not_found" };
  if (parentId !== null && isSelfOrDescendant(pages, pageId, parentId)) {
    return { ok: false, reason: "cannot_move_into_descendant" };
  }
  if (requestedPosition === undefined || !Number.isFinite(requestedPosition)) {
    return { ok: false, reason: "invalid_position" };
  }

  const remaining = siblingsOf(pages, parentId, sectionId, pageId);
  position = Math.max(0, Math.min(Math.trunc(requestedPosition), remaining.length));

  const body: PageMoveBody = { parentId, position };
  // Omit an unchanged shelf so an ordinary move keeps the exact payload it always had.
  if ((sectionId ?? null) !== (page.sectionId ?? null)) body.sectionId = sectionId;
  return { ok: true, body };
}

function isSelfOrDescendant(pages: PageMeta[], pageId: string, parentId: string): boolean {
  const parentById = new Map(pages.map((page) => [page.id, page.parentId]));
  const visited = new Set<string>();
  let currentId: string | null = parentId;

  while (currentId !== null) {
    if (currentId === pageId || visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return false;
}

export function buildPageTree(pages: PageMeta[]): PageTreeNode[] {
  const nodes = pages.map((page) => ({ ...page, children: [] as PageTreeNode[] }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  const roots: PageTreeNode[] = [];

  for (const node of nodes) {
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    if (!parent || parent.id === node.id || wouldCreateCycle(node.id, parent.id, parentById)) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  const sortSiblings = (siblings: PageTreeNode[]) => {
    siblings.sort((a, b) => a.position - b.position);
    for (const sibling of siblings) sortSiblings(sibling.children);
  };
  sortSiblings(roots);
  return roots;
}

function wouldCreateCycle(nodeId: string, parentId: string, parentById: Map<string, string | null>): boolean {
  const visited = new Set<string>();
  let currentId: string | null = parentId;

  while (currentId !== null) {
    if (currentId === nodeId || visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return false;
}

export function getAncestorChain(pages: PageMeta[], pageId: string): PageMeta[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const chain: PageMeta[] = [];
  const visited = new Set<string>();
  let current = byId.get(pageId);

  while (current && !visited.has(current.id)) {
    chain.push(current);
    visited.add(current.id);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return chain.reverse();
}

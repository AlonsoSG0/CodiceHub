import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DragEvent as ReactDragEvent, KeyboardEvent } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ChevronDown, ChevronRight, FolderInput, Link2, Pencil, Star, Trash2 } from "lucide-react";
import { MenuPopup, menuItemClassName } from "@/components/ui/menu";
import { PageIcon } from "./page-icon.js";
import type { PageMeta, PageSection } from "@/lib/api";
import { movePage } from "./move.js";
import { buildPageTree, getAncestorChain, resolvePageMove } from "./tree.js";
import type { PageDropIntent, PageTreeNode } from "./tree.js";
import { pageRowActionClass, pageRowClass, pageRowStyle } from "./page-row.js";
import { MovePageDialog } from "./move-page-dialog.js";
import type { MoveDestination } from "./move-page-dialog.js";
import { copyPageLink } from "./page-link.js";
import { useT } from "@/i18n";

type PageTreeProps = {
  /** Every page. The component shows only the ones that live on this shelf. */
  pages: PageMeta[];
  sectionId: string | null;
  /** The shelf name, used as the tree's accessible name. */
  label?: string;
  sections?: PageSection[];
  activeId: string | null;
  /** The page being dragged, owned by the shell so any shelf can accept it. */
  draggedId: string | null;
  onCreateSubpage: (parentId: string) => void;
  onRenamePage?: (pageId: string) => void;
  onTrashPage?: (pageId: string) => void;
  onToggleFavorite?: (pageId: string, favorite: boolean) => void;
  onDragPage?: (pageId: string | null) => void;
  onMoved?: (pages: PageMeta[]) => void;
  creating?: boolean;
};

type VisibleItem = { node: PageTreeNode; depth: number };
type DropPreview = { targetId: string; kind: PageDropIntent["kind"] };

const EXPANDED_STORAGE_KEY = "chub-notes-expanded";

export function readExpandedIds(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    // Storage can be denied or, in tests, only partially present; expansion is a convenience, never a contract.
    return new Set();
  }
}

export function writeExpandedIds(ids: Set<string>): void {
  try {
    window.localStorage?.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Same as above: a sidebar that cannot remember is still a working sidebar.
  }
}

export function PageTree({
  pages,
  sectionId,
  label: providedLabel,
  sections = [],
  activeId,
  draggedId,
  onCreateSubpage,
  onRenamePage,
  onTrashPage,
  onToggleFavorite,
  onDragPage,
  onMoved,
  creating = false,
}: PageTreeProps) {
  const { t } = useT();
  const label = providedLabel ?? t("notes.pages");
  const navigate = useNavigate();
  const [pageOverrides, setPageOverrides] = useState<Map<string, PageMeta>>(() => new Map());
  const displayPages = useMemo(() => pages.map((page) => pageOverrides.get(page.id) ?? page), [pageOverrides, pages]);
  const shelfPages = useMemo(
    () => displayPages.filter((page) => (page.sectionId ?? null) === (sectionId ?? null)),
    [displayPages, sectionId],
  );
  const tree = useMemo(() => buildPageTree(shelfPages), [shelfPages]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => readExpandedIds());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const moveInFlight = useRef(false);
  const pagesById = useMemo(() => new Map(displayPages.map((page) => [page.id, page])), [displayPages]);
  const moveTarget = moveTargetId === null ? null : pagesById.get(moveTargetId) ?? null;

  useEffect(() => {
    writeExpandedIds(expandedIds);
  }, [expandedIds]);

  // Once the shell merges a move into its own list, the local copy has nothing left to say.
  useEffect(() => {
    setPageOverrides((current) => (current.size === 0 ? current : new Map()));
  }, [pages]);

  useEffect(() => {
    if (!activeId) return;
    const ancestors = getAncestorChain(shelfPages, activeId).slice(0, -1).map(({ id }) => id);
    if (ancestors.length === 0) return;
    setExpandedIds((current) => new Set([...current, ...ancestors]));
  }, [activeId, shelfPages]);

  const visibleItems = useMemo(() => {
    const items: VisibleItem[] = [];
    const append = (nodes: PageTreeNode[], depth: number) => {
      for (const node of nodes) {
        items.push({ node, depth });
        if (node.children.length > 0 && expandedIds.has(node.id)) append(node.children, depth + 1);
      }
    };
    append(tree, 1);
    return items;
  }, [expandedIds, tree]);

  const visibleIds = visibleItems.map(({ node }) => node.id);
  const tabStopId =
    focusedId && visibleIds.includes(focusedId)
      ? focusedId
      : activeId && visibleIds.includes(activeId)
        ? activeId
        : visibleIds[0];

  const setExpanded = (id: string, expanded: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const focusRow = (id: string) => {
    setFocusedId(id);
    rowRefs.current.get(id)?.focus();
  };

  const clearDragState = () => {
    setDropPreview(null);
    onDragPage?.(null);
  };

  const performMove = async (pageId: string, intent: PageDropIntent) => {
    if (moveInFlight.current) return;
    const resolution = resolvePageMove(displayPages, pageId, intent);
    if (!resolution.ok) return;

    const page = pagesById.get(pageId);
    if (!page) return;
    const { parentId, position, sectionId: nextSectionId } = resolution.body;
    const changesShelf = nextSectionId !== undefined;
    if (!changesShelf && page.parentId === parentId && page.position === position) return;

    moveInFlight.current = true;
    setMoveError(null);
    try {
      const changedPages = await movePage(pageId, resolution.body);
      setPageOverrides((current) => {
        const next = new Map(current);
        for (const changedPage of changedPages) next.set(changedPage.id, changedPage);
        return next;
      });
      onMoved?.(changedPages);
      if (parentId !== null) setExpanded(parentId, true);
      setFocusedId(pageId);
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : t("notes.moveFailed"));
    } finally {
      moveInFlight.current = false;
      clearDragState();
    }
  };

  const resolveDropPreview = (pageId: string, intent: PageDropIntent): DropPreview | null => {
    const resolution = resolvePageMove(displayPages, pageId, intent);
    if (!resolution.ok) return null;
    const page = pagesById.get(pageId);
    if (!page) return null;
    const { parentId, position, sectionId: nextSectionId } = resolution.body;
    if (nextSectionId === undefined && page.parentId === parentId && page.position === position) return null;
    const targetId = "targetId" in intent ? intent.targetId : "root";
    return { targetId, kind: intent.kind };
  };

  const rowDropIntent = (event: ReactDragEvent<HTMLDivElement>, targetId: string): PageDropIntent => {
    const rowSurface = event.currentTarget.firstElementChild;
    const bounds = rowSurface instanceof HTMLElement
      ? rowSurface.getBoundingClientRect()
      : event.currentTarget.getBoundingClientRect();
    const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const ratio = bounds.height > 0
      ? (clientY - bounds.top) / bounds.height
      : clientY <= 8
        ? 0.1
        : clientY >= 22
          ? 0.9
          : 0.5;
    return ratio < 0.25
      ? { kind: "before", targetId }
      : ratio > 0.75
        ? { kind: "after", targetId }
        : { kind: "onto", targetId };
  };

  const handleRowDragStart = (event: ReactDragEvent<HTMLDivElement>, pageId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setMoveError(null);
    onDragPage?.(pageId);
  };

  const handleRowDragOver = (event: ReactDragEvent<HTMLDivElement>, node: PageTreeNode) => {
    event.stopPropagation();
    if (!draggedId) return;

    const intent = rowDropIntent(event, node.id);
    const preview = resolveDropPreview(draggedId, intent);

    if (!preview) {
      setDropPreview(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropPreview(preview);
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>, intent: PageDropIntent) => {
    event.stopPropagation();
    if (!draggedId || !resolveDropPreview(draggedId, intent)) return;
    event.preventDefault();
    void performMove(draggedId, intent);
  };

  const handleFirstChildDragOver = (event: ReactDragEvent<HTMLDivElement>, parentId: string) => {
    event.stopPropagation();
    if (!draggedId) return;
    const intent: PageDropIntent = { kind: "first-child", targetId: parentId };
    const preview = resolveDropPreview(draggedId, intent);
    if (!preview) {
      setDropPreview(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropPreview(preview);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, node: PageTreeNode) => {
    if (event.target !== event.currentTarget) return;
    const currentIndex = visibleIds.indexOf(node.id);
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    if (event.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const siblings = shelfPages
        .filter((page) => page.parentId === node.parentId)
        .sort((a, b) => a.position - b.position);
      const siblingIndex = siblings.findIndex((page) => page.id === node.id);
      let intent: PageDropIntent | undefined;

      if (event.key === "ArrowUp" && siblingIndex > 0) {
        intent = { kind: "before", targetId: siblings[siblingIndex - 1].id };
      } else if (event.key === "ArrowDown" && siblingIndex >= 0 && siblingIndex < siblings.length - 1) {
        intent = { kind: "after", targetId: siblings[siblingIndex + 1].id };
      } else if (event.key === "ArrowRight" && siblingIndex > 0) {
        intent = { kind: "onto", targetId: siblings[siblingIndex - 1].id };
      } else if (event.key === "ArrowLeft" && node.parentId) {
        const parent = pagesById.get(node.parentId);
        if (parent) intent = { kind: "after", targetId: parent.id };
      }

      if (intent) void performMove(node.id, intent);
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const nextId = visibleIds[Math.min(currentIndex + 1, visibleIds.length - 1)];
        if (nextId) focusRow(nextId);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previousId = visibleIds[Math.max(currentIndex - 1, 0)];
        if (previousId) focusRow(previousId);
        break;
      }
      case "ArrowLeft":
        if (hasChildren && isExpanded) {
          event.preventDefault();
          setExpanded(node.id, false);
        } else if (node.parentId && pagesById.has(node.parentId)) {
          event.preventDefault();
          focusRow(node.parentId);
        }
        break;
      case "ArrowRight":
        if (hasChildren && !isExpanded) {
          event.preventDefault();
          setExpanded(node.id, true);
        } else if (hasChildren && isExpanded) {
          event.preventDefault();
          focusRow(node.children[0].id);
        }
        break;
      case "Enter":
        event.preventDefault();
        navigate(`/notes/${node.id}`);
        break;
      default:
        break;
    }
  };

  const renderNode = (node: PageTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = activeId === node.id;
    const title = node.title || t("notes.untitled");
    const preview = dropPreview?.targetId === node.id ? dropPreview : null;

    return (
      <div
        key={node.id}
        ref={(element) => {
          if (element) rowRefs.current.set(node.id, element);
          else rowRefs.current.delete(node.id);
        }}
        role="treeitem"
        data-drop-intent={preview?.kind}
        aria-label={title}
        aria-level={depth}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        tabIndex={tabStopId === node.id ? 0 : -1}
        draggable
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          setFocusedId(node.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          navigate(`/notes/${node.id}`);
        }}
        onKeyDown={(event) => handleKeyDown(event, node)}
        onDragStart={(event) => handleRowDragStart(event, node.id)}
        onDragEnd={clearDragState}
        onDragOver={(event) => handleRowDragOver(event, node)}
        onDrop={(event) => {
          if (preview && preview.kind !== "root" && preview.kind !== "position") {
            handleDrop(event, { kind: preview.kind, targetId: node.id } as PageDropIntent);
            return;
          }
          handleDrop(event, rowDropIntent(event, node.id));
        }}
        className="outline-none"
      >
        <div
          data-expanded={hasChildren ? isExpanded : undefined}
          className={`${pageRowClass} ${draggedId === node.id ? "opacity-45" : ""} ${isSelected ? "font-medium" : ""} ${preview?.kind === "onto" ? "bg-sidebar-accent ring-1 ring-inset ring-sidebar-foreground/25" : ""}`}
          style={pageRowStyle(depth, isSelected && preview?.kind !== "onto")}
        >
          {/* The slot never collapses, so page icons stay in one column; the chevron only shows when it is useful. */}
          <span className="page-row-chevron-slot">
            {hasChildren ? (
              <button
                type="button"
                aria-label={`${isExpanded ? t("notes.collapse") : t("notes.expand")} ${title}`}
                aria-expanded={isExpanded}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded(node.id, !isExpanded);
                }}
                className="page-row-chevron"
              >
                {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
              </button>
            ) : null}
          </span>
          <PageIcon icon={node.icon} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 cursor-pointer truncate py-1">{title}</span>
          <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:group-hover/page-row:opacity-100 md:group-focus-within/page-row:opacity-100">
            <button
              type="button"
              aria-label={t("notes.createSubpage", { title })}
              disabled={creating}
              onClick={(event) => {
                event.stopPropagation();
                onCreateSubpage(node.id);
              }}
              className={pageRowActionClass}
            >
              <span aria-hidden="true">+</span>
            </button>
            <BaseMenu.Root>
              <BaseMenu.Trigger
                render={
                  <button
                    type="button"
                    aria-label={t("notes.moreActions", { title })}
                    onClick={(event) => event.stopPropagation()}
                    className={pageRowActionClass}
                  />
                }
              >
                <span aria-hidden="true">⋯</span>
              </BaseMenu.Trigger>
              <MenuPopup align="end">
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRenamePage?.(node.id);
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t("notes.rename")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite?.(node.id, !node.favorite);
                  }}
                >
                  <Star size={14} aria-hidden="true" fill={node.favorite ? "currentColor" : "none"} />
                  {node.favorite ? t("notes.removeFavorite") : t("notes.addFavorite")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMoveError(null);
                    setMoveTargetId(node.id);
                  }}
                >
                  <FolderInput size={14} aria-hidden="true" />
                  {t("notes.moveTo")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyPageLink(node.id);
                  }}
                >
                  <Link2 size={14} aria-hidden="true" />
                  {t("notes.copyLink")}
                </BaseMenu.Item>
                <BaseMenu.Item
                  className={menuItemClassName}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTrashPage?.(node.id);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {t("notes.moveToTrash")}
                </BaseMenu.Item>
              </MenuPopup>
            </BaseMenu.Root>
          </div>
          {preview?.kind === "before" || preview?.kind === "after" ? (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-sidebar-foreground ${preview.kind === "before" ? "-top-px" : "-bottom-px"}`}
            />
          ) : null}
        </div>
        {hasChildren && isExpanded ? (
          <div
            role="group"
            data-expanded-drop-target={preview?.kind === "onto" ? "true" : undefined}
            className={preview?.kind === "onto" ? "border-l border-sidebar-foreground/30" : ""}
          >
            <div
              aria-hidden="true"
              onDragOver={(event) => handleFirstChildDragOver(event, node.id)}
              onDrop={(event) => handleDrop(event, { kind: "first-child", targetId: node.id })}
              className={`relative ml-4 h-1.5 ${dropPreview?.targetId === node.id && dropPreview.kind === "first-child" ? "bg-sidebar-accent" : ""}`}
            >
              {dropPreview?.targetId === node.id && dropPreview.kind === "first-child" ? (
                <span className="pointer-events-none absolute inset-x-1 top-0.5 h-0.5 rounded-full bg-sidebar-foreground" />
              ) : null}
            </div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  const handleRootDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!draggedId) return;
    const preview = resolveDropPreview(draggedId, { kind: "root", sectionId });
    if (!preview) {
      setDropPreview(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropPreview(preview);
  };

  const moveTo = (destination: MoveDestination) => {
    if (moveTargetId === null) return;
    setMoveTargetId(null);
    if (destination.parentId === null) {
      void performMove(moveTargetId, { kind: "root", sectionId: destination.sectionId });
      return;
    }
    const position = displayPages.filter(
      (page) => page.parentId === destination.parentId && page.id !== moveTargetId,
    ).length;
    void performMove(moveTargetId, { kind: "position", parentId: destination.parentId, position });
  };

  return (
    <div
      className="grid gap-0.5"
      onDragOver={handleRootDragOver}
      onDrop={(event) => handleDrop(event, { kind: "root", sectionId })}
    >
      <div role="tree" aria-label={label} className="grid gap-0.5">
        {tree.length > 0 ? (
          tree.map((node) => renderNode(node, 1))
        ) : sectionId === null && pages.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{t("notes.noPagesYet")}</p>
        ) : null}
      </div>
      {draggedId ? (
        <div
          role="group"
          aria-label={t("notes.rootDropTarget")}
          className={`mt-1 flex min-h-20 items-center justify-center rounded-[6px] border border-dashed px-2 py-2 text-[11px] ${dropPreview?.kind === "root" ? "border-sidebar-foreground/40 bg-sidebar-accent text-sidebar-foreground" : "border-sidebar-border text-muted-foreground"}`}
        >
          {t("notes.dropAtRoot")}
        </div>
      ) : null}
      {moveError ? <p role="alert" className="px-2 py-1 text-[11px] text-destructive">{t("notes.moveError", { error: moveError })}</p> : null}

      <MovePageDialog
        key={moveTarget?.id ?? "closed"}
        page={moveTarget}
        pages={displayPages}
        sections={sections}
        onOpenChange={(open) => {
          if (!open) setMoveTargetId(null);
        }}
        onMove={moveTo}
      />
    </div>
  );
}

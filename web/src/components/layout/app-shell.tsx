import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageMenu } from "@/components/layout/page-menu";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useT } from "@/i18n";
import type { RenameRequest, WorkspaceOutletContext } from "./workspace-outlet-context";
import { Breadcrumb } from "@/features/pages/breadcrumb";
import { PageTree } from "@/features/pages/page-tree";
import { PageShortcuts } from "@/features/pages/page-shortcuts";
import { SidebarShelf } from "@/features/pages/sidebar-shelf";
import { readCollapsedShelves, shelfKey, writeCollapsedShelves } from "@/features/pages/sidebar-state";
import { movePage } from "@/features/pages/move";
import { SearchPalette } from "@/features/search/command-palette";
import {
  createPage,
  createSection,
  deleteSection,
  fetchSections,
  fetchTree,
  moveSection,
  renameSection,
  setPageFavorite,
  softDeletePage,
} from "@/lib/api";
import type { PageMeta, PageSection } from "@/lib/api";
import { EditorBridgeProvider, EditorHistoryControls } from "@/features/editor/editor-bridge";

const mobileQuery = "(max-width: 767px)";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(mobileQuery).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(mobileQuery);
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}

function toPageMeta(page: Awaited<ReturnType<typeof createPage>>): PageMeta {
  return {
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    icon: page.icon,
    position: page.position,
    updatedAt: page.updatedAt,
    deletedAt: page.deletedAt,
    favorite: page.favorite,
    sectionId: page.sectionId,
  };
}

function AppShellContent() {
  const { t } = useT();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [collapsedShelves, setCollapsedShelves] = useState<Set<string>>(() => readCollapsedShelves());
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [newSectionId, setNewSectionId] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [renameRequest, setRenameRequest] = useState<RenameRequest | null>(null);
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const activePageId = useMatch("/notes/:id")?.params.id ?? null;
  const sidebarHidden = isMobile && !mobileMenuOpen;

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const [nextPages, nextSections] = await Promise.all([fetchTree(), fetchSections()]);
      setPages(nextPages);
      setSections(nextSections);
    } catch (error) {
      setTreeError(getErrorMessage(error));
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    writeCollapsedShelves(collapsedShelves);
  }, [collapsedShelves]);

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  // A phone drawer is a menu, not a panel: choosing a page closes it and reveals the page.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleCreatePage = async (parentId: string | null, sectionId?: string | null) => {
    setCreateError(null);
    setCreating(true);
    try {
      const created = await createPage(parentId === null && sectionId !== undefined ? { parentId, sectionId } : { parentId });
      const createdMeta = toPageMeta(created);
      setPages((current) => [...current.filter(({ id }) => id !== createdMeta.id), createdMeta]);
      setTreeError(null);
      if (createdMeta.sectionId !== null) {
        setCollapsedShelves((current) => {
          const next = new Set(current);
          next.delete(shelfKey(createdMeta.sectionId));
          return next;
        });
      }
      navigate(`/notes/${created.id}`);
    } catch (error) {
      setCreateError(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const updatePageMeta = useCallback((id: string, patch: Partial<PageMeta>) => {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }, []);

  const handlePagesMoved = useCallback((changed: PageMeta[]) => {
    setPages((current) => current.map((page) => changed.find((next) => next.id === page.id) ?? page));
  }, []);

  const handleRenamePage = (pageId: string) => {
    setRenameRequest((current) => ({ pageId, token: (current?.token ?? 0) + 1 }));
    navigate(`/notes/${pageId}`);
  };

  const handleTrashPage = async (pageId: string) => {
    setTrashError(null);
    try {
      const { deleted } = await softDeletePage(pageId);
      const removed = new Set(deleted);
      setPages((current) => current.filter((page) => !removed.has(page.id)));
      if (activePageId && removed.has(activePageId)) navigate("/");
    } catch (error) {
      setTrashError(getErrorMessage(error));
    }
  };

  const handleToggleFavorite = async (pageId: string, favorite: boolean) => {
    setFavoriteError(null);
    try {
      const updated = await setPageFavorite(pageId, favorite);
      updatePageMeta(pageId, { favorite: updated.favorite });
    } catch (error) {
      setFavoriteError(getErrorMessage(error));
    }
  };

  const toggleShelf = (key: string) => {
    setCollapsedShelves((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCreateSection = async () => {
    setShelfError(null);
    try {
      const created = await createSection(t("notes.newSection"));
      setSections((current) => [...current, created]);
      setCollapsedShelves((current) => {
        const next = new Set(current);
        next.delete(created.id);
        return next;
      });
      setNewSectionId(created.id);
    } catch (error) {
      setShelfError(getErrorMessage(error));
    }
  };

  const handleRenameSection = async (sectionId: string, name: string) => {
    setShelfError(null);
    try {
      const updated = await renameSection(sectionId, name);
      setSections((current) => current.map((section) => (section.id === sectionId ? updated : section)));
    } catch (error) {
      setShelfError(getErrorMessage(error));
    } finally {
      setNewSectionId(null);
    }
  };

  const handleMoveSection = async (sectionId: string, position: number) => {
    setShelfError(null);
    try {
      const changed = await moveSection(sectionId, position);
      setSections((current) =>
        current
          .map((section) => changed.find((next) => next.id === section.id) ?? section)
          .sort((left, right) => left.position - right.position),
      );
    } catch (error) {
      setShelfError(getErrorMessage(error));
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    setShelfError(null);
    try {
      await deleteSection(sectionId);
      setSections((current) => current.filter((section) => section.id !== sectionId));
      await loadTree();
    } catch (error) {
      setShelfError(getErrorMessage(error));
    }
  };

  /** Dropping a page on a shelf heading puts it at the top level of that shelf. */
  const handleDropOnShelf = async (sectionId: string | null) => {
    if (draggedPageId === null) return;
    const pageId = draggedPageId;
    setDraggedPageId(null);
    setShelfError(null);
    const position = pages.filter(
      (page) => page.parentId === null && (page.sectionId ?? null) === (sectionId ?? null) && page.id !== pageId,
    ).length;
    try {
      handlePagesMoved(await movePage(pageId, { parentId: null, position, sectionId }));
    } catch (error) {
      setShelfError(getErrorMessage(error));
    }
  };

  const pageTreeProps = {
    pages,
    sections,
    activeId: activePageId,
    draggedId: draggedPageId,
    onCreateSubpage: (parentId: string) => void handleCreatePage(parentId),
    onRenamePage: handleRenamePage,
    onTrashPage: (pageId: string) => void handleTrashPage(pageId),
    onToggleFavorite: (pageId: string, favorite: boolean) => void handleToggleFavorite(pageId, favorite),
    onDragPage: setDraggedPageId,
    onMoved: handlePagesMoved,
    creating,
  };

  return (
    <div className="workspace-shell" data-mobile-open={mobileMenuOpen}>
      {isMobile && mobileMenuOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label={t("notes.closeSidebar")}
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        id="workspace-sidebar"
        className="workspace-sidebar"
        aria-label={t("notes.workspaceSidebar")}
        aria-hidden={sidebarHidden}
        inert={sidebarHidden}
      >
        <div className="sidebar-header">
          <div className="sidebar-heading-row">
            <Link to="/" className="workspace-title text-inherit no-underline hover:text-foreground">{t("notes.workspace")}</Link>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sidebar-close"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t("notes.closeSidebar")}
            </Button>
          </div>
          <div className="sidebar-actions">
            <SearchPalette triggerClassName="sidebar-search" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("notes.newPage")}
              title={t("notes.newPage")}
              className="sidebar-new-page"
              disabled={creating}
              onClick={() => void handleCreatePage(null)}
            >
              <Plus size={15} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="sidebar-body">
          <nav aria-label={t("notes.pageNavigation")}>
            {treeLoading ? <LoadingSkeleton label={t("notes.loadingTree")} className="sidebar-skeleton" /> : null}
            {!treeLoading && treeError ? (
              <div role="alert" className="grid gap-2 px-1 text-sm text-muted-foreground">
                <p>{t("notes.loadTreeError", { error: treeError })}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void loadTree()}>
                  {t("notes.retryPages")}
                </Button>
              </div>
            ) : null}
            {!treeLoading && !treeError ? (
              <>
                <PageShortcuts
                  pages={pages}
                  activeId={activePageId}
                  onToggleFavorite={(pageId, favorite) => void handleToggleFavorite(pageId, favorite)}
                />
                <SidebarShelf
                  label={t("notes.pages")}
                  collapsed={collapsedShelves.has(shelfKey(null))}
                  canDrop={draggedPageId !== null}
                  onToggle={() => toggleShelf(shelfKey(null))}
                  onCreate={() => void handleCreatePage(null, null)}
                  onDrop={() => void handleDropOnShelf(null)}
                >
                  <PageTree {...pageTreeProps} sectionId={null} label={t("notes.pages")} />
                </SidebarShelf>

                {sections.map((section, index) => (
                  <SidebarShelf
                    key={section.id}
                    label={section.name.trim() || t("notes.untitledShelf")}
                    editable
                    autoRename={newSectionId === section.id}
                    collapsed={collapsedShelves.has(section.id)}
                    canDrop={draggedPageId !== null}
                    onToggle={() => toggleShelf(section.id)}
                    onCreate={() => void handleCreatePage(null, section.id)}
                    onRename={(name) => void handleRenameSection(section.id, name)}
                    onMoveUp={() => void handleMoveSection(section.id, index - 1)}
                    onMoveDown={() => void handleMoveSection(section.id, index + 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < sections.length - 1}
                    onDelete={() => void handleDeleteSection(section.id)}
                    onDrop={() => void handleDropOnShelf(section.id)}
                  >
                    <PageTree
                      {...pageTreeProps}
                      sectionId={section.id}
                      label={section.name.trim() || t("notes.untitledShelf")}
                    />
                  </SidebarShelf>
                ))}

                <button type="button" className="sidebar-new-section" onClick={() => void handleCreateSection()}>
                  <Plus size={12} aria-hidden="true" />
                  {t("notes.newSection")}
                </button>
              </>
            ) : null}
            {createError ? (
              <p role="alert" className="mt-2 px-2 text-sm text-destructive">
                {t("notes.createPageError", { error: createError })}
              </p>
            ) : null}
            {trashError ? (
              <p role="alert" className="mt-2 px-2 text-sm text-destructive">
                {t("notes.trashPageError", { error: trashError })}
              </p>
            ) : null}
            {favoriteError ? (
              <p role="alert" className="mt-2 px-2 text-sm text-destructive">
                {t("notes.favoriteError", { error: favoriteError })}
              </p>
            ) : null}
            {shelfError ? (
              <p role="alert" className="mt-2 px-2 text-sm text-destructive">
                {t("notes.sidebarError", { error: shelfError })}
              </p>
            ) : null}
          </nav>
        </div>
        <nav aria-label={t("notes.workspaceActions")} className="border-t border-sidebar-border p-3">
          <NavLink
            to="/trash"
            className={({ isActive }) =>
              `flex min-h-8 items-center rounded-[4px] px-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring ${isActive ? "bg-sidebar-accent text-sidebar-foreground" : ""}`
            }
          >
            {t("notes.trash")}
          </NavLink>
        </nav>
      </aside>

      <main className="canvas-main" aria-label={t("notes.mainCanvas")}>
        <header className="canvas-toolbar">
          <div className="canvas-toolbar-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mobile-menu-toggle"
              aria-controls="workspace-sidebar"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {t("notes.menu")}
            </Button>
            <Breadcrumb
              pages={pages}
              pageId={activePageId}
              section={
                location.pathname.startsWith("/notes") ? t("shell.section.notes")
                  : location.pathname.startsWith("/trash") ? t("notes.trash")
                    : location.pathname.startsWith("/habits") ? t("shell.section.habits")
                      : location.pathname.startsWith("/ui-lab") ? t("shell.section.uiLab")
                        : t("shell.section.home")
              }
            />
          </div>
          <div className="canvas-toolbar-end">
            <EditorHistoryControls />
            <ThemeToggle />
            <LanguageToggle />
            <PageMenu
              pageId={activePageId}
              pages={pages}
              sections={sections}
              onRefreshTree={loadTree}
              onToggleFavorite={(pageId, favorite) => void handleToggleFavorite(pageId, favorite)}
              onTrashPage={(pageId) => void handleTrashPage(pageId)}
            />
          </div>
        </header>

        <div className="canvas-content" key={location.pathname}>
          <Outlet
            context={{
              pages,
              renameRequest,
              refreshTree: loadTree,
              updatePageMeta,
              createPage: handleCreatePage,
              treeLoading,
              treeError,
            } satisfies WorkspaceOutletContext}
          />
        </div>
      </main>
    </div>
  );
}

export function AppShell() {
  return (
    <EditorBridgeProvider>
      <AppShellContent />
    </EditorBridgeProvider>
  );
}

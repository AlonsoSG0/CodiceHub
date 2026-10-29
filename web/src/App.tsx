import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/app/theme-provider";
import { PageSurfacePlaceholder } from "@/app/routes";
import { HomePage } from "@/features/home/home-page";
import { NotesIndexPage } from "@/features/pages/notes-index-page";
import { TrashPage } from "@/features/trash/trash-page";
import { GlobalDock } from "@/components/layout/global-dock";
import { LoadingSkeleton } from "@/components/layout/loading-skeleton";
import { SettingsPage } from "@/features/settings/settings-page";
import { ToastProvider } from "@/components/ui/toast";

/**
 * The UI lab is a development-only surface, and it is reached through a dynamic
 * import so the production build drops it whole: the page, the nine component
 * sets it renders, and the Excalidraw boundary with its Mermaid dependency.
 * A static import here shipped all of that into the entry chunk and emitted
 * megabytes of chunks nothing could ever reach.
 */
const DevUiLabPage = /* @__PURE__ */ lazy(() =>
  import("@/features/ui-lab/ui-lab-page").then(({ UiLabPage }) => ({ default: UiLabPage })),
);

/**
 * The habits section is reached through a dynamic import for the same reason the lab is: the vendored MDXCN
 * graph-frame core and the heatmap it drives belong to this route, not to the entry chunk every visitor loads.
 */
const HabitsPage = /* @__PURE__ */ lazy(() =>
  import("@/features/habits/habits-page").then(({ HabitsPage: Page }) => ({ default: Page })),
);

const BooksPage = /* @__PURE__ */ lazy(() =>
  import("@/features/books/books-page").then(({ BooksPage: Page }) => ({ default: Page })),
);

/**
 * The routine section is a prototype over mocked data. It still loads through a dynamic import so the
 * entry chunk keeps its size whether or not the module graduates (S13).
 */
const RoutinePage = /* @__PURE__ */ lazy(() =>
  import("@/features/routine/routine-page").then(({ RoutinePage: Page }) => ({ default: Page })),
);

/**
 * A book's notebook is its own route, and it pulls in the whole editor, so it stays behind its own chunk.
 */
const BookNotebookPage = /* @__PURE__ */ lazy(() =>
  import("@/features/books/book-notebook-page").then(({ BookNotebookPage: Page }) => ({ default: Page })),
);

/**
 * The projects section and the board of one project. The board pulls in the drag-and-drop stack of
 * Kibo UI's kanban, so neither route belongs in the entry chunk.
 */
const ProjectsPage = /* @__PURE__ */ lazy(() =>
  import("@/features/projects/projects-page").then(({ ProjectsPage: Page }) => ({ default: Page })),
);

const TasksPage = /* @__PURE__ */ lazy(() =>
  import("@/features/tasks/tasks-page").then(({ TasksPage: Page }) => ({ default: Page })),
);

const GoalsPage = /* @__PURE__ */ lazy(() =>
  import("@/features/goals/goals-page").then(({ GoalsPage: Page }) => ({ default: Page })),
);

const GoalPage = /* @__PURE__ */ lazy(() =>
  import("@/features/goals/goal-page").then(({ GoalPage: Page }) => ({ default: Page })),
);

const ProjectBoardPage = /* @__PURE__ */ lazy(() =>
  import("@/features/projects/board-page").then(({ BoardPage: Page }) => ({ default: Page })),
);

// The Home prototype's route was removed once its decision was folded into
// `@/features/home` (variant A). The page itself stays on disk, unreferenced and
// out of the module graph, because its unchosen variants B, C and D are still
// reference material for widgets and navigation the Home may adopt later.

function LegacyPageRedirect() {
  const { id } = useParams();
  return <Navigate to={`/notes/${id}`} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="habits"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading habits" />}>
                <HabitsPage />
              </Suspense>
            }
          />
          <Route
            path="routine"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading routine" />}>
                <RoutinePage />
              </Suspense>
            }
          />
          <Route
            path="books"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading books" />}>
                <BooksPage />
              </Suspense>
            }
          />
          <Route
            path="books/:bookId/notebook"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading notebook" />}>
                <BookNotebookPage />
              </Suspense>
            }
          />
          <Route
            path="projects"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading projects" />}>
                <ProjectsPage />
              </Suspense>
            }
          />
          <Route
            path="tasks"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading tasks" />}>
                <TasksPage />
              </Suspense>
            }
          />
          <Route
            path="goals"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading goals" />}>
                <GoalsPage />
              </Suspense>
            }
          />
          <Route
            path="goals/:goalId"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading goal" />}>
                <GoalPage />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <Suspense fallback={<LoadingSkeleton label="Loading board" />}>
                <ProjectBoardPage />
              </Suspense>
            }
          />
          <Route element={<AppShell />}>
            <Route path="notes" element={<NotesIndexPage />} />
            <Route path="notes/:id" element={<PageSurfacePlaceholder />} />
            <Route path="p/:id" element={<LegacyPageRedirect />} />
            <Route path="trash" element={<TrashPage />} />
            {import.meta.env.DEV && (
              <Route
                path="ui-lab"
                element={
                  <Suspense fallback={null}>
                    <DevUiLabPage />
                  </Suspense>
                }
              />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
          <GlobalDock />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

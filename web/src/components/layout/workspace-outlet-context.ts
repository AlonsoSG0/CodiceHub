import { useOutletContext } from "react-router-dom";
import type { PageMeta } from "@/lib/api";

export type RenameRequest = { pageId: string; token: number };

export type WorkspaceOutletContext = {
  pages: PageMeta[];
  refreshTree: () => Promise<void>;
  updatePageMeta: (id: string, patch: Partial<PageMeta>) => void;
  renameRequest: RenameRequest | null;
  /** Creates a root page, opens it, and registers it in the sidebar tree. */
  createPage: (parentId: string | null) => Promise<void>;
  treeLoading: boolean;
  treeError: string | null;
};

export function useWorkspaceOutletContext(): Partial<WorkspaceOutletContext> {
  return useOutletContext<Partial<WorkspaceOutletContext>>() ?? {};
}

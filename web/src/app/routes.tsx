import { EmptyState } from "@/components/layout/empty-state";

export function WelcomePage() {
  return (
    <div className="page-column">
      <EmptyState
        title="Welcome to your workspace"
        description="Your notes will appear here when you create a page."
      />
    </div>
  );
}

export { PageView as PageSurfacePlaceholder } from "@/features/pages/page-view";

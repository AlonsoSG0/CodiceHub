import type { ReactNode } from "react";

/** A muted label with at most one quiet action, the only heading the notes sidebar uses. */
export function SidebarGroupHeading({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="sidebar-group-heading">
      <span>{label}</span>
      {children}
    </div>
  );
}

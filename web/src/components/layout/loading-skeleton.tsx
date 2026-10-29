export function LoadingSkeleton({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={`loading-skeleton ${className}`.trim()}>
      <span className="skeleton-line" aria-hidden="true" />
      <span className="skeleton-line" aria-hidden="true" />
      <span className="skeleton-line" aria-hidden="true" />
    </div>
  );
}

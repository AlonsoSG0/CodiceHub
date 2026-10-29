export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <h1 id="empty-state-title" className="page-title">
        {title}
      </h1>
      <p className="empty-state-copy">{description}</p>
    </section>
  );
}

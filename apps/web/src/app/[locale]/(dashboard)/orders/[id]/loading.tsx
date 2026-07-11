import { MetricCardSkeleton, SurfaceCard, TableSkeleton } from '@/components/ui/page';

export default function OrderControlLoading() {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <span className="skeleton-line skeleton-short" />
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line skeleton-wide" />
        </div>
      </div>
      <section className="stats-grid" aria-label="Loading order summary">
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </section>
      <section className="panel-grid">
        <SurfaceCard>
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-wide" />
        </SurfaceCard>
        <SurfaceCard>
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-wide" />
        </SurfaceCard>
      </section>
      <TableSkeleton rows={4} />
    </div>
  );
}

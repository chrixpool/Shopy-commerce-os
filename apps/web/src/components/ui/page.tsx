import type { ReactNode } from 'react';
import Link from 'next/link';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions ? <div className="actions-row">{actions}</div> : null}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  help: string;
  badge?: string;
  badgeTone?: 'success' | 'warning' | 'info' | 'muted' | 'danger';
  href?: string;
}

export function MetricCard({
  label,
  value,
  help,
  badge,
  badgeTone = 'muted',
  href,
}: MetricCardProps) {
  const content = (
    <>
      <div className="metric-header">
        <p className="metric-label">{label}</p>
        {badge ? <span className={`badge badge-${badgeTone}`}>{badge}</span> : null}
      </div>
      <p className="metric-value">{value}</p>
      <p className="metric-help">{help}</p>
    </>
  );
  return href ? (
    <Link className="card metric-card metric-card-link" href={href} prefetch>
      {content}
    </Link>
  ) : (
    <div className="card metric-card">{content}</div>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {actions ? <div className="actions-row">{actions}</div> : null}
    </div>
  );
}

export function SurfaceCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card card-padded surface-card ${className}`}>{children}</section>;
}

export function StatusBadge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'success' | 'warning' | 'info' | 'muted' | 'danger';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function BusinessAlert({
  title,
  description,
  tone = 'info',
  action,
}: {
  title: string;
  description: string;
  tone?: 'success' | 'warning' | 'info' | 'danger';
  action?: ReactNode;
}) {
  return (
    <div className={`business-alert business-alert-${tone}`} role="status">
      <span className="business-alert-mark" aria-hidden="true" />
      <div className="business-alert-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {action ? <div className="business-alert-action">{action}</div> : null}
    </div>
  );
}

export function TrendIndicator({
  value,
  direction = 'neutral',
}: {
  value: string;
  direction?: 'up' | 'down' | 'neutral';
}) {
  return <span className={`trend trend-${direction}`}>{value}</span>;
}

export function ProgressSummary({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div className="progress-summary">
      <div>
        <span>{label}</span>
        <strong>{Math.round(percent)}%</strong>
      </div>
      <span className="progress-track">
        <span style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div>
        <span className="empty-icon" aria-hidden="true">
          {icon}
        </span>
        <h2 className="empty-title">{title}</h2>
        <p className="empty-description">{description}</p>
        {action ? (
          <div className="actions-row" style={{ justifyContent: 'center', marginTop: 18 }}>
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'This view needs a moment',
  description = 'Retry the request. If the workspace API is waking up, this usually clears shortly.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state error-state">
      <div>
        <span className="empty-icon" aria-hidden="true">
          ER
        </span>
        <h2 className="empty-title">{title}</h2>
        <p className="empty-description">{description}</p>
        {action ? (
          <div className="actions-row" style={{ justifyContent: 'center', marginTop: 18 }}>
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingState({ title = 'Preparing workspace...' }: { title?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{title}</span>
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="card metric-card skeleton-card" aria-hidden="true">
      <span className="skeleton-line skeleton-short" />
      <span className="skeleton-line skeleton-value" />
      <span className="skeleton-line" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <div className="skeleton-table">
        {Array.from({ length: rows }).map((_, index) => (
          <span className="skeleton-line" key={index} />
        ))}
      </div>
    </div>
  );
}

export function AppPageSkeleton() {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <span className="skeleton-line skeleton-short" />
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line skeleton-wide" />
        </div>
      </div>
      <section className="stats-grid" aria-label="Loading metrics">
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </section>
      <TableSkeleton />
    </div>
  );
}

interface SetupStep {
  title: string;
  copy: string;
}

export function SetupSteps({ steps }: { steps: SetupStep[] }) {
  return (
    <ol className="step-list">
      {steps.map((step, index) => (
        <li className="step-item" key={step.title}>
          <span className="step-number">{index + 1}</span>
          <div>
            <p className="step-title">{step.title}</p>
            <p className="step-copy">{step.copy}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface ComingSoonPageProps {
  area: string;
  title: string;
  description: string;
  phase: string;
  icon: string;
  primaryAction?: string;
}

export function ComingSoonPage({
  area,
  title,
  description,
  phase,
  icon,
  primaryAction = 'Review workflow',
}: ComingSoonPageProps) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={area}
        title={title}
        description={description}
        actions={
          <button className="button button-secondary" type="button">
            {primaryAction}
          </button>
        }
      />

      <div className="panel-grid">
        <EmptyState
          icon={icon}
          title={`${title} is ready for workspace data`}
          description={`${phase}. Connect records to activate this operational view.`}
          action={
            <button className="button button-primary" type="button">
              Review workflow
            </button>
          }
        />

        <section className="card card-padded">
          <h2 className="section-title">What happens here</h2>
          <p className="section-description">
            This screen keeps the next action visible so teams understand the workflow before
            records arrive.
          </p>
          <div style={{ marginTop: 18 }}>
            <SetupSteps
              steps={[
                {
                  title: 'Connect records',
                  copy: 'Add the integration or import records for this workflow.',
                },
                {
                  title: 'Review incoming work',
                  copy: 'New items appear in a focused list with status and owner.',
                },
                {
                  title: 'Act with confidence',
                  copy: 'Use clear primary actions and status badges to move work forward.',
                },
              ]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

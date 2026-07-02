import type { ReactNode } from 'react';

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
  badgeTone?: 'success' | 'warning' | 'info' | 'muted';
}

export function MetricCard({ label, value, help, badge, badgeTone = 'muted' }: MetricCardProps) {
  return (
    <div className="card metric-card">
      <div className="metric-header">
        <p className="metric-label">{label}</p>
        {badge ? <span className={`badge badge-${badgeTone}`}>{badge}</span> : null}
      </div>
      <p className="metric-value">{value}</p>
      <p className="metric-help">{help}</p>
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
  primaryAction = 'Review setup',
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
          title={`${title} is ready for data`}
          description={`${phase}. The workspace is prepared, and this view will populate as soon as the related workflow is connected.`}
          action={
            <button className="button button-primary" type="button">
              Continue setup
            </button>
          }
        />

        <section className="card card-padded">
          <h2 className="section-title">What happens here</h2>
          <p className="section-description">
            This screen keeps the next action visible, so new users understand the workflow before
            live records arrive.
          </p>
          <div style={{ marginTop: 18 }}>
            <SetupSteps
              steps={[
                {
                  title: 'Connect the source',
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

import Link from 'next/link';
import { EmptyState, MetricCard, PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

interface BusinessActivity {
  id: string;
  action: string;
  note?: string | null;
  source: string;
  actor: string;
  actorRole?: string | null;
  entityReference: string;
  createdAt: string;
}

interface AutomationRun {
  id: string;
  status: string;
  startedAt: string;
  dryRun?: boolean;
  errorMessage?: string | null;
}

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ source?: string; action?: string; actor?: string }>;
}) {
  const { locale } = await params;
  const filters = (await searchParams) ?? {};
  const [businessActivity, automationRuns, shopifyRuns] = await Promise.all([
    optionalApiFetch<BusinessActivity[]>('/api/v1/orders/activity', []),
    optionalApiFetch<AutomationRun[]>('/api/v1/automations/runs', []),
    optionalApiFetch<AutomationRun[]>('/api/v1/integrations/shopify/sync-runs', []),
  ]);

  const timeline = [
    ...businessActivity.map((event) => ({
      id: `event-${event.id}`,
      type: event.source.replaceAll('_', ' '),
      title: `${event.entityReference} - ${event.action.replaceAll('_', ' ')}`,
      description: `${event.actor}${event.actorRole ? ` (${event.actorRole})` : ''}${event.note ? ` - ${event.note}` : ''}`,
      at: event.createdAt,
      tone: event.source === 'USER' ? 'success' : event.source === 'SYSTEM' ? 'muted' : 'info',
    })),
    ...automationRuns.slice(0, 12).map((run) => ({
      id: `automation-${run.id}`,
      type: 'AUTOMATION',
      title: run.dryRun ? 'Dry-run automation' : 'Automation run',
      description: `System - ${run.errorMessage ?? run.status.replaceAll('_', ' ').toLowerCase()}`,
      at: run.startedAt,
      tone: run.status === 'SUCCESS' ? 'success' : run.errorMessage ? 'warning' : 'info',
    })),
    ...shopifyRuns.slice(0, 12).map((run) => ({
      id: `shopify-${run.id}`,
      type: 'SHOPIFY',
      title: run.dryRun ? 'Shopify dry-run sync' : 'Shopify sync',
      description: `Shopify - ${run.errorMessage ?? run.status.replaceAll('_', ' ').toLowerCase()}`,
      at: run.startedAt,
      tone: run.status === 'SUCCESS' ? 'success' : run.errorMessage ? 'warning' : 'info',
    })),
  ]
    .filter((item) => !filters.source || item.type === filters.source)
    .filter(
      (item) => !filters.action || item.title.toLowerCase().includes(filters.action.toLowerCase()),
    )
    .filter(
      (item) =>
        !filters.actor || item.description.toLowerCase().includes(filters.actor.toLowerCase()),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Control room"
        title="Activity"
        description="Review business actions with their actor and source. Legacy events without an actor are identified clearly."
        actions={
          <Link className="button button-primary" href={`/${locale}/dashboard`} prefetch={false}>
            Back to dashboard
          </Link>
        }
      />

      <form className="toolbar" aria-label="Activity filters">
        <label className="form-field compact-select">
          <span>Source</span>
          <select className="select-field" name="source" defaultValue={filters.source ?? ''}>
            <option value="">All sources</option>
            <option value="USER">User</option>
            <option value="SYSTEM">System</option>
            <option value="SHOPIFY">Shopify</option>
            <option value="MES COLIS">Mes Colis</option>
            <option value="AUTOMATION">Automation</option>
          </select>
        </label>
        <label className="form-field">
          <span>Action</span>
          <input
            className="field"
            name="action"
            defaultValue={filters.action ?? ''}
            placeholder="Filter action"
          />
        </label>
        <label className="form-field">
          <span>Actor</span>
          <input
            className="field"
            name="actor"
            defaultValue={filters.actor ?? ''}
            placeholder="Filter actor"
          />
        </label>
        <button className="button button-secondary" type="submit">
          Apply filters
        </button>
      </form>

      <section className="stats-grid" aria-label="Activity summary">
        <MetricCard
          label="Business events"
          value={String(businessActivity.length)}
          help="Recent organization-scoped actions with actor identity."
          badge="Audit"
          badgeTone="info"
        />
        <MetricCard
          label="Automation runs"
          value={String(automationRuns.length)}
          help="Recent internal automation execution records."
          badge="System"
          badgeTone="muted"
        />
        <MetricCard
          label="Shopify sync runs"
          value={String(shopifyRuns.length)}
          help="Read-only provider synchronization activity."
          badge="Shopify"
          badgeTone="info"
        />
      </section>

      <SurfaceCard>
        {timeline.length ? (
          <div className="activity-list">
            {timeline.slice(0, 100).map((item) => (
              <div className="activity-item" key={item.id}>
                <div>
                  <p className="activity-title">{item.title}</p>
                  <p className="activity-description">{item.description}</p>
                  <p className="activity-time">{formatDate(item.at, locale)}</p>
                </div>
                <StatusBadge tone={item.tone as 'success' | 'warning' | 'info' | 'muted'}>
                  {item.type}
                </StatusBadge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="AC"
            title="No business activity recorded yet"
            description="Shopy will record confirmation, fulfillment, costing, integration, and provider actions here."
          />
        )}
      </SurfaceCard>
    </div>
  );
}

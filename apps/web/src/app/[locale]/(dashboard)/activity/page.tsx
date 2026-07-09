import Link from 'next/link';
import { EmptyState, MetricCard, PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  source?: string | null;
  createdAt: string;
}

interface OrdersResponse {
  data: OrderRecord[];
}

interface DraftAction {
  id: string;
  title: string;
  status: string;
  provider: string;
  createdAt: string;
}

interface AutomationRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
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

export default async function ActivityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [orders, automationRuns, draftActions, shopifyRuns] = await Promise.all([
    optionalApiFetch<OrdersResponse>('/api/v1/orders?limit=8', { data: [] }),
    optionalApiFetch<AutomationRun[]>('/api/v1/automations/runs', []),
    optionalApiFetch<DraftAction[]>('/api/v1/draft-actions', []),
    optionalApiFetch<AutomationRun[]>('/api/v1/integrations/shopify/sync-runs', []),
  ]);

  const timeline = [
    ...orders.data.map((order) => ({
      id: `order-${order.id}`,
      type: 'Order',
      title: order.orderNumber,
      description: `${order.customerName} · ${order.status} · ${order.source ?? 'manual'}`,
      at: order.createdAt,
      tone: order.source === 'shopify' ? 'info' : 'muted',
    })),
    ...automationRuns.slice(0, 8).map((run) => ({
      id: `automation-${run.id}`,
      type: 'Automation',
      title: run.dryRun ? 'Dry-run automation' : 'Automation run',
      description: run.errorMessage ?? run.status.replaceAll('_', ' ').toLowerCase(),
      at: run.startedAt,
      tone: run.status === 'SUCCESS' ? 'success' : run.errorMessage ? 'warning' : 'info',
    })),
    ...shopifyRuns.slice(0, 8).map((run) => ({
      id: `shopify-${run.id}`,
      type: 'Shopify',
      title: run.dryRun ? 'Shopify dry-run sync' : 'Shopify sync',
      description: run.errorMessage ?? run.status.replaceAll('_', ' ').toLowerCase(),
      at: run.startedAt,
      tone: run.status === 'SUCCESS' ? 'success' : run.errorMessage ? 'warning' : 'info',
    })),
    ...draftActions.slice(0, 8).map((action) => ({
      id: `draft-${action.id}`,
      type: 'Draft action',
      title: action.title,
      description: `${action.provider.replaceAll('_', ' ')} · ${action.status}`,
      at: action.createdAt,
      tone: action.status === 'APPROVED' ? 'success' : 'warning',
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Control room"
        title="Activity"
        description="Review recent order movement, automation runs, draft actions, and Shopify sync activity without exposing provider payloads."
        actions={
          <Link className="button button-primary" href={`/${locale}/dashboard`} prefetch>
            Back to dashboard
          </Link>
        }
      />

      <section className="stats-grid" aria-label="Activity summary">
        <MetricCard
          label="Recent orders"
          value={String(orders.data.length)}
          help="Latest order records visible in the activity stream."
          badge="Orders"
          badgeTone="info"
        />
        <MetricCard
          label="Automation runs"
          value={String(automationRuns.length)}
          help="Recent dry-run or manual automation executions."
          badge="Safe"
          badgeTone="success"
        />
        <MetricCard
          label="Draft actions"
          value={String(draftActions.length)}
          help="Actions waiting for review before anything external happens."
          badge="Approval"
          badgeTone={draftActions.length ? 'warning' : 'success'}
        />
        <MetricCard
          label="Shopify sync runs"
          value={String(shopifyRuns.length)}
          help="Read-only Shopify import activity."
          badge="Read-only"
          badgeTone="info"
        />
      </section>

      <SurfaceCard>
        {timeline.length ? (
          <div className="activity-list">
            {timeline.slice(0, 24).map((item) => (
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
            title="No activity recorded yet"
            description="Create orders, run a Shopify dry-run, or test an automation to populate the activity stream."
          />
        )}
      </SurfaceCard>
    </div>
  );
}

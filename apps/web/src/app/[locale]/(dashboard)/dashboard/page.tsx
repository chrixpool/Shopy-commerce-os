import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface DashboardSummary {
  totalOrders: number;
  revenue: number;
  workQueues: {
    pendingConfirmation: number;
    readyToPack: number;
    inDelivery: number;
    lowStockProducts: number;
  };
  ordersByStatus: Record<string, number>;
  suggestions: Array<{ title: string; copy: string }>;
}

interface IntegrationStatus {
  provider: string;
  status: string;
  mode: string;
  lastSyncAt?: string | null;
}

interface DraftAction {
  id: string;
  title: string;
  status: string;
  provider: string;
  createdAt: string;
}

interface CostingSummary {
  grossMargin: number;
  grossMarginPercent: number;
  productsMissingCost: number;
}

const EMPTY_SUMMARY: DashboardSummary = {
  totalOrders: 0,
  revenue: 0,
  workQueues: {
    pendingConfirmation: 0,
    readyToPack: 0,
    inDelivery: 0,
    lowStockProducts: 0,
  },
  ordersByStatus: {},
  suggestions: [],
};

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations();
  const [summary, workspace, integrations, draftActions, costing] = await Promise.all([
    optionalApiFetch<DashboardSummary>('/api/v1/dashboard/summary', EMPTY_SUMMARY),
    getWorkspaceSettings().catch(() => ({ baseCurrency: 'USD' })),
    optionalApiFetch<IntegrationStatus[]>('/api/v1/integrations', []),
    optionalApiFetch<DraftAction[]>('/api/v1/draft-actions', []),
    optionalApiFetch<CostingSummary>('/api/v1/costing/summary', {
      grossMargin: 0,
      grossMarginPercent: 0,
      productsMissingCost: 0,
    }),
  ]);
  const connectedChannels = integrations.filter(
    (integration) => integration.status === 'CONNECTED',
  );
  const externalChannels = integrations.filter((integration) =>
    ['SHOPIFY', 'META_ADS', 'FACEBOOK_PAGE', 'INSTAGRAM'].includes(integration.provider),
  );
  const pendingDrafts = draftActions.filter((action) =>
    ['DRAFT', 'PENDING_APPROVAL'].includes(action.status),
  );
  const shopify = integrations.find((integration) => integration.provider === 'SHOPIFY');
  const meta = integrations.find((integration) => integration.provider === 'META_ADS');
  const alerts = [
    summary.workQueues.pendingConfirmation
      ? {
          title: 'Confirmation queue needs action',
          copy: `${summary.workQueues.pendingConfirmation} order(s) are waiting for customer confirmation.`,
          href: 'confirmation',
          tone: 'warning',
        }
      : null,
    summary.workQueues.lowStockProducts
      ? {
          title: 'Low stock risk',
          copy: `${summary.workQueues.lowStockProducts} product(s) are at or below threshold.`,
          href: 'inventory',
          tone: 'warning',
        }
      : null,
    costing.productsMissingCost
      ? {
          title: 'Product cost data missing',
          copy: `${costing.productsMissingCost} product(s) need unit costs before margin is reliable.`,
          href: 'factory',
          tone: 'warning',
        }
      : null,
    shopify?.status === 'ERROR'
      ? {
          title: 'Shopify sync needs review',
          copy: 'Check credentials, scopes, or store domain in Settings.',
          href: 'settings',
          tone: 'danger',
        }
      : null,
    meta && meta.status !== 'CONNECTED'
      ? {
          title: 'Marketing data is not connected',
          copy: 'Meta Ads remains read-only and disconnected until credentials are configured.',
          href: 'campaigns',
          tone: 'muted',
        }
      : null,
  ].filter(Boolean) as Array<{ title: string; copy: string; href: string; tone: string }>;
  const rows = [
    {
      work: 'Confirm customers',
      owner: 'Confirmation',
      status: `${summary.workQueues.pendingConfirmation} waiting`,
      tone: summary.workQueues.pendingConfirmation > 0 ? 'warning' : 'success',
    },
    {
      work: 'Pack confirmed orders',
      owner: 'Fulfillment',
      status: `${summary.workQueues.readyToPack} ready`,
      tone: summary.workQueues.readyToPack > 0 ? 'info' : 'success',
    },
    {
      work: 'Track delivery',
      owner: 'Delivery',
      status: `${summary.workQueues.inDelivery} active`,
      tone: summary.workQueues.inDelivery > 0 ? 'muted' : 'success',
    },
    {
      work: 'Restock inventory',
      owner: 'Inventory',
      status: `${summary.workQueues.lowStockProducts} low stock`,
      tone: summary.workQueues.lowStockProducts > 0 ? 'warning' : 'success',
    },
  ] as const;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title={t('nav.dashboard')}
        description="A quick view of orders, confirmations, fulfillment, and revenue. Start here to understand what needs attention today."
        actions={
          <>
            <Link className="button button-primary" href={`/${locale}/orders`} prefetch>
              Add or import orders
            </Link>
          </>
        }
      />

      <section className="stats-grid" aria-label="Key metrics">
        <MetricCard
          label="Total orders"
          value={String(summary.totalOrders)}
          help="All orders in this workspace."
          badge="Live"
          badgeTone="info"
        />
        <MetricCard
          label="Need confirmation"
          value={String(summary.workQueues.pendingConfirmation)}
          help="Orders waiting for customer calls."
          badge={summary.workQueues.pendingConfirmation ? 'Action' : 'Clear'}
          badgeTone={summary.workQueues.pendingConfirmation ? 'warning' : 'success'}
        />
        <MetricCard
          label="Ready to pack"
          value={String(summary.workQueues.readyToPack)}
          help="Confirmed orders entering fulfillment."
          badge={summary.workQueues.readyToPack ? 'Ready' : 'Clear'}
          badgeTone={summary.workQueues.readyToPack ? 'info' : 'success'}
        />
        <MetricCard
          label="Parcels in transit"
          value={String(summary.workQueues.inDelivery)}
          help="Active parcels not yet delivered or returned."
          badge={summary.workQueues.inDelivery ? 'Live' : 'Clear'}
          badgeTone={summary.workQueues.inDelivery ? 'info' : 'success'}
        />
        <MetricCard
          label="Low stock"
          value={String(summary.workQueues.lowStockProducts)}
          help="Products at or below their stock threshold."
          badge={summary.workQueues.lowStockProducts ? 'Restock' : 'Clear'}
          badgeTone={summary.workQueues.lowStockProducts ? 'warning' : 'success'}
        />
        <MetricCard
          label="Revenue tracked"
          value={formatMoney(summary.revenue, workspace.baseCurrency, locale)}
          help="Revenue from confirmed, shipped, and delivered orders."
          badge="DB"
          badgeTone="muted"
        />
        <MetricCard
          label="Connected channels"
          value={String(connectedChannels.length)}
          help="External and local channels available to automation."
          badge={connectedChannels.length ? 'Online' : 'Manual'}
          badgeTone={connectedChannels.length ? 'success' : 'muted'}
        />
        <MetricCard
          label="Draft actions"
          value={String(pendingDrafts.length)}
          help="Automation recommendations waiting for review."
          badge={pendingDrafts.length ? 'Review' : 'Clear'}
          badgeTone={pendingDrafts.length ? 'warning' : 'success'}
        />
        <MetricCard
          label="Gross margin"
          value={formatMoney(costing.grossMargin, workspace.baseCurrency, locale)}
          help={`${Math.round(costing.grossMarginPercent * 1000) / 10}% after product cost snapshots.`}
          badge={costing.productsMissingCost ? 'Costs needed' : 'Costed'}
          badgeTone={costing.productsMissingCost ? 'warning' : 'success'}
        />
      </section>

      <section className="command-grid">
        <SurfaceCard className="command-panel">
          <SectionHeader
            title="Operations command center"
            description="Live queues from database-backed workflow records."
            actions={<StatusBadge tone="info">Realtime DB</StatusBadge>}
          />

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Work item</th>
                  <th>Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.work}>
                    <td className="strong-cell">{row.work}</td>
                    <td>{row.owner}</td>
                    <td>
                      <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader title="Quick actions" description="Move common work forward quickly." />
          <div className="quick-action-grid">
            <Link className="quick-action" href={`/${locale}/orders/new`} prefetch>
              <span>New order</span>
              <small>Create a manual order</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/orders`} prefetch>
              <span>Import CSV</span>
              <small>Add orders in bulk</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/confirmation`} prefetch>
              <span>Review calls</span>
              <small>Confirm pending orders</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/inventory`} prefetch>
              <span>Stock control</span>
              <small>Check low inventory</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/factory`} prefetch>
              <span>Factory costs</span>
              <small>Calculate margins</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/automations`} prefetch>
              <span>Automation rules</span>
              <small>Run dry-run workflows</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/activity`} prefetch>
              <span>Activity log</span>
              <small>Review imports and runs</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/help`} prefetch>
              <span>Help center</span>
              <small>Use operating guides</small>
            </Link>
            <Link className="quick-action" href={`/${locale}/settings`} prefetch>
              <span>Connect channels</span>
              <small>Manage integrations</small>
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <SectionHeader
            title="Smart suggestions"
            description="Local rule-based guidance. No paid AI API is used."
          />
          {summary.suggestions.length > 0 ? (
            <div className="priority-list">
              {summary.suggestions.map((suggestion) => (
                <div className="priority-item" key={suggestion.title}>
                  <span className="priority-dot" aria-hidden="true" />
                  <div>
                    <p className="step-title">{suggestion.title}</p>
                    <p className="step-copy">{suggestion.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="OK"
              title="No urgent priorities"
              description="Queues are healthy. New suggestions appear when local operating rules detect work that needs attention."
            />
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Alerts"
            description="Current operating risks from workflow, stock, costing, and channel status."
          />
          {alerts.length ? (
            <div className="priority-list">
              {alerts.map((alert) => (
                <Link
                  className="priority-item"
                  href={`/${locale}/${alert.href}`}
                  key={alert.title}
                  prefetch
                >
                  <span className="priority-dot" aria-hidden="true" />
                  <div>
                    <p className="step-title">{alert.title}</p>
                    <p className="step-copy">
                      <StatusBadge tone={alert.tone as 'warning' | 'danger' | 'muted'}>
                        Review
                      </StatusBadge>{' '}
                      {alert.copy}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="OK"
              title="No active alerts"
              description="Queue, inventory, costing, and provider checks are currently clear."
            />
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Performance snapshot"
            description="Operational signal from current records, without fabricated charts."
          />
          <div className="snapshot-grid">
            <div>
              <span className="metric-label">Revenue context</span>
              <strong>{formatMoney(summary.revenue, workspace.baseCurrency, locale)}</strong>
            </div>
            <div>
              <span className="metric-label">Tracked statuses</span>
              <strong>{Object.keys(summary.ordersByStatus).length}</strong>
            </div>
            <div>
              <span className="metric-label">Active queues</span>
              <strong>
                {Object.values(summary.workQueues).filter((value) => Number(value) > 0).length}
              </strong>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Automation cockpit"
            description="Provider readiness and approval-gated actions."
            actions={<StatusBadge tone="info">Dry-run first</StatusBadge>}
          />
          <div className="priority-list">
            {externalChannels.map((integration) => (
              <div className="priority-item" key={integration.provider}>
                <span className="priority-dot" aria-hidden="true" />
                <div>
                  <p className="step-title">{integration.provider.replaceAll('_', ' ')}</p>
                  <p className="step-copy">
                    <StatusBadge tone={integration.status === 'CONNECTED' ? 'success' : 'muted'}>
                      {integration.status.replaceAll('_', ' ')}
                    </StatusBadge>{' '}
                    {integration.mode.replaceAll('_', ' ').toLowerCase()}
                  </p>
                </div>
              </div>
            ))}
            {pendingDrafts.slice(0, 3).map((action) => (
              <div className="priority-item" key={action.id}>
                <span className="priority-dot" aria-hidden="true" />
                <div>
                  <p className="step-title">{action.title}</p>
                  <p className="step-copy">{action.provider.replaceAll('_', ' ')} draft action</p>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}

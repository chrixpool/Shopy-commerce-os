import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/page';
import { WorkspaceRecovery } from '@/components/ui/workspace-recovery';
import { apiFetch, apiFetchState } from '@/lib/api';
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
  comparison?: { ordersPercent: number | null; revenuePercent: number | null };
  funnel?: Record<string, number>;
  rates?: { confirmation: number | null; delivery: number | null };
  finance?: {
    grossMargin: number;
    estimatedCogs: number;
    operatingExpenses: number;
    estimatedNetContribution: number;
    costedOrders: number;
    ordersMissingCost: number;
    productsMissingCost: number;
    negativeMarginOrders: number;
  };
  dataQuality?: {
    unmatchedShopifyItems: number;
    productsMissingCost: number;
    ordersMissingCost: number;
  };
  suggestions: Array<{ title: string; copy: string }>;
}

interface IntegrationStatus {
  provider: string;
  status: string;
  mode: string;
  lastSyncAt?: string | null;
  config?: Record<string, unknown>;
  errorMessage?: string | null;
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

interface SyncRun {
  id: string;
  status: string;
  dryRun?: boolean;
  startedAt: string;
  outputSnapshot?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

interface SyncAllRun {
  id: string;
  status: string;
  summary?: string | null;
  startedAt: string;
  providers: Array<{
    provider: string;
    status: string;
    warnings: string[];
  }>;
}

async function syncAllIntegrations() {
  'use server';
  await apiFetch('/api/v1/integrations/sync-all', { method: 'POST' });
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/settings', 'page');
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

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const filters = (await searchParams) ?? {};
  const range = typeof filters.range === 'string' ? filters.range : '30d';
  const dateFrom = typeof filters.dateFrom === 'string' ? filters.dateFrom : '';
  const dateTo = typeof filters.dateTo === 'string' ? filters.dateTo : '';
  const dashboardQuery = new URLSearchParams({
    range,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });
  const t = await getTranslations();
  const [
    summaryResult,
    workspaceResult,
    integrationsResult,
    draftActionsResult,
    costingResult,
    shopifyRunsResult,
    syncAllRunsResult,
  ] = await Promise.all([
    apiFetchState<DashboardSummary>(
      `/api/v1/dashboard/summary?${dashboardQuery.toString()}`,
      EMPTY_SUMMARY,
    ),
    apiFetchState<{ baseCurrency: string }>('/api/v1/settings/organization', {
      baseCurrency: 'USD',
    }),
    apiFetchState<IntegrationStatus[]>('/api/v1/integrations', []),
    apiFetchState<DraftAction[]>('/api/v1/draft-actions', []),
    apiFetchState<CostingSummary>('/api/v1/costing/summary', {
      grossMargin: 0,
      grossMarginPercent: 0,
      productsMissingCost: 0,
    }),
    apiFetchState<SyncRun[]>('/api/v1/integrations/shopify/sync-runs', [], { timeoutMs: 3000 }),
    apiFetchState<SyncAllRun[]>('/api/v1/integrations/sync-all/runs', [], { timeoutMs: 2200 }),
  ]);
  if ([summaryResult.state, workspaceResult.state].includes('unauthorized')) {
    throw new Error('Your session is no longer valid. Sign in again.');
  }
  const summary = summaryResult.data;
  const workspace = workspaceResult.data;
  const integrations = integrationsResult.data;
  const draftActions = draftActionsResult.data;
  const costing = costingResult.data;
  const shopifyRuns = shopifyRunsResult.data;
  const latestSyncAll = syncAllRunsResult.data[0];
  const criticalUnavailable = summaryResult.state !== 'ready';
  const integrationsUnavailable = integrationsResult.state !== 'ready';
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
  const lastShopifySuccess = shopifyRuns.find((run) => run.status === 'SUCCESS' && !run.dryRun);
  const shopifyTotals = syncRunTotals(lastShopifySuccess);
  const shopifyWarnings = Array.isArray(lastShopifySuccess?.outputSnapshot?.warnings)
    ? lastShopifySuccess.outputSnapshot.warnings.map(String)
    : [];
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
    summary.finance?.ordersMissingCost
      ? {
          title: 'Order margins are incomplete',
          copy: `${summary.finance.ordersMissingCost} order(s) need cost recalculation before Finance is complete.`,
          href: 'factory',
          tone: 'warning',
        }
      : null,
    summary.finance?.negativeMarginOrders
      ? {
          title: 'Negative margin detected',
          copy: `${summary.finance.negativeMarginOrders} costed order(s) are currently below zero gross margin.`,
          href: 'finance',
          tone: 'danger',
        }
      : null,
    summary.dataQuality?.unmatchedShopifyItems
      ? {
          title: 'Shopify items need product matching',
          copy: `${summary.dataQuality.unmatchedShopifyItems} imported line item(s) are not linked to inventory.`,
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
              Review connected orders
            </Link>
          </>
        }
      />

      <WorkspaceRecovery active={criticalUnavailable} message={summaryResult.message} />

      <form className="toolbar" action={`/${locale}/dashboard`}>
        <label className="form-field compact-select">
          <span>Reporting period</span>
          <select className="field" name="range" defaultValue={range}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="form-field">
          <span>From</span>
          <input className="field" type="date" name="dateFrom" defaultValue={dateFrom} />
        </label>
        <label className="form-field">
          <span>To</span>
          <input className="field" type="date" name="dateTo" defaultValue={dateTo} />
        </label>
        <button className="button button-secondary" type="submit">
          Update view
        </button>
      </form>

      <section className="stats-grid" aria-label="Key metrics">
        <MetricCard
          label="Total orders"
          value={criticalUnavailable ? '—' : String(summary.totalOrders)}
          help="All orders in this workspace."
          badge="Live"
          badgeTone="info"
          href={`/${locale}/orders`}
        />
        <MetricCard
          label="Need confirmation"
          value={criticalUnavailable ? '—' : String(summary.workQueues.pendingConfirmation)}
          help="Orders waiting for customer calls."
          badge={summary.workQueues.pendingConfirmation ? 'Action' : 'Clear'}
          badgeTone={summary.workQueues.pendingConfirmation ? 'warning' : 'success'}
          href={`/${locale}/confirmation?status=actionable`}
        />
        <MetricCard
          label="Ready to pack"
          value={String(summary.workQueues.readyToPack)}
          help="Confirmed orders entering fulfillment."
          badge={summary.workQueues.readyToPack ? 'Ready' : 'Clear'}
          badgeTone={summary.workQueues.readyToPack ? 'info' : 'success'}
          href={`/${locale}/fulfillment`}
        />
        <MetricCard
          label="Parcels in transit"
          value={String(summary.workQueues.inDelivery)}
          help="Active parcels not yet delivered or returned."
          badge={summary.workQueues.inDelivery ? 'Live' : 'Clear'}
          badgeTone={summary.workQueues.inDelivery ? 'info' : 'success'}
          href={`/${locale}/delivery`}
        />
        <MetricCard
          label="Low stock"
          value={String(summary.workQueues.lowStockProducts)}
          help="Products at or below their stock threshold."
          badge={summary.workQueues.lowStockProducts ? 'Restock' : 'Clear'}
          badgeTone={summary.workQueues.lowStockProducts ? 'warning' : 'success'}
          href={`/${locale}/inventory`}
        />
        <MetricCard
          label="Imported order value"
          value={
            criticalUnavailable ? '—' : formatMoney(summary.revenue, workspace.baseCurrency, locale)
          }
          help="Total value across imported orders in the selected period."
          badge="DB"
          badgeTone="muted"
          href={`/${locale}/finance`}
        />
        <MetricCard
          label="Delivered"
          value={criticalUnavailable ? '—' : String(summary.ordersByStatus.DELIVERED ?? 0)}
          help="Orders completed successfully in the selected period."
          badge="Closed"
          badgeTone="success"
          href={`/${locale}/orders?status=DELIVERED`}
        />
        <MetricCard
          label="Cancelled or refused"
          value={
            criticalUnavailable
              ? '—'
              : String(
                  (summary.ordersByStatus.CANCELLED ?? 0) + (summary.ordersByStatus.REFUSED ?? 0),
                )
          }
          help="Lost orders requiring operational review."
          badge={
            (summary.ordersByStatus.CANCELLED ?? 0) + (summary.ordersByStatus.REFUSED ?? 0)
              ? 'Review'
              : 'Clear'
          }
          badgeTone={
            (summary.ordersByStatus.CANCELLED ?? 0) + (summary.ordersByStatus.REFUSED ?? 0)
              ? 'danger'
              : 'success'
          }
          href={`/${locale}/orders?status=CANCELLED`}
        />
        <MetricCard
          label="Confirmation rate"
          value={
            criticalUnavailable || summary.rates?.confirmation == null
              ? 'Unavailable'
              : `${Math.round(summary.rates.confirmation * 100)}%`
          }
          help="Confirmed decisions divided by all final confirmation decisions."
          badge="Decisions"
          badgeTone="info"
          href={`/${locale}/confirmation`}
        />
        <MetricCard
          label="Delivery success"
          value={
            criticalUnavailable || summary.rates?.delivery == null
              ? 'Unavailable'
              : `${Math.round(summary.rates.delivery * 100)}%`
          }
          help="Delivered orders divided by delivered and returned orders."
          badge="Outcome"
          badgeTone="info"
          href={`/${locale}/delivery`}
        />
        <MetricCard
          label="Connected channels"
          value={integrationsUnavailable ? '—' : String(connectedChannels.length)}
          help="External and local channels available to automation."
          badge={
            integrationsUnavailable ? 'Refreshing' : connectedChannels.length ? 'Online' : 'Manual'
          }
          badgeTone={
            integrationsUnavailable ? 'warning' : connectedChannels.length ? 'success' : 'muted'
          }
          href={`/${locale}/settings`}
        />
        <MetricCard
          label="Draft actions"
          value={draftActionsResult.state === 'ready' ? String(pendingDrafts.length) : '—'}
          help="Automation recommendations waiting for review."
          badge={pendingDrafts.length ? 'Review' : 'Clear'}
          badgeTone={pendingDrafts.length ? 'warning' : 'success'}
          href={`/${locale}/automations`}
        />
        <MetricCard
          label="Gross margin"
          value={formatMoney(costing.grossMargin, workspace.baseCurrency, locale)}
          help={`${Math.round(costing.grossMarginPercent * 1000) / 10}% after product cost snapshots.`}
          badge={costing.productsMissingCost ? 'Costs needed' : 'Costed'}
          badgeTone={costing.productsMissingCost ? 'warning' : 'success'}
          href={`/${locale}/factory`}
        />
      </section>

      <SurfaceCard>
        <SectionHeader
          title="Order funnel"
          description="A real status pipeline for the selected reporting period."
          actions={
            <StatusBadge tone={criticalUnavailable ? 'warning' : 'info'}>
              {criticalUnavailable
                ? 'Refreshing'
                : range === 'today'
                  ? 'Today'
                  : range === '7d'
                    ? '7 days'
                    : range === '30d'
                      ? '30 days'
                      : 'Custom'}
            </StatusBadge>
          }
        />
        <div className="snapshot-grid" style={{ marginTop: 16 }}>
          {Object.entries(summary.funnel ?? {}).map(([stage, count]) => (
            <div key={stage}>
              <span className="metric-label">{stage.replaceAll('_', ' ')}</span>
              <strong>{criticalUnavailable ? '—' : count}</strong>
            </div>
          ))}
        </div>
      </SurfaceCard>

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
            title="Integration health"
            description="Independent read-only sync status across connected commerce channels."
            actions={
              <form action={syncAllIntegrations}>
                <button className="button button-primary" type="submit">
                  Sync all
                </button>
              </form>
            }
          />
          <div className="snapshot-grid" style={{ marginTop: 16 }}>
            {[shopify, meta].map((integration) => (
              <div key={integration?.provider ?? 'provider'}>
                <span className="metric-label">
                  {integration?.provider?.replaceAll('_', ' ') ?? 'Provider'}
                </span>
                <strong>{integration?.status ?? 'DISCONNECTED'}</strong>
                <small>
                  {integration?.lastSyncAt
                    ? `Last sync ${new Date(integration.lastSyncAt).toLocaleString(locale)}`
                    : 'Not synced yet'}
                </small>
              </div>
            ))}
          </div>
          {latestSyncAll ? (
            <div className="status-banner" style={{ marginTop: 14 }}>
              <div>
                <strong>{latestSyncAll.summary ?? `Sync ${latestSyncAll.status}`}</strong>
                <p>
                  {latestSyncAll.providers
                    .map(
                      (provider) => `${provider.provider.replaceAll('_', ' ')}: ${provider.status}`,
                    )
                    .join(' · ')}
                </p>
              </div>
              <StatusBadge
                tone={
                  latestSyncAll.status === 'success'
                    ? 'success'
                    : latestSyncAll.status === 'partial'
                      ? 'warning'
                      : 'info'
                }
              >
                {latestSyncAll.status}
              </StatusBadge>
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Shopify trust status"
            description="Latest read-only import signal from the connected store."
            actions={
              <StatusBadge
                tone={
                  !integrationsUnavailable && shopify?.status === 'CONNECTED'
                    ? 'success'
                    : 'warning'
                }
              >
                {integrationsUnavailable ? 'REFRESHING' : (shopify?.status ?? 'DISCONNECTED')}
              </StatusBadge>
            }
          />
          <div className="snapshot-grid" style={{ marginTop: 16 }}>
            <div>
              <span className="metric-label">Connected shop</span>
              <strong>
                {String(
                  ((shopify?.config?.shop as Record<string, unknown> | undefined)?.name ??
                    integrationsUnavailable)
                    ? 'Temporarily unavailable'
                    : 'Not connected',
                )}
              </strong>
            </div>
            <div>
              <span className="metric-label">Imported orders</span>
              <strong>
                {shopifyRunsResult.state === 'ready'
                  ? String(shopifyTotals?.orders ?? 'Pending')
                  : 'Refreshing'}
              </strong>
            </div>
            <div>
              <span className="metric-label">Warnings</span>
              <strong>{shopifyRunsResult.state === 'ready' ? shopifyWarnings.length : '—'}</strong>
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

function syncRunTotals(run?: SyncRun) {
  const output = run?.outputSnapshot;
  if (!output) return null;
  const totals = output.totals;
  if (totals && typeof totals === 'object') return totals as Record<string, unknown>;
  return ['products', 'customers', 'orders'].reduce<Record<string, unknown>>((acc, key) => {
    const value = output[key];
    if (typeof value === 'number') acc[key] = value;
    if (value && typeof value === 'object' && 'found' in value) {
      acc[key] = (value as { found?: unknown }).found ?? 0;
    }
    return acc;
  }, {});
}

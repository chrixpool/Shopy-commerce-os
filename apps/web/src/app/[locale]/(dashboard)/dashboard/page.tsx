import { getTranslations } from 'next-intl/server';
import { MetricCard, PageHeader, SetupSteps } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

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

function formatMoney(value: number) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'MAD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DashboardPage() {
  const t = await getTranslations();
  const summary = await apiFetch<DashboardSummary>('/api/v1/dashboard/summary');
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
            <a className="button button-primary" href="./orders">
              Add or import orders
            </a>
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
          value={formatMoney(summary.revenue)}
          help="Revenue from confirmed, shipped, and delivered orders."
          badge="DB"
          badgeTone="muted"
        />
      </section>

      <section className="panel-grid">
        <div className="card card-padded">
          <div className="page-header">
            <div>
              <h2 className="section-title">Today&apos;s work queue</h2>
              <p className="section-description">
                Live queues based on orders and task records in the database.
              </p>
            </div>
          </div>

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
                      <span className={`badge badge-${row.tone}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card card-padded">
          <h2 className="section-title">Smart suggestions</h2>
          <p className="section-description">Local rule-based guidance. No paid AI API is used.</p>
          <div style={{ marginTop: 18 }}>
            <SetupSteps
              steps={
                summary.suggestions.length > 0
                  ? summary.suggestions
                  : [
                      {
                        title: 'Queues are clear',
                        copy: 'No urgent local-rule suggestions right now.',
                      },
                    ]
              }
            />
          </div>
        </aside>
      </section>
    </div>
  );
}

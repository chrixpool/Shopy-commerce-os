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
  ordersByStatus: Record<string, number>;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  totalAmount: string | number;
  createdAt: string;
}

interface OrdersResponse {
  data: OrderRecord[];
  total: number;
}

interface CostingSummary {
  estimatedCogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  expenses: number;
  snapshots: number;
  productsMissingCost: number;
  totalProducts?: number;
  costedProducts?: number;
}

function amount(value: string | number) {
  return typeof value === 'number' ? value : Number(value);
}

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function FinancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [summary, orders, workspace, costing] = await Promise.all([
    apiFetch<DashboardSummary>('/api/v1/dashboard/summary'),
    apiFetch<OrdersResponse>('/api/v1/orders?limit=100'),
    getWorkspaceSettings(),
    optionalApiFetch<CostingSummary>('/api/v1/costing/summary', {
      estimatedCogs: 0,
      grossMargin: 0,
      grossMarginPercent: 0,
      expenses: 0,
      snapshots: 0,
      productsMissingCost: 0,
      totalProducts: 0,
      costedProducts: 0,
    }),
  ]);

  const delivered = orders.data.filter((order) => order.status === 'DELIVERED');
  const returned = orders.data.filter((order) => ['RETURNED', 'REFUSED'].includes(order.status));
  const cancelled = orders.data.filter((order) => order.status === 'CANCELLED');
  const active = orders.data.filter((order) =>
    ['PENDING', 'CONFIRMED', 'SHIPPED'].includes(order.status),
  );
  const returnedValue = returned.reduce((total, order) => total + amount(order.totalAmount), 0);
  const cancelledValue = cancelled.reduce((total, order) => total + amount(order.totalAmount), 0);
  const activeValue = active.reduce((total, order) => total + amount(order.totalAmount), 0);
  const averageOrderValue = summary.totalOrders > 0 ? summary.revenue / summary.totalOrders : 0;
  const completeness =
    Number(costing.totalProducts ?? 0) > 0
      ? Math.round((Number(costing.costedProducts ?? 0) / Number(costing.totalProducts)) * 100)
      : 0;
  const recentFinancialOrders = orders.data.slice(0, 8);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Reporting"
        title="Finance"
        description="Track revenue, active order value, returns, cancellations, and recent financial movement from live order records."
        actions={
          <Link className="button button-primary" href={`/${locale}/orders`} prefetch>
            Review orders
          </Link>
        }
      />

      <section className="stats-grid" aria-label="Finance metrics">
        <MetricCard
          label="Recognized revenue"
          value={formatMoney(summary.revenue, workspace.baseCurrency, locale)}
          help="Confirmed, shipped, and delivered revenue tracked in the workspace."
          badge="DB"
          badgeTone="info"
        />
        <MetricCard
          label="Average order value"
          value={formatMoney(averageOrderValue, workspace.baseCurrency, locale)}
          help="Revenue divided by total orders."
          badge="AOV"
          badgeTone="muted"
        />
        <MetricCard
          label="Active order value"
          value={formatMoney(activeValue, workspace.baseCurrency, locale)}
          help="Pending, confirmed, and shipped orders still in motion."
          badge="Open"
          badgeTone="warning"
        />
        <MetricCard
          label="Estimated COGS"
          value={formatMoney(costing.estimatedCogs, workspace.baseCurrency, locale)}
          help={`${costing.snapshots} order margin snapshot(s) calculated.`}
          badge="Costing"
          badgeTone="info"
        />
        <MetricCard
          label="Cost completeness"
          value={`${completeness}%`}
          help={`${costing.productsMissingCost} product(s) still missing unit costs.`}
          badge={costing.productsMissingCost ? 'Action' : 'Ready'}
          badgeTone={costing.productsMissingCost ? 'warning' : 'success'}
        />
        <MetricCard
          label="Gross margin"
          value={formatMoney(costing.grossMargin, workspace.baseCurrency, locale)}
          help={`${Math.round(costing.grossMarginPercent * 1000) / 10}% estimated gross margin.`}
          badge={costing.grossMargin >= 0 ? 'Positive' : 'Review'}
          badgeTone={costing.grossMargin >= 0 ? 'success' : 'warning'}
        />
        <MetricCard
          label="Return exposure"
          value={formatMoney(returnedValue, workspace.baseCurrency, locale)}
          help="Returned and refused order value."
          badge={returned.length ? 'Review' : 'Clear'}
          badgeTone={returned.length ? 'warning' : 'success'}
        />
        <MetricCard
          label="Cancelled value"
          value={formatMoney(cancelledValue, workspace.baseCurrency, locale)}
          help="Cancelled orders excluded from recognized revenue."
          badge={cancelled.length ? 'Lost' : 'Clear'}
          badgeTone={cancelled.length ? 'danger' : 'success'}
        />
        <MetricCard
          label="Delivered orders"
          value={String(delivered.length)}
          help="Orders completed successfully."
          badge="Closed"
          badgeTone="success"
        />
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <SectionHeader
            title="Revenue by status"
            description="A compact operating view of where value sits right now."
          />
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.ordersByStatus).map(([status, count]) => (
                  <tr key={status}>
                    <td className="strong-cell">{status.replaceAll('_', ' ')}</td>
                    <td>{count}</td>
                    <td>
                      <StatusBadge
                        tone={
                          ['RETURNED', 'REFUSED', 'CANCELLED'].includes(status)
                            ? 'warning'
                            : status === 'DELIVERED'
                              ? 'success'
                              : 'info'
                        }
                      >
                        {status === 'DELIVERED'
                          ? 'closed'
                          : ['RETURNED', 'REFUSED', 'CANCELLED'].includes(status)
                            ? 'risk'
                            : 'active'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Recent financial activity"
            description="Latest orders affecting revenue and cash collection work."
          />
          {recentFinancialOrders.length ? (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFinancialOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="strong-cell">{order.orderNumber}</td>
                      <td>{order.customerName}</td>
                      <td>
                        <StatusBadge
                          tone={
                            ['RETURNED', 'REFUSED', 'CANCELLED'].includes(order.status)
                              ? 'warning'
                              : order.status === 'DELIVERED'
                                ? 'success'
                                : 'info'
                          }
                        >
                          {order.status.replaceAll('_', ' ')}
                        </StatusBadge>
                      </td>
                      <td>
                        {formatMoney(amount(order.totalAmount), workspace.baseCurrency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="FN"
              title="No financial activity yet"
              description="Create or import orders to activate finance reporting."
              action={
                <Link className="button button-primary" href={`/${locale}/orders/new`} prefetch>
                  New order
                </Link>
              }
            />
          )}
        </SurfaceCard>
      </section>
    </div>
  );
}

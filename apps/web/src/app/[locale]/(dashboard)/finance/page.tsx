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

interface OrdersSummary {
  totalOrders: number;
  totalRevenue: number;
  statusCounts: Record<string, number>;
  valueByStatus: Record<string, number>;
  sourceCounts: Record<string, number>;
  missingCostCount: number;
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
  estimatedNetContribution?: number;
  ordersMissingCost?: number;
  unmatchedShopifyItems?: number;
  negativeMarginOrders?: number;
  staleCostRecords?: number;
  sourceProfitability?: Array<{ source: string; revenue: number; cost: number; margin: number }>;
  mostProfitableProducts?: Array<{
    productId: string;
    name: string;
    sku?: string | null;
    revenue: number;
    cost: number;
    margin: number;
  }>;
  leastProfitableProducts?: Array<{
    productId: string;
    name: string;
    sku?: string | null;
    revenue: number;
    cost: number;
    margin: number;
  }>;
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

export default async function FinancePage({
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
  const period = financePeriod(range, dateFrom, dateTo);
  const dashboardQuery = new URLSearchParams({
    range,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  });
  const dataQuery = new URLSearchParams({ dateFrom: period.dateFrom, dateTo: period.dateTo });
  const [summary, orderSummary, orders, workspace, costing] = await Promise.all([
    apiFetch<DashboardSummary>(`/api/v1/dashboard/summary?${dashboardQuery.toString()}`),
    apiFetch<OrdersSummary>(`/api/v1/orders/summary?${dataQuery.toString()}`),
    apiFetch<OrdersResponse>(`/api/v1/orders?limit=8&${dataQuery.toString()}`),
    getWorkspaceSettings(),
    optionalApiFetch<CostingSummary>(`/api/v1/costing/summary?${dataQuery.toString()}`, {
      estimatedCogs: 0,
      grossMargin: 0,
      grossMarginPercent: 0,
      expenses: 0,
      snapshots: 0,
      productsMissingCost: 0,
      totalProducts: 0,
      costedProducts: 0,
      estimatedNetContribution: 0,
      ordersMissingCost: 0,
      unmatchedShopifyItems: 0,
      negativeMarginOrders: 0,
      staleCostRecords: 0,
      sourceProfitability: [],
      mostProfitableProducts: [],
      leastProfitableProducts: [],
    }),
  ]);

  const deliveredCount = orderSummary.statusCounts.DELIVERED ?? 0;
  const returnedCount =
    (orderSummary.statusCounts.RETURNED ?? 0) + (orderSummary.statusCounts.REFUSED ?? 0);
  const cancelledCount = orderSummary.statusCounts.CANCELLED ?? 0;
  const returnedValue =
    (orderSummary.valueByStatus.RETURNED ?? 0) + (orderSummary.valueByStatus.REFUSED ?? 0);
  const cancelledValue = orderSummary.valueByStatus.CANCELLED ?? 0;
  const activeValue = ['PENDING', 'CONFIRMED', 'SHIPPED'].reduce(
    (total, status) => total + (orderSummary.valueByStatus[status] ?? 0),
    0,
  );
  const recognizedOrders = ['CONFIRMED', 'SHIPPED', 'DELIVERED'].reduce(
    (total, status) => total + (orderSummary.statusCounts[status] ?? 0),
    0,
  );
  const averageOrderValue = recognizedOrders > 0 ? summary.revenue / recognizedOrders : 0;
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
          <Link className="button button-primary" href={`/${locale}/orders`} prefetch={false}>
            Review orders
          </Link>
        }
      />

      <form className="toolbar" action={`/${locale}/finance`}>
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
          label="Net contribution"
          value={
            costing.snapshots > 0
              ? formatMoney(costing.estimatedNetContribution ?? 0, workspace.baseCurrency, locale)
              : 'Unavailable'
          }
          help="Known gross margin less recorded operating expenses. Incomplete costs are excluded."
          badge={costing.ordersMissingCost ? 'Incomplete' : 'Known'}
          badgeTone={costing.ordersMissingCost ? 'warning' : 'success'}
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
          badge={returnedCount ? 'Review' : 'Clear'}
          badgeTone={returnedCount ? 'warning' : 'success'}
        />
        <MetricCard
          label="Cancelled value"
          value={formatMoney(cancelledValue, workspace.baseCurrency, locale)}
          help="Cancelled orders excluded from recognized revenue."
          badge={cancelledCount ? 'Lost' : 'Clear'}
          badgeTone={cancelledCount ? 'danger' : 'success'}
        />
        <MetricCard
          label="Delivered orders"
          value={String(deliveredCount)}
          help="Orders completed successfully."
          badge="Closed"
          badgeTone="success"
        />
      </section>

      {(costing.ordersMissingCost ||
        costing.unmatchedShopifyItems ||
        costing.negativeMarginOrders) && (
        <SurfaceCard>
          <SectionHeader
            title="Financial data quality"
            description="Resolve these items before treating margin as complete. Missing costs are never assumed to be zero."
            actions={
              <Link className="button button-primary" href={`/${locale}/factory`} prefetch={false}>
                Complete costs
              </Link>
            }
          />
          <div className="snapshot-grid" style={{ marginTop: 16 }}>
            <div>
              <span className="metric-label">Orders missing cost</span>
              <strong>{costing.ordersMissingCost ?? 0}</strong>
            </div>
            <div>
              <span className="metric-label">Unmatched Shopify items</span>
              <strong>{costing.unmatchedShopifyItems ?? 0}</strong>
            </div>
            <div>
              <span className="metric-label">Negative-margin orders</span>
              <strong>{costing.negativeMarginOrders ?? 0}</strong>
            </div>
          </div>
        </SurfaceCard>
      )}

      <section className="panel-grid">
        <SurfaceCard>
          <SectionHeader
            title="Product profitability"
            description="Known revenue and cost for products with completed cost records."
          />
          {(costing.mostProfitableProducts ?? []).length ? (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Revenue</th>
                    <th>Cost</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {(costing.mostProfitableProducts ?? []).map((product) => (
                    <tr key={product.productId}>
                      <td className="strong-cell">
                        {product.name}
                        <div className="field-help">{product.sku ?? 'No SKU'}</div>
                      </td>
                      <td>{formatMoney(product.revenue, workspace.baseCurrency, locale)}</td>
                      <td>{formatMoney(product.cost, workspace.baseCurrency, locale)}</td>
                      <td>
                        <StatusBadge tone={product.margin >= 0 ? 'success' : 'danger'}>
                          {formatMoney(product.margin, workspace.baseCurrency, locale)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="CT"
              title="Profitability is not complete"
              description="Add product costs and recalculate affected orders to rank product margin."
            />
          )}
        </SurfaceCard>

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
              description="Sync Shopify orders to activate finance reporting."
            />
          )}
        </SurfaceCard>
      </section>
    </div>
  );
}

function financePeriod(range: string, customFrom: string, customTo: string) {
  const end = customTo ? new Date(`${customTo}T23:59:59.999`) : new Date();
  let start: Date;
  if (range === 'custom' && customFrom) start = new Date(`${customFrom}T00:00:00.000`);
  else if (range === 'today') {
    start = new Date();
    start.setHours(0, 0, 0, 0);
  } else start = new Date(end.getTime() - (range === '7d' ? 7 : 30) * 86400000);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
}

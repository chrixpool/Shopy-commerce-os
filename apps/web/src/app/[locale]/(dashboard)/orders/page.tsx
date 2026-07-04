import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  total: string | number;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  totalAmount: string | number;
  createdAt: string;
  customer?: {
    city?: string | null;
  } | null;
  items: OrderItem[];
}

interface OrdersResponse {
  data: OrderRecord[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
  'REFUSED',
];

async function updateStatus(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');

  await apiFetch(`/api/v1/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

async function importCsv(formData: FormData) {
  'use server';

  const csv = String(formData.get('csv') ?? '');

  await apiFetch('/api/v1/orders/import-csv', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });

  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  const t = await getTranslations('orders');
  const query = new URLSearchParams({
    page: filters.page ?? '1',
    limit: '25',
  });
  if (filters.search) query.set('search', filters.search);
  if (filters.status && filters.status !== 'all') query.set('status', filters.status);

  const [orders, workspace] = await Promise.all([
    apiFetch<OrdersResponse>(`/api/v1/orders?${query.toString()}`),
    getWorkspaceSettings(),
  ]);
  const counts = orders.data.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Sales operations"
        title={t('title')}
        description="Track every order from the moment it arrives until it is confirmed, packed, shipped, and delivered."
        actions={
          <>
            <Link className="button button-primary" href={`/${locale}/orders/new`}>
              {t('new')}
            </Link>
          </>
        }
      />

      <section className="stats-grid" aria-label="Order status summary">
        <MetricCard
          label="Pending"
          value={String(counts.PENDING ?? 0)}
          help="New orders awaiting first action."
          badge={(counts.PENDING ?? 0) > 0 ? 'Action' : 'Clear'}
          badgeTone={(counts.PENDING ?? 0) > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Confirmed"
          value={String(counts.CONFIRMED ?? 0)}
          help="Orders approved by customers."
          badge="Ready"
          badgeTone="info"
        />
        <MetricCard
          label="Shipped"
          value={String(counts.SHIPPED ?? 0)}
          help="Orders handed to delivery partners."
          badge="Transit"
          badgeTone="muted"
        />
        <MetricCard
          label="Returned"
          value={String(counts.RETURNED ?? 0)}
          help="Returned orders needing review."
          badge={(counts.RETURNED ?? 0) > 0 ? 'Review' : 'None'}
          badgeTone={(counts.RETURNED ?? 0) > 0 ? 'warning' : 'success'}
        />
      </section>

      <form className="toolbar" aria-label="Order filters">
        <div className="toolbar-group">
          <input
            className="field"
            aria-label="Search orders"
            name="search"
            defaultValue={filters.search ?? ''}
            placeholder="Search by customer, phone, or order number"
          />
          <select
            className="select-field"
            aria-label="Filter by status"
            name="status"
            defaultValue={filters.status ?? 'all'}
          >
            <option value="all">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <button className="button button-secondary" type="submit">
          Apply
        </button>
      </form>

      <form action={importCsv} className="card card-padded form-grid">
        <label className="form-field" style={{ gridColumn: '1 / -1' }}>
          <span>CSV import</span>
          <textarea
            className="field textarea-field"
            name="csv"
            placeholder={`customer,phone,city,address,sku,product,quantity,price,currency (${workspace.baseCurrency})`}
            rows={4}
            required
          />
        </label>
        <div className="form-actions">
          <button className="button button-secondary" type="submit">
            Import CSV
          </button>
        </div>
      </form>

      {orders.data.length === 0 ? (
        <EmptyState
          icon="OR"
          title="No orders yet"
          description="Orders will appear here after you create an order manually or import records. The table will show customer, phone, city, status, and next action."
          action={
            <Link className="button button-primary" href={`/${locale}/orders/new`}>
              Create order
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>City</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Update</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id}>
                  <td className="strong-cell">{order.orderNumber}</td>
                  <td>
                    <div className="strong-cell">{order.customerName}</div>
                    <div>{order.customerPhone}</div>
                  </td>
                  <td>{order.customer?.city ?? '-'}</td>
                  <td>{order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}</td>
                  <td>{formatMoney(order.totalAmount, workspace.baseCurrency, locale)}</td>
                  <td>
                    <span className="badge badge-muted">{order.status}</span>
                  </td>
                  <td>
                    <form action={updateStatus} className="inline-form">
                      <input name="id" type="hidden" value={order.id} />
                      <select
                        className="select-field"
                        name="status"
                        defaultValue={order.status}
                        aria-label={`Update ${order.orderNumber} status`}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <button className="button button-secondary" type="submit">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

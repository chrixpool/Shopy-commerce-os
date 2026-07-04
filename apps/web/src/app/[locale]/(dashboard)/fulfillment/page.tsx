import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface FulfillmentTask {
  id: string;
  status: string;
  packedAt?: string | null;
  order: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    status: string;
    totalAmount: string | number;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      product?: {
        sku?: string | null;
        stock: number;
      } | null;
    }>;
  };
}

async function updateFulfillment(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');

  await apiFetch(`/api/v1/fulfillment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  revalidatePath('/[locale]/fulfillment', 'page');
  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/inventory', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/orders', 'page');
}

export default async function FulfillmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [tasks, workspace] = await Promise.all([
    apiFetch<FulfillmentTask[]>('/api/v1/fulfillment'),
    getWorkspaceSettings(),
  ]);
  const toPack = tasks.filter((task) => task.status === 'TO_PACK').length;
  const packing = tasks.filter((task) => task.status === 'PACKING').length;
  const packed = tasks.filter((task) => task.status === 'PACKED').length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Warehouse"
        title="Fulfillment"
        description="Prepare confirmed orders, track packing progress, and move packed orders into delivery."
      />

      <section className="stats-grid" aria-label="Fulfillment summary">
        <MetricCard
          label="To pack"
          value={String(toPack)}
          help="Confirmed orders ready for warehouse work."
          badge={toPack ? 'Ready' : 'Clear'}
          badgeTone={toPack ? 'info' : 'success'}
        />
        <MetricCard
          label="Packing"
          value={String(packing)}
          help="Orders currently being prepared."
          badge={packing ? 'Active' : 'None'}
          badgeTone={packing ? 'warning' : 'success'}
        />
        <MetricCard
          label="Packed"
          value={String(packed)}
          help="Orders packed and moved toward delivery."
          badge="Done"
          badgeTone="muted"
        />
        <MetricCard
          label="Total tasks"
          value={String(tasks.length)}
          help="All fulfillment records in this workspace."
          badge="DB"
          badgeTone="muted"
        />
      </section>

      {tasks.length === 0 ? (
        <EmptyState
          icon="PK"
          title="No fulfillment tasks"
          description="Confirmed orders appear here automatically."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Value</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="strong-cell">{task.order.orderNumber}</td>
                  <td>
                    <div className="strong-cell">{task.order.customerName}</div>
                    <div>{task.order.customerPhone}</div>
                  </td>
                  <td>
                    {task.order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}
                  </td>
                  <td>{formatMoney(task.order.totalAmount, workspace.baseCurrency, locale)}</td>
                  <td>
                    {task.order.items.map((item) => (
                      <div key={item.id}>
                        {item.product?.sku ?? item.name}: {item.product?.stock ?? 'n/a'}
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className="badge badge-muted">{task.status}</span>
                  </td>
                  <td>
                    <form action={updateFulfillment} className="inline-form">
                      <input name="id" type="hidden" value={task.id} />
                      <button
                        className="button button-secondary"
                        name="status"
                        value="PACKING"
                        type="submit"
                      >
                        Start packing
                      </button>
                      <button
                        className="button button-primary"
                        name="status"
                        value="PACKED"
                        type="submit"
                      >
                        Mark packed
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

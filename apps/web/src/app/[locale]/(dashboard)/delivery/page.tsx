import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface ParcelRecord {
  id: string;
  trackingNumber?: string | null;
  provider: string;
  status: string;
  codCollected: boolean;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    status: string;
    totalAmount: string | number;
    customer?: {
      city?: string | null;
      address?: string | null;
    } | null;
  };
  events: Array<{
    id: string;
    status: string;
    note?: string | null;
    timestamp: string;
  }>;
}

async function updateDelivery(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');

  await apiFetch(`/api/v1/delivery/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/activity', 'page');
  revalidatePath('/[locale]/finance', 'page');
}

export default async function DeliveryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [parcels, workspace] = await Promise.all([
    apiFetch<ParcelRecord[]>('/api/v1/delivery'),
    getWorkspaceSettings(),
  ]);
  const inTransit = parcels.filter((parcel) =>
    ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(parcel.status),
  ).length;
  const delivered = parcels.filter((parcel) => parcel.status === 'DELIVERED').length;
  const returned = parcels.filter((parcel) => parcel.status === 'RETURNED').length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Shipping"
        title="Delivery"
        description="Dispatch parcels, track delivery attempts, and close delivered or returned orders."
      />

      <section className="stats-grid" aria-label="Delivery summary">
        <MetricCard
          label="In transit"
          value={String(inTransit)}
          help="Parcels moving through delivery."
          badge={inTransit ? 'Live' : 'Clear'}
          badgeTone={inTransit ? 'info' : 'success'}
        />
        <MetricCard
          label="Delivered"
          value={String(delivered)}
          help="Completed deliveries with collected COD."
          badge="Done"
          badgeTone="success"
        />
        <MetricCard
          label="Returned"
          value={String(returned)}
          help="Returned parcels needing review."
          badge={returned ? 'Review' : 'None'}
          badgeTone={returned ? 'warning' : 'success'}
        />
        <MetricCard
          label="Total parcels"
          value={String(parcels.length)}
          help="All parcel records in this workspace."
          badge="DB"
          badgeTone="muted"
        />
      </section>

      {parcels.length === 0 ? (
        <EmptyState
          icon="DL"
          title="No parcels"
          description="Packed orders create parcel records automatically."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parcel</th>
                <th>Customer</th>
                <th>City</th>
                <th>Value</th>
                <th>Status</th>
                <th>Latest event</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((parcel) => (
                <tr key={parcel.id}>
                  <td>
                    <div className="strong-cell">
                      <Link href={`/${locale}/orders/${parcel.order.id}`}>
                        {parcel.trackingNumber ?? parcel.order.orderNumber}
                      </Link>
                    </div>
                    <div>{parcel.provider}</div>
                  </td>
                  <td>
                    <div className="strong-cell">{parcel.order.customerName}</div>
                    <div>{parcel.order.customerPhone}</div>
                  </td>
                  <td>{parcel.order.customer?.city ?? '-'}</td>
                  <td>{formatMoney(parcel.order.totalAmount, workspace.baseCurrency, locale)}</td>
                  <td>
                    <span className="badge badge-muted">{parcel.status}</span>
                  </td>
                  <td>{parcel.events[0]?.note ?? parcel.events[0]?.status ?? '-'}</td>
                  <td>
                    <form action={updateDelivery} className="inline-form">
                      <input name="id" type="hidden" value={parcel.id} />
                      <button
                        className="button button-secondary"
                        name="status"
                        value="PICKED_UP"
                        type="submit"
                      >
                        Dispatch
                      </button>
                      <button
                        className="button button-secondary"
                        name="status"
                        value="FAILED_ATTEMPT"
                        type="submit"
                      >
                        Failed
                      </button>
                      <button
                        className="button button-secondary"
                        name="status"
                        value="RETURNED"
                        type="submit"
                      >
                        Return
                      </button>
                      <button
                        className="button button-primary"
                        name="status"
                        value="DELIVERED"
                        type="submit"
                      >
                        Delivered
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

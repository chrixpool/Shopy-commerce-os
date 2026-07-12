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

interface ProviderParcel {
  id: string;
  barcode: string;
  orderId?: string | null;
  providerStatus: string;
  normalizedStatus: string;
  matchState: string;
  matchConfidence: number;
  matchReasons: string[];
  details?: Record<string, unknown>;
  lastProviderUpdateAt?: string | null;
  lastSyncedAt?: string | null;
  events?: Array<{
    id: string;
    providerStatus: string;
    normalizedStatus: string;
    occurredAt: string;
  }>;
}

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
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

async function lookupMesColis(formData: FormData) {
  'use server';
  await apiFetch('/api/v1/integrations/mes-colis/lookup', {
    method: 'POST',
    body: JSON.stringify({
      barcode: String(formData.get('barcode') ?? ''),
      orderReference: String(formData.get('orderReference') ?? ''),
    }),
  });
  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/activity', 'page');
}

async function refreshMesColis() {
  'use server';
  await apiFetch('/api/v1/integrations/mes-colis/sync-linked', { method: 'POST' });
  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/activity', 'page');
}

async function linkMesColis(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  await apiFetch(`/api/v1/integrations/mes-colis/parcels/${id}/link`, {
    method: 'POST',
    body: JSON.stringify({ orderId: String(formData.get('orderId') ?? '') }),
  });
  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/activity', 'page');
}

async function unlinkMesColis(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  await apiFetch(`/api/v1/integrations/mes-colis/parcels/${id}/link`, { method: 'DELETE' });
  revalidatePath('/[locale]/delivery', 'page');
}

export default async function DeliveryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [parcels, workspace, providerParcels, mappingReview] = await Promise.all([
    apiFetch<ParcelRecord[]>('/api/v1/delivery'),
    getWorkspaceSettings(),
    optionalApiFetch<ProviderParcel[]>('/api/v1/integrations/mes-colis/parcels', []),
    optionalApiFetch<ProviderParcel[]>('/api/v1/integrations/mes-colis/mapping-review', []),
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

      <section className="card card-padded">
        <div className="section-header">
          <div>
            <h2 className="section-title">Mes Colis tracking</h2>
            <p className="section-description">
              Link and refresh existing barcodes in read-only mode. Shopy never creates or changes
              Mes Colis parcels.
            </p>
          </div>
          <form action={refreshMesColis}>
            <button className="button button-secondary" type="submit">
              Refresh all
            </button>
          </form>
        </div>
        <form action={lookupMesColis} className="inline-form" style={{ marginTop: 14 }}>
          <input className="field" name="barcode" placeholder="Mes Colis barcode" required />
          <input
            className="field"
            name="orderReference"
            placeholder="Optional exact order reference"
          />
          <button className="button button-primary" type="submit">
            Link barcode
          </button>
        </form>
        <div className="snapshot-grid" style={{ marginTop: 14 }}>
          <div>
            <span className="metric-label">Tracked barcodes</span>
            <strong>{providerParcels.length}</strong>
          </div>
          <div>
            <span className="metric-label">Mapping review</span>
            <strong>{mappingReview.length}</strong>
          </div>
          <div>
            <span className="metric-label">Exceptions</span>
            <strong>
              {
                providerParcels.filter((item) =>
                  ['EXCEPTION', 'NEEDS_REVIEW'].includes(item.normalizedStatus),
                ).length
              }
            </strong>
          </div>
        </div>
      </section>

      {mappingReview.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Barcode</th>
                <th>Provider status</th>
                <th>Match</th>
                <th>Confidence</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {mappingReview.map((item) => (
                <tr key={item.id}>
                  <td>{item.barcode}</td>
                  <td>{item.providerStatus}</td>
                  <td>
                    <span className="badge badge-muted">
                      {item.matchState.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>{item.matchConfidence}%</td>
                  <td>
                    <form action={linkMesColis} className="inline-form">
                      <input name="id" type="hidden" value={item.id} />
                      <input
                        className="field"
                        name="orderId"
                        placeholder="Exact Shopy order ID"
                        required
                      />
                      <button className="button button-secondary" type="submit">
                        Link
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {providerParcels.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Provider / barcode</th>
                <th>Provider status</th>
                <th>Normalized</th>
                <th>Match</th>
                <th>Last update</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {providerParcels.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>Mes Colis</strong>
                    <div>{item.barcode}</div>
                  </td>
                  <td>{item.providerStatus}</td>
                  <td>
                    <span className="badge badge-muted">
                      {item.normalizedStatus.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>{item.matchState.replaceAll('_', ' ')}</td>
                  <td>
                    {item.lastProviderUpdateAt
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.lastProviderUpdateAt))
                      : 'Unknown'}
                  </td>
                  <td>
                    {item.orderId ? (
                      <div className="button-row">
                        <Link
                          className="button button-secondary"
                          href={`/${locale}/orders/${item.orderId}`}
                        >
                          Order
                        </Link>
                        <form action={unlinkMesColis}>
                          <input name="id" type="hidden" value={item.id} />
                          <button className="button button-secondary" type="submit">
                            Unlink
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="muted">Review mapping</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

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

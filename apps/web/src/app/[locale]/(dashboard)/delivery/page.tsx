import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { EmptyState, MetricCard, PageHeader, StatusBadge } from '@/components/ui/page';
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

interface MesColisStatus {
  status: string;
  isActive: boolean;
  credentialSaved: boolean;
  socketHealth: string;
  lastSocketEventAt?: string | null;
  lastSyncAt?: string | null;
  warningCount: number;
}

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

async function lookupMesColis(formData: FormData) {
  'use server';
  const locale = String(formData.get('locale') ?? 'en');
  try {
    await apiFetch('/api/v1/integrations/mes-colis/lookup', {
      method: 'POST',
      body: JSON.stringify({
        barcode: String(formData.get('barcode') ?? ''),
        orderReference: String(formData.get('orderReference') ?? ''),
      }),
    });
    revalidateDelivery();
  } catch (error) {
    redirect(deliveryResultUrl(locale, 'error', actionMessage(error)));
  }
  redirect(deliveryResultUrl(locale, 'success', 'Barcode refreshed and saved.'));
}

async function refreshMesColis(formData: FormData) {
  'use server';
  const locale = String(formData.get('locale') ?? 'en');
  try {
    await apiFetch('/api/v1/integrations/mes-colis/sync-linked', { method: 'POST' });
    revalidateDelivery();
  } catch (error) {
    redirect(deliveryResultUrl(locale, 'error', actionMessage(error)));
  }
  redirect(deliveryResultUrl(locale, 'success', 'Linked barcodes refreshed.'));
}

async function refreshOneMesColis(formData: FormData) {
  'use server';
  const locale = String(formData.get('locale') ?? 'en');
  const id = String(formData.get('id') ?? '');
  try {
    await apiFetch(`/api/v1/integrations/mes-colis/parcels/${id}/refresh`, { method: 'POST' });
    revalidateDelivery();
  } catch (error) {
    redirect(deliveryResultUrl(locale, 'error', actionMessage(error)));
  }
  redirect(deliveryResultUrl(locale, 'success', 'Tracking refreshed.'));
}

async function linkMesColis(formData: FormData) {
  'use server';
  const locale = String(formData.get('locale') ?? 'en');
  const id = String(formData.get('id') ?? '');
  try {
    await apiFetch(`/api/v1/integrations/mes-colis/parcels/${id}/link`, {
      method: 'POST',
      body: JSON.stringify({ orderReference: String(formData.get('orderReference') ?? '') }),
    });
    revalidateDelivery();
  } catch (error) {
    redirect(deliveryResultUrl(locale, 'error', actionMessage(error)));
  }
  redirect(deliveryResultUrl(locale, 'success', 'Tracking linked to the order.'));
}

async function unlinkMesColis(formData: FormData) {
  'use server';
  const locale = String(formData.get('locale') ?? 'en');
  const id = String(formData.get('id') ?? '');
  try {
    await apiFetch(`/api/v1/integrations/mes-colis/parcels/${id}/link`, { method: 'DELETE' });
    revalidateDelivery();
  } catch (error) {
    redirect(deliveryResultUrl(locale, 'error', actionMessage(error)));
  }
  redirect(deliveryResultUrl(locale, 'success', 'Tracking link removed.'));
}

function revalidateDelivery() {
  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/activity', 'page');
}

function deliveryResultUrl(locale: string, result: string, message: string) {
  return `/${locale}/delivery?result=${encodeURIComponent(result)}&message=${encodeURIComponent(message)}`;
}

function actionMessage(error: unknown) {
  return error instanceof Error ? error.message : 'This tracking action could not be completed.';
}

export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ result?: string; message?: string }>;
}) {
  const { locale } = await params;
  const notice = await searchParams;
  const [parcels, workspace, providerParcels, mappingReview, mesColis] = await Promise.all([
    apiFetch<ParcelRecord[]>('/api/v1/delivery'),
    getWorkspaceSettings(),
    optionalApiFetch<ProviderParcel[]>('/api/v1/integrations/mes-colis/parcels', []),
    optionalApiFetch<ProviderParcel[]>('/api/v1/integrations/mes-colis/mapping-review', []),
    optionalApiFetch<MesColisStatus>('/api/v1/integrations/mes-colis', {
      status: 'DISCONNECTED',
      isActive: false,
      credentialSaved: false,
      socketHealth: 'disconnected',
      warningCount: 0,
    }),
  ]);
  const mesColisConnected = mesColis.status === 'CONNECTED' && mesColis.isActive;
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

      {notice.message ? (
        <div
          className={`status-banner ${notice.result === 'error' ? 'status-banner-warning' : ''}`}
          role="status"
        >
          <div>
            <strong>
              {notice.result === 'error' ? 'Tracking needs attention' : 'Tracking updated'}
            </strong>
            <p>{notice.message}</p>
          </div>
        </div>
      ) : null}

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
            <input name="locale" type="hidden" value={locale} />
            <button
              className="button button-secondary"
              type="submit"
              disabled={!mesColisConnected || providerParcels.length === 0}
              title={!mesColisConnected ? 'Connect Mes Colis in Settings first.' : undefined}
            >
              Refresh all
            </button>
          </form>
        </div>
        <div className="snapshot-grid" style={{ marginTop: 14 }}>
          <div>
            <span className="metric-label">Connection</span>
            <strong>{mesColisConnected ? 'Connected' : 'Not connected'}</strong>
          </div>
          <div>
            <span className="metric-label">Live updates</span>
            <strong>{mesColis.socketHealth.replaceAll('_', ' ')}</strong>
          </div>
          <div>
            <span className="metric-label">Polling</span>
            <strong>{mesColisConnected ? 'Available' : 'Waiting for connection'}</strong>
          </div>
        </div>
        {!mesColisConnected ? (
          <div className="status-banner status-banner-warning" style={{ marginTop: 14 }}>
            <div>
              <strong>Connect Mes Colis to enable tracking</strong>
              <p>Save the read-only access token in Settings before looking up a barcode.</p>
            </div>
            <Link className="button button-secondary" href={`/${locale}/settings`} prefetch={false}>
              Open Settings
            </Link>
          </div>
        ) : null}
        <form action={lookupMesColis} className="inline-form" style={{ marginTop: 14 }}>
          <input name="locale" type="hidden" value={locale} />
          <input
            className="field"
            name="barcode"
            placeholder="Mes Colis barcode"
            required
            disabled={!mesColisConnected}
          />
          <input
            className="field"
            name="orderReference"
            placeholder="Optional exact order reference"
            disabled={!mesColisConnected}
          />
          <button className="button button-primary" type="submit" disabled={!mesColisConnected}>
            Look up barcode
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
                      <input name="locale" type="hidden" value={locale} />
                      <input
                        className="field"
                        name="orderReference"
                        placeholder="Exact order reference"
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
                <th>Tracking</th>
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
                          prefetch={false}
                        >
                          Order
                        </Link>
                        <form action={refreshOneMesColis}>
                          <input name="id" type="hidden" value={item.id} />
                          <input name="locale" type="hidden" value={locale} />
                          <button className="button button-secondary" type="submit">
                            Refresh
                          </button>
                        </form>
                        <form action={unlinkMesColis}>
                          <input name="id" type="hidden" value={item.id} />
                          <input name="locale" type="hidden" value={locale} />
                          <button className="button button-secondary" type="submit">
                            Unlink
                          </button>
                        </form>
                      </div>
                    ) : (
                      <form action={refreshOneMesColis}>
                        <input name="id" type="hidden" value={item.id} />
                        <input name="locale" type="hidden" value={locale} />
                        <button className="button button-secondary" type="submit">
                          Refresh
                        </button>
                      </form>
                    )}
                    {item.events?.length ? (
                      <div className="field-help" style={{ marginTop: 8 }}>
                        Latest: {item.events[0]?.providerStatus} at{' '}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.events[0]!.occurredAt))}
                      </div>
                    ) : null}
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
          description="Link an existing Mes Colis barcode to begin read-only tracking."
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
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((parcel) => (
                <tr key={parcel.id}>
                  <td>
                    <div className="strong-cell">
                      <Link href={`/${locale}/orders/${parcel.order.id}`} prefetch={false}>
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
                    <StatusBadge tone="info">Provider managed</StatusBadge>
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

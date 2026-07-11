import Link from 'next/link';
import type { ReactNode } from 'react';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { MetricCard, PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface ControlOrder {
  id: string;
  externalId?: string | null;
  orderNumber: string;
  source: string;
  status: string;
  customerName: string;
  customerPhone: string;
  totalAmount: string | number;
  shippingCost: string | number;
  shippingAddress?: Record<string, unknown> | null;
  notes?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  customer?: {
    city?: string | null;
    address?: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    sku?: string | null;
    quantity: number;
    unitPrice: string | number;
    total: string | number;
    product?: {
      id: string;
      sku?: string | null;
      stock: number;
      externalId?: string | null;
    } | null;
  }>;
  confirmationTask?: {
    id: string;
    status: string;
    attempts: number;
    notes?: string | null;
    updatedAt: string;
  } | null;
  fulfillmentTask?: {
    id: string;
    status: string;
    packedAt?: string | null;
    notes?: string | null;
    updatedAt: string;
  } | null;
  parcel?: {
    id: string;
    trackingNumber?: string | null;
    provider: string;
    status: string;
    codCollected: boolean;
    events: Array<{
      id: string;
      status: string;
      note?: string | null;
      timestamp: string;
    }>;
  } | null;
  costSnapshot?: {
    totalCost: string | number;
    revenue: string | number;
    grossMargin: string | number;
    grossMarginPercent: string | number;
    calculatedAt: string;
  } | null;
  timeline: Array<{
    id: string;
    source: string;
    type: string;
    title: string;
    timestamp: string;
  }>;
}

function digits(phone: string) {
  return phone.replace(/\D/g, '');
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ageLabel(value: string) {
  const hours = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 36e5), 0);
  if (hours < 1) return 'New';
  if (hours < 24) return `${hours}h old`;
  return `${Math.floor(hours / 24)}d old`;
}

async function updateOrderStatus(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  await apiFetch(`/api/v1/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/[locale]/orders/[id]', 'page');
  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

async function updateConfirmation(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const orderId = String(formData.get('orderId') ?? '');
  const action = String(formData.get('action') ?? '');
  await apiFetch(`/api/v1/confirmation/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  revalidateOrder(orderId);
}

async function updateFulfillment(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const orderId = String(formData.get('orderId') ?? '');
  const status = String(formData.get('status') ?? '');
  await apiFetch(`/api/v1/fulfillment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidateOrder(orderId);
}

async function updateDelivery(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const orderId = String(formData.get('orderId') ?? '');
  const status = String(formData.get('status') ?? '');
  await apiFetch(`/api/v1/delivery/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidateOrder(orderId);
}

async function recalculateCost(formData: FormData) {
  'use server';

  const orderId = String(formData.get('orderId') ?? '');
  await apiFetch(`/api/v1/costing/recalculate-order/${orderId}`, { method: 'POST' });
  revalidateOrder(orderId);
}

async function addNote(formData: FormData) {
  'use server';

  const orderId = String(formData.get('orderId') ?? '');
  const note = String(formData.get('note') ?? '');
  await apiFetch(`/api/v1/orders/${orderId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  revalidateOrder(orderId);
}

function revalidateOrder(orderId: string) {
  revalidatePath('/[locale]/orders/[id]', 'page');
  revalidatePath(`/en/orders/${orderId}`, 'page');
  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/confirmation', 'page');
  revalidatePath('/[locale]/fulfillment', 'page');
  revalidatePath('/[locale]/delivery', 'page');
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

export default async function OrderControlCenterPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  let order: ControlOrder;
  try {
    order = await apiFetch<ControlOrder>(`/api/v1/orders/${id}`);
  } catch {
    notFound();
  }
  const workspace = await getWorkspaceSettings();
  const city = String(order.shippingAddress?.city ?? order.customer?.city ?? '-');
  const line1 = String(order.shippingAddress?.line1 ?? order.customer?.address ?? '-');
  const marginPercent = order.costSnapshot
    ? `${Math.round(Number(order.costSnapshot.grossMarginPercent) * 1000) / 10}%`
    : 'Missing';

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Order Control Center"
        title={`${order.orderNumber} · ${order.customerName}`}
        description="See the full operational story of this order and move confirmation, fulfillment, delivery, and margin work forward from one place."
        actions={
          <>
            <Link className="button button-secondary" href={`/${locale}/orders`}>
              Back to orders
            </Link>
            <a className="button button-secondary" href={`tel:${order.customerPhone}`}>
              Call
            </a>
            <a
              className="button button-secondary"
              href={`https://wa.me/${digits(order.customerPhone)}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </>
        }
      />

      <section className="stats-grid" aria-label="Order control summary">
        <MetricCard
          label="Status"
          value={order.status}
          help={`${ageLabel(order.createdAt)} · created ${formatDate(order.createdAt, locale)}`}
          badge={order.source === 'shopify' ? 'Shopify' : order.source}
          badgeTone={order.source === 'shopify' ? 'info' : 'muted'}
        />
        <MetricCard
          label="Revenue"
          value={formatMoney(order.totalAmount, workspace.baseCurrency, locale)}
          help={`Shipping: ${formatMoney(order.shippingCost, workspace.baseCurrency, locale)}`}
          badge="Order value"
          badgeTone="info"
        />
        <MetricCard
          label="Gross margin"
          value={
            order.costSnapshot
              ? formatMoney(order.costSnapshot.grossMargin, workspace.baseCurrency, locale)
              : 'Cost missing'
          }
          help={
            order.costSnapshot ? `${marginPercent} margin` : 'Assign product costs, then recalc.'
          }
          badge={order.costSnapshot ? 'Calculated' : 'Action'}
          badgeTone={order.costSnapshot ? 'success' : 'warning'}
        />
        <MetricCard
          label="Workflow"
          value={`${order.confirmationTask?.status ?? 'No call'} / ${order.fulfillmentTask?.status ?? 'No pack'} / ${order.parcel?.status ?? 'No parcel'}`}
          help="Confirmation, fulfillment, and delivery state."
          badge="Live"
          badgeTone="muted"
        />
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <h2 className="section-title">Customer and address</h2>
          <div className="detail-list">
            <p>
              <strong>Customer:</strong> {order.customerName}
            </p>
            <p>
              <strong>Phone:</strong> {order.customerPhone}
            </p>
            <p>
              <strong>City:</strong> {city}
            </p>
            <p>
              <strong>Address:</strong> {line1}
            </p>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="section-title">Shopify metadata</h2>
          <div className="detail-list">
            <p>
              <strong>Source:</strong> {order.source}
            </p>
            <p>
              <strong>External ID:</strong> {order.externalId ?? 'Not linked'}
            </p>
            <p>
              <strong>Duplicate flag:</strong>{' '}
              {(order as { isDuplicate?: boolean }).isDuplicate ? 'Yes' : 'No'}
            </p>
            <p>Shopy keeps this workflow read-only toward Shopify.</p>
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <div className="section-header">
          <div>
            <h2 className="section-title">Items and margin</h2>
            <p className="section-description">
              Use this to check SKUs, quantities, product links, and cost coverage.
            </p>
          </div>
          <form action={recalculateCost}>
            <input name="orderId" type="hidden" value={order.id} />
            <button className="button button-secondary" type="submit">
              Recalculate cost
            </button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Total</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="strong-cell">{item.name}</td>
                  <td>{item.sku ?? item.product?.sku ?? '-'}</td>
                  <td>{item.quantity}</td>
                  <td>{formatMoney(item.unitPrice, workspace.baseCurrency, locale)}</td>
                  <td>{formatMoney(item.total, workspace.baseCurrency, locale)}</td>
                  <td>
                    {item.product ? (
                      <StatusBadge
                        tone={item.product.stock < item.quantity ? 'warning' : 'success'}
                      >
                        {item.product.stock}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">Unlinked</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <section className="panel-grid">
        <WorkflowCard
          title="Confirmation"
          status={order.confirmationTask?.status ?? 'No task'}
          description={`${order.confirmationTask?.attempts ?? 0} contact attempt(s).`}
        >
          {order.confirmationTask ? (
            <form action={updateConfirmation} className="inline-form">
              <input name="id" type="hidden" value={order.confirmationTask.id} />
              <input name="orderId" type="hidden" value={order.id} />
              <button
                className="button button-secondary"
                name="action"
                value="UNREACHABLE"
                type="submit"
              >
                Unreachable
              </button>
              <button
                className="button button-secondary"
                name="action"
                value="CANCELLED"
                type="submit"
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                name="action"
                value="CONFIRMED"
                type="submit"
              >
                Confirm
              </button>
            </form>
          ) : (
            <form action={updateOrderStatus} className="inline-form">
              <input name="id" type="hidden" value={order.id} />
              <button
                className="button button-primary"
                name="status"
                value="CONFIRMED"
                type="submit"
              >
                Mark confirmed
              </button>
            </form>
          )}
        </WorkflowCard>

        <WorkflowCard
          title="Fulfillment"
          status={order.fulfillmentTask?.status ?? 'No task'}
          description={
            order.fulfillmentTask?.packedAt
              ? `Packed ${formatDate(order.fulfillmentTask.packedAt, locale)}`
              : 'Prepare items for dispatch.'
          }
        >
          {order.fulfillmentTask ? (
            <form action={updateFulfillment} className="inline-form">
              <input name="id" type="hidden" value={order.fulfillmentTask.id} />
              <input name="orderId" type="hidden" value={order.id} />
              <button
                className="button button-secondary"
                name="status"
                value="PACKING"
                type="submit"
              >
                Start packing
              </button>
              <button className="button button-primary" name="status" value="PACKED" type="submit">
                Mark packed
              </button>
            </form>
          ) : (
            <p className="field-help">Confirm the order to create a fulfillment task.</p>
          )}
        </WorkflowCard>

        <WorkflowCard
          title="Delivery"
          status={order.parcel?.status ?? 'No parcel'}
          description={order.parcel?.trackingNumber ?? 'Packing creates a parcel record.'}
        >
          {order.parcel ? (
            <form action={updateDelivery} className="inline-form">
              <input name="id" type="hidden" value={order.parcel.id} />
              <input name="orderId" type="hidden" value={order.id} />
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
          ) : (
            <p className="field-help">Mark fulfillment packed to generate a parcel.</p>
          )}
        </WorkflowCard>
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <h2 className="section-title">Internal notes</h2>
          <form action={addNote} className="form-grid compact-form">
            <input name="orderId" type="hidden" value={order.id} />
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Note</span>
              <textarea
                className="field textarea-field"
                name="note"
                placeholder="Add what the next operator needs to know."
                required
                rows={4}
              />
            </label>
            <div className="form-actions">
              <button className="button button-secondary" type="submit">
                Add note
              </button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="section-title">Alerts and suggestions</h2>
          <div className="step-list">
            {!order.costSnapshot ? (
              <div className="step-item">
                <span className="step-number">1</span>
                <div>
                  <p className="step-title">Cost data missing</p>
                  <p className="step-copy">
                    Add product costs in Factory & Costs, then recalculate this order.
                  </p>
                </div>
              </div>
            ) : null}
            {order.parcel?.status === 'FAILED_ATTEMPT' || order.parcel?.status === 'RETURNED' ? (
              <div className="step-item">
                <span className="step-number">2</span>
                <div>
                  <p className="step-title">Delivery needs review</p>
                  <p className="step-copy">
                    Call the customer before retrying or closing the parcel.
                  </p>
                </div>
              </div>
            ) : null}
            {order.timeline.length === 0 ? (
              <p className="field-help">No alerts right now.</p>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <h2 className="section-title">Event timeline</h2>
        <div className="timeline-list">
          {order.timeline.length ? (
            order.timeline.map((event) => (
              <div className="step-item" key={event.id}>
                <span className="step-number">{event.source.slice(0, 2).toUpperCase()}</span>
                <div>
                  <p className="step-title">{event.title}</p>
                  <p className="step-copy">
                    {event.source} · {event.type.replace(/_/g, ' ')} ·{' '}
                    {formatDate(event.timestamp, locale)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="field-help">No events recorded yet.</p>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}

function WorkflowCard({
  title,
  status,
  description,
  children,
}: {
  title: string;
  status: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <SurfaceCard>
      <div className="queue-card-header">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-description">{description}</p>
        </div>
        <StatusBadge tone={status.includes('No') ? 'muted' : 'info'}>{status}</StatusBadge>
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
    </SurfaceCard>
  );
}

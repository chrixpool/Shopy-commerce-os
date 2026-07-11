import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface ConfirmationTask {
  id: string;
  status: string;
  attempts: number;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    status: string;
    totalAmount: string | number;
    createdAt: string;
    customer?: {
      city?: string | null;
      address?: string | null;
    } | null;
  };
}

interface ConfirmationResponse {
  data: ConfirmationTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: Record<string, number>;
}

async function updateConfirmation(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');

  await apiFetch(`/api/v1/confirmation/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });

  revalidatePath('/[locale]/confirmation', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  revalidatePath('/[locale]/orders', 'page');
}

function digits(phone: string) {
  return phone.replace(/\D/g, '');
}

function ageLabel(value: string) {
  const hours = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 36e5), 0);
  if (hours < 1) return 'New';
  if (hours < 24) return `${hours}h waiting`;
  return `${Math.floor(hours / 24)}d waiting`;
}

export default async function ConfirmationPage({
  searchParams,
  params,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const query = (await searchParams) ?? {};
  const page = Math.max(Number(query.page ?? 1), 1);
  const status = typeof query.status === 'string' ? query.status : 'all';
  const search = typeof query.search === 'string' ? query.search : '';
  const apiQuery = new URLSearchParams({
    page: String(page),
    limit: '25',
    ...(status !== 'all' ? { status } : {}),
    ...(search ? { search } : {}),
  });
  const [result, workspace] = await Promise.all([
    apiFetch<ConfirmationResponse>(`/api/v1/confirmation?${apiQuery.toString()}`),
    getWorkspaceSettings(),
  ]);
  const tasks = result.data;
  const pending =
    (result.summary.PENDING ?? 0) +
    (result.summary.IN_PROGRESS ?? 0) +
    (result.summary.CALL_LATER ?? 0);
  const confirmed = result.summary.CONFIRMED ?? 0;
  const unreachable = result.summary.UNREACHABLE ?? 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Customer calls"
        title="Confirmation"
        description="Call customers, confirm order details, and move approved orders into fulfillment."
      />

      <section className="stats-grid" aria-label="Confirmation summary">
        <MetricCard
          label="Pending"
          value={String(pending)}
          help="Tasks waiting for a call or follow-up."
          badge={pending ? 'Call' : 'Clear'}
          badgeTone={pending ? 'warning' : 'success'}
        />
        <MetricCard
          label="Confirmed"
          value={String(confirmed)}
          help="Orders approved by customers."
          badge="Ready"
          badgeTone="info"
        />
        <MetricCard
          label="Unreachable"
          value={String(unreachable)}
          help="Customers not reached yet."
          badge={unreachable ? 'Retry' : 'None'}
          badgeTone={unreachable ? 'warning' : 'success'}
        />
        <MetricCard
          label="Total tasks"
          value={String(result.total)}
          help="All confirmation records in this workspace."
          badge="DB"
          badgeTone="muted"
        />
      </section>

      <form className="toolbar" action={`/${locale}/confirmation`}>
        <label className="search-field">
          <span>Search</span>
          <input
            className="field"
            name="search"
            placeholder="Order, customer, phone, or city"
            defaultValue={search}
          />
        </label>
        <label className="form-field compact-select">
          <span>Status</span>
          <select className="field" name="status" defaultValue={status}>
            <option value="all">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="CALL_LATER">Call later</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="UNREACHABLE">Unreachable</option>
            <option value="REFUSED">Refused</option>
          </select>
        </label>
        <button className="button button-secondary" type="submit">
          Apply
        </button>
      </form>

      {tasks.length === 0 ? (
        <EmptyState
          icon="CF"
          title="No confirmation tasks"
          description="No orders currently need action for this filter."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th>Value</th>
                  <th>Task</th>
                  <th>Order status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="strong-cell">
                      <Link href={`/${locale}/orders/${task.order.id}`}>
                        {task.order.orderNumber}
                      </Link>
                      <div className="field-help">{ageLabel(task.order.createdAt)}</div>
                    </td>
                    <td>
                      <div className="strong-cell">{task.order.customerName}</div>
                      <div>{task.order.customerPhone}</div>
                      <div className="inline-form" style={{ marginTop: 8 }}>
                        <a
                          className="button button-secondary"
                          href={`tel:${task.order.customerPhone}`}
                        >
                          Call
                        </a>
                        <a
                          className="button button-secondary"
                          href={`https://wa.me/${digits(task.order.customerPhone)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                      </div>
                    </td>
                    <td>{task.order.customer?.city ?? '-'}</td>
                    <td>{formatMoney(task.order.totalAmount, workspace.baseCurrency, locale)}</td>
                    <td>
                      <span className="badge badge-muted">{task.status}</span>
                      <div>
                        {task.attempts} attempt{task.attempts === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td>{task.order.status}</td>
                    <td>
                      <form action={updateConfirmation} className="inline-form">
                        <input name="id" type="hidden" value={task.id} />
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-row">
            <span>
              Page {result.page} of {result.totalPages} · Showing {tasks.length} of {result.total}
            </span>
            <div className="actions-row">
              <Link
                className="button button-secondary"
                href={`/${locale}/confirmation?${new URLSearchParams({
                  ...(search ? { search } : {}),
                  ...(status !== 'all' ? { status } : {}),
                  page: String(Math.max(result.page - 1, 1)),
                }).toString()}`}
              >
                Previous
              </Link>
              <Link
                className="button button-secondary"
                href={`/${locale}/confirmation?${new URLSearchParams({
                  ...(search ? { search } : {}),
                  ...(status !== 'all' ? { status } : {}),
                  page: String(Math.min(result.page + 1, result.totalPages)),
                }).toString()}`}
              >
                Next
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

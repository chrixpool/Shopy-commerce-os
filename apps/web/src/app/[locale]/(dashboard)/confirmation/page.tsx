import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

interface ConfirmationTask {
  id: string;
  status: string;
  attempts: number;
  order: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    status: string;
    customer?: {
      city?: string | null;
      address?: string | null;
    } | null;
  };
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

export default async function ConfirmationPage() {
  const tasks = await apiFetch<ConfirmationTask[]>('/api/v1/confirmation');
  const pending = tasks.filter((task) =>
    ['PENDING', 'IN_PROGRESS', 'CALL_LATER'].includes(task.status),
  ).length;
  const confirmed = tasks.filter((task) => task.status === 'CONFIRMED').length;
  const unreachable = tasks.filter((task) => task.status === 'UNREACHABLE').length;

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
          value={String(tasks.length)}
          help="All confirmation records in this workspace."
          badge="DB"
          badgeTone="muted"
        />
      </section>

      {tasks.length === 0 ? (
        <EmptyState
          icon="CF"
          title="No confirmation tasks"
          description="New pending orders create confirmation tasks automatically."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>City</th>
                <th>Task</th>
                <th>Order status</th>
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
      )}
    </div>
  );
}

import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

interface Member {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

const ROLES = ['ADMIN', 'CONFIRMER', 'PACKER', 'DELIVERER', 'CAMPAIGN_MANAGER', 'VIEWER'];

async function inviteMember(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/team/invitations', {
    method: 'POST',
    body: JSON.stringify({
      email: String(formData.get('email') ?? ''),
      role: String(formData.get('role') ?? 'VIEWER'),
    }),
  });

  revalidatePath('/[locale]/team', 'page');
}

async function revokeInvitation(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  await apiFetch(`/api/v1/team/invitations/${id}`, { method: 'DELETE' });

  revalidatePath('/[locale]/team', 'page');
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [members, invitations] = await Promise.all([
    apiFetch<Member[]>('/api/v1/team/members'),
    apiFetch<Invitation[]>('/api/v1/team/invitations'),
  ]);
  const pendingInvitations = invitations.filter((invitation) => invitation.status === 'PENDING');
  const operationalRoles = new Set(members.map((member) => member.role));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Access control"
        title="Team"
        description="Invite teammates, assign clear roles, and keep sensitive actions limited to the right people."
      />

      <section className="stats-grid" aria-label="Team summary">
        <MetricCard
          label="Active members"
          value={String(members.length)}
          help="Users currently attached to this organization."
          badge="Live"
          badgeTone="info"
        />
        <MetricCard
          label="Pending invites"
          value={String(pendingInvitations.length)}
          help="Invitations waiting for acceptance."
          badge={pendingInvitations.length ? 'Open' : 'Clear'}
          badgeTone={pendingInvitations.length ? 'warning' : 'success'}
        />
        <MetricCard
          label="Roles in use"
          value={String(operationalRoles.size)}
          help="Distinct roles assigned to active members."
          badge="RBAC"
          badgeTone="muted"
        />
        <MetricCard
          label="Auth status"
          value="Enabled"
          help="Dashboard routes require sign-in."
          badge="Secure"
          badgeTone="success"
        />
      </section>

      <form action={inviteMember} className="card card-padded form-grid">
        <label className="form-field">
          <span>Email</span>
          <input className="field" name="email" type="email" required />
        </label>
        <label className="form-field">
          <span>Role</span>
          <select className="select-field" name="role" defaultValue="VIEWER">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Create invitation
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td className="strong-cell">{member.name ?? 'Unnamed user'}</td>
                <td>{member.email ?? '-'}</td>
                <td>
                  <span className="badge badge-info">{member.role}</span>
                </td>
                <td>
                  <span className="badge badge-success">Active</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invitations.length === 0 ? (
        <EmptyState
          icon="TM"
          title="No invitations yet"
          description="Create an invitation to add another teammate to this workspace."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Local invite link</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="strong-cell">{invitation.email}</td>
                  <td>
                    <span className="badge badge-muted">{invitation.role}</span>
                  </td>
                  <td>{invitation.status}</td>
                  <td>
                    <code>{`/${locale}/sign-up?token=${invitation.token}`}</code>
                  </td>
                  <td>
                    {invitation.status === 'PENDING' ? (
                      <form action={revokeInvitation}>
                        <input name="id" type="hidden" value={invitation.id} />
                        <button className="button button-secondary" type="submit">
                          Revoke
                        </button>
                      </form>
                    ) : (
                      '-'
                    )}
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

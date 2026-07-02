import { revalidatePath } from 'next/cache';
import { MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

interface Integration {
  provider: string;
  label: string;
  isActive: boolean;
  source: string;
  lastSyncAt?: string | null;
}

async function updateOrganization(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/settings/organization', {
    method: 'PATCH',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      slug: String(formData.get('slug') ?? ''),
    }),
  });

  revalidatePath('/[locale]/settings', 'page');
  revalidatePath('/[locale]/dashboard', 'layout');
}

export default async function SettingsPage() {
  const [organization, integrations] = await Promise.all([
    apiFetch<Organization>('/api/v1/settings/organization'),
    apiFetch<Integration[]>('/api/v1/settings/integrations'),
  ]);
  const shopify = integrations.find((integration) => integration.provider === 'shopify');
  const connectedCount = integrations.filter((integration) => integration.isActive).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace identity and review local MVP integration status."
      />

      <section className="stats-grid" aria-label="Settings summary">
        <MetricCard
          label="Workspace"
          value={organization.name}
          help={`Slug: ${organization.slug}`}
          badge="DB"
          badgeTone="info"
        />
        <MetricCard
          label="Authentication"
          value="Enabled"
          help="Dashboard routes are protected by Auth.js."
          badge="Secure"
          badgeTone="success"
        />
        <MetricCard
          label="Local DB"
          value="Connected"
          help="PostgreSQL is the active local data store."
          badge="Live"
          badgeTone="success"
        />
        <MetricCard
          label="Integrations"
          value={String(connectedCount)}
          help="Connected system and integration cards."
          badge={shopify?.isActive ? 'Shopify on' : 'MVP'}
          badgeTone={shopify?.isActive ? 'success' : 'muted'}
        />
      </section>

      <section className="panel-grid">
        <form action={updateOrganization} className="card card-padded form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <h2 className="section-title">Organization</h2>
            <p className="section-description">Edit the visible workspace name and local slug.</p>
          </div>
          <label className="form-field">
            <span>Name</span>
            <input
              className="field"
              name="name"
              defaultValue={organization.name}
              required
              minLength={2}
            />
          </label>
          <label className="form-field">
            <span>Slug</span>
            <input
              className="field"
              name="slug"
              defaultValue={organization.slug}
              required
              minLength={2}
              pattern="[a-z0-9-]+"
            />
          </label>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Save organization
            </button>
          </div>
        </form>

        <aside className="card card-padded">
          <h2 className="section-title">Integration status</h2>
          <p className="section-description">Placeholder-safe cards for local MVP readiness.</p>
          <div className="step-list" style={{ marginTop: 18 }}>
            {integrations.map((integration) => (
              <div className="step-item" key={`${integration.provider}-${integration.source}`}>
                <span className="step-number">{integration.label.slice(0, 2).toUpperCase()}</span>
                <div>
                  <p className="step-title">{integration.label}</p>
                  <p className="step-copy">
                    <span
                      className={`badge ${integration.isActive ? 'badge-success' : 'badge-muted'}`}
                    >
                      {integration.isActive ? 'Connected' : 'Not connected'}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

import { revalidatePath } from 'next/cache';
import { MetricCard, PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType?: string | null;
  actionType?: string | null;
  provider?: string | null;
  dryRun: boolean;
  approvalRequired: boolean;
  lastStatus?: string | null;
  runCount: number;
}

interface AutomationRun {
  id: string;
  status: string;
  dryRun: boolean;
  startedAt: string;
  automation?: { name: string } | null;
}

interface DraftAction {
  id: string;
  provider: string;
  actionType: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
}

interface Template {
  name: string;
  triggerType: string;
  actionType: string;
  provider: string;
}

const STARTER_TEMPLATES: Template[] = [
  {
    name: 'Flag orders not confirmed after 24h',
    triggerType: 'confirmation_delayed',
    actionType: 'create_smart_suggestion',
    provider: 'MANUAL',
  },
  {
    name: 'Suggest restock when stock drops below threshold',
    triggerType: 'low_stock_detected',
    actionType: 'recommend_inventory_restock',
    provider: 'MANUAL',
  },
  {
    name: 'Create delivery follow-up for failed parcels',
    triggerType: 'delivery_failed',
    actionType: 'recommend_delivery_followup',
    provider: 'MANUAL',
  },
];

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

async function createAutomation(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/automations', {
    method: 'POST',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      provider: String(formData.get('provider') ?? 'MANUAL'),
      triggerType: String(formData.get('triggerType') ?? 'order_created'),
      actionType: String(formData.get('actionType') ?? 'create_smart_suggestion'),
      dryRun: formData.get('dryRun') === 'on',
      approvalRequired: formData.get('approvalRequired') === 'on',
      conditions: {},
      actionConfig: {},
    }),
  });

  revalidatePath('/[locale]/automations', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

async function runAutomation(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  await apiFetch(`/api/v1/automations/${id}/test`, { method: 'POST' });
  revalidatePath('/[locale]/automations', 'page');
}

async function updateDraftAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? 'APPROVED');
  await apiFetch(`/api/v1/draft-actions/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/[locale]/automations', 'page');
}

export default async function AutomationsPage() {
  const [rules, runs, drafts, templates, integrations] = await Promise.all([
    optionalApiFetch<AutomationRule[]>('/api/v1/automations', []),
    optionalApiFetch<AutomationRun[]>('/api/v1/automations/runs', []),
    optionalApiFetch<DraftAction[]>('/api/v1/draft-actions', []),
    optionalApiFetch<Template[]>('/api/v1/automations/templates', STARTER_TEMPLATES),
    optionalApiFetch<Array<{ provider: string; status: string; mode: string }>>(
      '/api/v1/integrations',
      [],
    ),
  ]);

  const enabledRules = rules.filter((rule) => rule.enabled).length;
  const pendingDrafts = drafts.filter((draft) => draft.status === 'PENDING_APPROVAL').length;
  const connectedProviders = integrations.filter(
    (integration) => integration.status === 'CONNECTED',
  ).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Automation cockpit"
        title="Automations"
        description="Create dry-run rules, review suggested actions, and keep every external write approval-gated."
      />

      <section className="stats-grid" aria-label="Automation summary">
        <MetricCard
          label="Rules"
          value={String(rules.length)}
          help="Automation rules in this workspace."
          badge={`${enabledRules} on`}
          badgeTone="info"
        />
        <MetricCard
          label="Draft actions"
          value={String(pendingDrafts)}
          help="Approvals waiting before anything external can happen."
          badge="Approval"
          badgeTone={pendingDrafts ? 'warning' : 'success'}
        />
        <MetricCard
          label="Runs"
          value={String(runs.length)}
          help="Recent dry-run and manual executions."
          badge="Logs"
          badgeTone="muted"
        />
        <MetricCard
          label="Channels"
          value={String(connectedProviders)}
          help="Connected optional providers."
          badge="Optional"
          badgeTone="muted"
        />
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <h2 className="section-title">Create rule</h2>
          <p className="section-description">
            Rules are dry-run and approval-required by default. They create internal suggestions or
            draft actions only.
          </p>
          <form action={createAutomation} className="form-grid" style={{ marginTop: 16 }}>
            <label className="form-field">
              <span>Name</span>
              <input
                className="field"
                name="name"
                required
                defaultValue="Flag delayed confirmations"
              />
            </label>
            <label className="form-field">
              <span>Provider</span>
              <select className="select-field" name="provider" defaultValue="MANUAL">
                <option value="MANUAL">Shopy internal rules</option>
                <option value="SHOPIFY">Shopify</option>
                <option value="META_ADS">Meta Ads</option>
                <option value="FACEBOOK_PAGE">Facebook Page</option>
                <option value="INSTAGRAM">Instagram</option>
              </select>
            </label>
            <label className="form-field">
              <span>Trigger</span>
              <select
                className="select-field"
                name="triggerType"
                defaultValue="confirmation_delayed"
              >
                <option value="order_created">Order created</option>
                <option value="order_status_changed">Order status changed</option>
                <option value="low_stock_detected">Low stock detected</option>
                <option value="confirmation_delayed">Confirmation delayed</option>
                <option value="delivery_failed">Delivery failed</option>
                <option value="meta_campaign_synced">Meta campaign synced</option>
              </select>
            </label>
            <label className="form-field">
              <span>Action</span>
              <select
                className="select-field"
                name="actionType"
                defaultValue="create_smart_suggestion"
              >
                <option value="create_smart_suggestion">Create smart suggestion</option>
                <option value="create_draft_action">Create draft action</option>
                <option value="recommend_inventory_restock">Recommend inventory restock</option>
                <option value="recommend_campaign_review">Recommend campaign review</option>
                <option value="recommend_delivery_followup">Recommend delivery follow-up</option>
              </select>
            </label>
            <label className="form-field">
              <span>
                <input name="dryRun" type="checkbox" defaultChecked /> Dry run
              </span>
            </label>
            <label className="form-field">
              <span>
                <input name="approvalRequired" type="checkbox" defaultChecked /> Approval required
              </span>
            </label>
            <div className="form-actions">
              <button className="button button-primary" type="submit">
                Create automation
              </button>
            </div>
          </form>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="section-title">Starter templates</h2>
          <div className="step-list" style={{ marginTop: 16 }}>
            {templates.map((template) => (
              <div className="step-item" key={template.name}>
                <span className="step-number">AU</span>
                <div>
                  <p className="step-title">{template.name}</p>
                  <p className="step-copy">
                    {template.triggerType} {'->'} {template.actionType}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <section className="command-grid">
        <SurfaceCard>
          <h2 className="section-title">Rules</h2>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Trigger</th>
                  <th>Mode</th>
                  <th>Runs</th>
                  <th>Test</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="strong-cell">{rule.name}</td>
                    <td>{rule.provider ?? 'MANUAL'}</td>
                    <td>{rule.triggerType}</td>
                    <td>
                      <StatusBadge tone={rule.dryRun ? 'info' : 'warning'}>
                        {rule.dryRun ? 'Dry run' : 'Draft only'}
                      </StatusBadge>
                    </td>
                    <td>{rule.runCount}</td>
                    <td>
                      <form action={runAutomation}>
                        <input name="id" type="hidden" value={rule.id} />
                        <button className="button button-secondary" type="submit">
                          Test
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No automation rules yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="section-title">Approval queue</h2>
          <div className="priority-list">
            {drafts.map((draft) => (
              <div className="priority-item" key={draft.id}>
                <span className="priority-dot" />
                <div>
                  <p className="step-title">{draft.title}</p>
                  <p className="step-copy">{draft.summary}</p>
                  <div className="actions-row" style={{ marginTop: 10 }}>
                    <StatusBadge tone={draft.status === 'APPROVED' ? 'success' : 'warning'}>
                      {draft.status}
                    </StatusBadge>
                    {draft.status === 'PENDING_APPROVAL' ? (
                      <form action={updateDraftAction} className="inline-form">
                        <input name="id" type="hidden" value={draft.id} />
                        <button
                          className="button button-secondary"
                          name="status"
                          value="REJECTED"
                          type="submit"
                        >
                          Reject
                        </button>
                        <button
                          className="button button-primary"
                          name="status"
                          value="APPROVED"
                          type="submit"
                        >
                          Approve
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {drafts.length === 0 ? (
              <p className="section-description">No draft actions are waiting.</p>
            ) : null}
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}

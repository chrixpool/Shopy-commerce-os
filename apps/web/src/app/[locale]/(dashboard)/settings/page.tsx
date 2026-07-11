import { revalidatePath } from 'next/cache';
import { MetricCard, PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';
import { formatMoney, SUPPORTED_CURRENCIES } from '@/lib/currency';

interface Organization {
  id: string;
  name: string;
  slug: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
}

interface Integration {
  provider: string;
  label: string;
  status: string;
  mode: string;
  capabilities?: Record<string, boolean>;
  config?: Record<string, unknown>;
  lastSyncAt?: string | null;
  errorMessage?: string | null;
}

interface SyncRun {
  id: string;
  status: string;
  dryRun?: boolean;
  startedAt: string;
  finishedAt?: string | null;
  inputSnapshot?: Record<string, unknown> | null;
  outputSnapshot?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

const FALLBACK_INTEGRATIONS: Integration[] = [
  { provider: 'CSV', label: 'CSV import', status: 'CONNECTED', mode: 'READ_ONLY' },
  { provider: 'MANUAL', label: 'Manual workflows', status: 'CONNECTED', mode: 'APPROVAL_REQUIRED' },
  { provider: 'SHOPIFY', label: 'Shopify', status: 'DISCONNECTED', mode: 'READ_ONLY' },
  { provider: 'META_ADS', label: 'Meta Ads', status: 'DISCONNECTED', mode: 'READ_ONLY' },
  {
    provider: 'FACEBOOK_PAGE',
    label: 'Facebook Page',
    status: 'DISCONNECTED',
    mode: 'DRAFT_ACTIONS',
  },
  { provider: 'INSTAGRAM', label: 'Instagram', status: 'DISCONNECTED', mode: 'DRAFT_ACTIONS' },
];

async function optionalApiFetch<T>(path: string, fallback: T, timeoutMs = 2500) {
  try {
    return await Promise.race([
      apiFetch<T>(path),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]);
  } catch {
    return fallback;
  }
}

async function updateOrganization(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/settings/organization', {
    method: 'PATCH',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      slug: String(formData.get('slug') ?? ''),
      baseCurrency: String(formData.get('baseCurrency') ?? 'USD'),
    }),
  });

  revalidatePath('/[locale]/settings', 'page');
  revalidatePath('/[locale]/dashboard', 'layout');
}

async function connectIntegration(formData: FormData) {
  'use server';

  const provider = String(formData.get('provider') ?? '');
  await apiFetch(`/api/v1/integrations/${provider.toLowerCase().replaceAll('_', '-')}/connect`, {
    method: 'POST',
    body: JSON.stringify({
      connectionMethod: String(formData.get('connectionMethod') ?? ''),
      shopDomain: String(formData.get('shopDomain') ?? ''),
      clientId: String(formData.get('clientId') ?? ''),
      clientSecret: String(formData.get('clientSecret') ?? ''),
      adminAccessToken: String(formData.get('adminAccessToken') ?? ''),
      accountId: String(formData.get('accountId') ?? ''),
      pageId: String(formData.get('pageId') ?? ''),
      instagramBusinessAccountId: String(formData.get('instagramBusinessAccountId') ?? ''),
      accessToken: String(formData.get('accessToken') ?? ''),
      apiVersion: String(formData.get('apiVersion') ?? ''),
      mode: String(formData.get('mode') ?? 'READ_ONLY'),
    }),
  });

  revalidatePath('/[locale]/settings', 'page');
}

async function syncIntegration(formData: FormData) {
  'use server';

  const provider = String(formData.get('provider') ?? '');
  const dryRun = formData.get('dryRun') === 'true';
  try {
    await apiFetch(
      `/api/v1/integrations/${provider.toLowerCase().replaceAll('_', '-')}${dryRun ? '/dry-run' : '/sync'}`,
      {
        method: 'POST',
        body: JSON.stringify({ dryRun }),
      },
    );
  } catch {
    // Provider sync failures should be reported in the integration card, not as a route crash.
  }

  revalidatePath('/[locale]/settings', 'page');
  revalidatePath('/[locale]/campaigns', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

async function testIntegration(formData: FormData) {
  'use server';

  const provider = String(formData.get('provider') ?? '');
  await apiFetch(`/api/v1/integrations/${provider.toLowerCase().replaceAll('_', '-')}/test`, {
    method: 'POST',
  });

  revalidatePath('/[locale]/settings', 'page');
}

async function disconnectIntegration(formData: FormData) {
  'use server';

  const provider = String(formData.get('provider') ?? '');
  await apiFetch(`/api/v1/integrations/${provider.toLowerCase().replaceAll('_', '-')}/disconnect`, {
    method: 'POST',
  });

  revalidatePath('/[locale]/settings', 'page');
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [organization, integrations, shopifySyncRuns] = await Promise.all([
    apiFetch<Organization>('/api/v1/settings/organization'),
    optionalApiFetch<Integration[]>('/api/v1/integrations', FALLBACK_INTEGRATIONS),
    optionalApiFetch<SyncRun[]>('/api/v1/integrations/shopify/sync-runs', [], 1200),
  ]);
  const connectedCount = integrations.filter(
    (integration) => integration.status === 'CONNECTED',
  ).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace identity, operating currency, and connected workflow capabilities."
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
          label="Currency"
          value={organization.baseCurrency}
          help={formatMoney(1234.56, organization.baseCurrency, locale)}
          badge="Workspace"
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
          help="Connected provider and system channels."
          badge={connectedCount ? 'Channels on' : 'Manual-first'}
          badgeTone={connectedCount ? 'success' : 'muted'}
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
          <label className="form-field">
            <span>Platform currency</span>
            <select
              className="select-field"
              name="baseCurrency"
              defaultValue={organization.baseCurrency}
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency} - {formatMoney(1234.56, currency, locale)}
                </option>
              ))}
            </select>
            <small className="field-help">
              Changing currency updates how monetary values are displayed and entered. It does not
              convert existing amounts.
            </small>
          </label>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Save organization
            </button>
          </div>
        </form>

        <aside className="card card-padded">
          <h2 className="section-title">Automation safety</h2>
          <p className="section-description">
            Provider writes stay draft-first or approval-gated. Shopy does not spend ad budget,
            publish posts, or send messages automatically.
          </p>
          <div className="step-list" style={{ marginTop: 18 }}>
            {['Read-only sync', 'Draft actions', 'Approval queue', 'Manual publish'].map(
              (item, index) => (
                <div className="step-item" key={item}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <p className="step-title">{item}</p>
                    <p className="step-copy">
                      Enabled without paid APIs or automatic external writes.
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        </aside>
      </section>

      <SurfaceCard>
        <div className="section-header">
          <div>
            <h2 className="section-title">Integrations</h2>
            <p className="section-description">
              Connect channels for read-only sync and draft recommendations. Tokens are encrypted at
              rest when saved and never shown again.
            </p>
          </div>
        </div>
        <div className="queue-grid" style={{ marginTop: 18 }}>
          {integrations.map((integration) => {
            const isExternal = ['SHOPIFY', 'META_ADS', 'FACEBOOK_PAGE', 'INSTAGRAM'].includes(
              integration.provider,
            );
            const connectionMethod = String(
              integration.config?.connectionMethod ?? 'CLIENT_CREDENTIALS',
            );
            const grantedScopes = Array.isArray(integration.config?.scopes)
              ? integration.config.scopes.map(String)
              : [];
            const scopeWarnings = Array.isArray(integration.config?.scopeWarnings)
              ? integration.config.scopeWarnings.map(String)
              : [];
            const scopeReport = integration.config?.scopeReport as
              | {
                  broaderGranted?: string[];
                  historicalOrders?: { satisfied?: boolean };
                }
              | undefined;
            const shop = integration.config?.shop as Record<string, unknown> | undefined;
            return (
              <div className="queue-card" key={integration.provider}>
                <div className="queue-card-header">
                  <div>
                    <p className="queue-title">{integration.label}</p>
                    <p className="queue-meta">
                      {integration.mode.replaceAll('_', ' ').toLowerCase()} mode
                    </p>
                  </div>
                  <StatusBadge tone={integration.status === 'CONNECTED' ? 'success' : 'muted'}>
                    {integration.status.replaceAll('_', ' ')}
                  </StatusBadge>
                </div>
                <p className="section-description">
                  {integration.provider === 'SHOPIFY'
                    ? 'Shopy imports Shopify data in read-only mode. It does not modify your store.'
                    : integration.provider === 'META_ADS'
                      ? 'Reads campaign performance and creates draft recommendations. Budgets are never changed.'
                      : integration.provider === 'FACEBOOK_PAGE'
                        ? 'Reads page activity and creates draft post/reply ideas. Publishing is disabled.'
                        : integration.provider === 'INSTAGRAM'
                          ? 'Reads profile/media metrics and creates draft content ideas. Publishing is disabled.'
                          : 'Available without external credentials.'}
                </p>
                {isExternal ? (
                  <form action={connectIntegration} className="form-grid compact-form">
                    <input name="provider" type="hidden" value={integration.provider} />
                    <input name="mode" type="hidden" value="READ_ONLY" />
                    {integration.provider === 'SHOPIFY' ? (
                      <>
                        <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                          <span>Connection method</span>
                          <select
                            className="select-field"
                            name="connectionMethod"
                            defaultValue={connectionMethod}
                          >
                            <option value="CLIENT_CREDENTIALS">Simple setup</option>
                            <option value="ADMIN_TOKEN">Advanced: Admin API token</option>
                          </select>
                          <small className="field-help">
                            Simple setup uses your Shopify app Client ID and Client Secret to
                            generate a read-only Admin API access token on the server. Shopy
                            encrypts credentials and does not modify your Shopify store.
                          </small>
                        </label>
                        <label className="form-field">
                          <span>Shop domain</span>
                          <input
                            className="field"
                            name="shopDomain"
                            placeholder="your-store.myshopify.com"
                            defaultValue={String(integration.config?.shopDomain ?? '')}
                          />
                        </label>
                        <label className="form-field">
                          <span>API version</span>
                          <input
                            className="field"
                            name="apiVersion"
                            placeholder="2026-01"
                            defaultValue={String(integration.config?.apiVersion ?? '2026-01')}
                          />
                        </label>
                        <label className="form-field">
                          <span>Client ID</span>
                          <input
                            className="field"
                            name="clientId"
                            placeholder="Shopify app Client ID"
                            defaultValue={String(integration.config?.clientId ?? '')}
                            autoComplete="off"
                          />
                        </label>
                        <label className="form-field">
                          <span>Client Secret</span>
                          <input
                            className="field"
                            name="clientSecret"
                            placeholder="Paste to connect or rotate"
                            type="password"
                            autoComplete="off"
                          />
                        </label>
                        <details className="form-field" style={{ gridColumn: '1 / -1' }}>
                          <summary>Advanced Admin API token fallback</summary>
                          <div style={{ marginTop: 10 }}>
                            <input
                              className="field"
                              name="adminAccessToken"
                              placeholder="Paste Admin API access token"
                              type="password"
                              autoComplete="off"
                            />
                          </div>
                        </details>
                        <p className="field-help" style={{ gridColumn: '1 / -1' }}>
                          Required read-only scopes: read_orders, read_products, read_customers,
                          read_inventory, read_locations. For full historical order import, add
                          read_all_orders if Shopify allows it for your app/store.
                        </p>
                      </>
                    ) : null}
                    {integration.provider === 'META_ADS' ? (
                      <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                        <span>Ad account ID</span>
                        <input className="field" name="accountId" placeholder="act_..." />
                      </label>
                    ) : null}
                    {integration.provider === 'FACEBOOK_PAGE' ? (
                      <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                        <span>Page ID</span>
                        <input className="field" name="pageId" placeholder="Facebook page ID" />
                      </label>
                    ) : null}
                    {integration.provider === 'INSTAGRAM' ? (
                      <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                        <span>Business account ID</span>
                        <input
                          className="field"
                          name="instagramBusinessAccountId"
                          placeholder="Instagram business account ID"
                        />
                      </label>
                    ) : null}
                    {integration.provider !== 'SHOPIFY' ? (
                      <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                        <span>Access token</span>
                        <input
                          className="field"
                          name="accessToken"
                          placeholder="Paste token to replace saved credential"
                          type="password"
                        />
                      </label>
                    ) : null}
                    <div className="form-actions">
                      <button className="button button-secondary" type="submit">
                        {integration.provider === 'SHOPIFY' ? 'Connect & test' : 'Save connection'}
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="button-row">
                  {isExternal ? (
                    <form action={testIntegration}>
                      <input name="provider" type="hidden" value={integration.provider} />
                      <button className="button button-secondary" type="submit">
                        Test
                      </button>
                    </form>
                  ) : null}
                  <form action={syncIntegration}>
                    <input name="provider" type="hidden" value={integration.provider} />
                    <input name="dryRun" type="hidden" value="true" />
                    <button className="button button-secondary" type="submit">
                      Dry-run sync
                    </button>
                  </form>
                  <form action={syncIntegration}>
                    <input name="provider" type="hidden" value={integration.provider} />
                    <input name="dryRun" type="hidden" value="false" />
                    <button className="button button-primary" type="submit">
                      Sync now
                    </button>
                  </form>
                  {integration.provider === 'SHOPIFY' ? (
                    <form action={disconnectIntegration}>
                      <input name="provider" type="hidden" value={integration.provider} />
                      <button className="button button-secondary" type="submit">
                        Disconnect
                      </button>
                    </form>
                  ) : null}
                </div>
                {integration.errorMessage ? (
                  <p className="field-help">
                    Connection failed. Check store domain, scopes, or credentials. Provider note:{' '}
                    {integration.errorMessage}
                  </p>
                ) : null}
                {integration.provider === 'SHOPIFY' ? (
                  <div className="field-help">
                    <p>Connection method: {connectionMethod.replaceAll('_', ' ').toLowerCase()}</p>
                    {shop?.name ? <p>Connected shop: {String(shop.name)}</p> : null}
                    {grantedScopes.length ? (
                      <p>Granted scopes: {grantedScopes.join(', ')}</p>
                    ) : null}
                    {scopeWarnings.length ? (
                      <p>Scope warnings: {scopeWarnings.join(', ')}</p>
                    ) : null}
                    {scopeReport?.broaderGranted?.length ? (
                      <p>Broader grants accepted: {scopeReport.broaderGranted.join(', ')}</p>
                    ) : null}
                    {scopeReport?.historicalOrders ? (
                      <p>
                        Historical order access:{' '}
                        {scopeReport.historicalOrders.satisfied ? 'available' : 'limited window'}
                      </p>
                    ) : null}
                    {integration.config?.lastTestAt ? (
                      <p>
                        Last test:{' '}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(String(integration.config.lastTestAt)))}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="field-help">
                  Last sync:{' '}
                  {integration.lastSyncAt
                    ? new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(integration.lastSyncAt))
                    : 'Not synced yet'}
                </p>
                {integration.provider === 'SHOPIFY' ? (
                  <div className="sync-history" aria-label="Shopify sync history">
                    <div className="queue-card-header">
                      <div>
                        <p className="queue-title">Sync history</p>
                        <p className="queue-meta">Latest safe import activity</p>
                      </div>
                    </div>
                    {shopifySyncRuns.length ? (
                      shopifySyncRuns.slice(0, 3).map((run) => {
                        const totals = syncRunTotals(run);
                        const warnings = Array.isArray(run.outputSnapshot?.warnings)
                          ? run.outputSnapshot.warnings.map(String)
                          : [];
                        return (
                          <div className="sync-history-row" key={run.id}>
                            <div>
                              <p className="sync-history-title">
                                {run.dryRun ? 'Dry-run' : 'Sync'} ·{' '}
                                {run.status.replaceAll('_', ' ').toLowerCase()}
                              </p>
                              <p className="sync-history-meta">
                                {new Intl.DateTimeFormat(locale, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(run.startedAt))}
                                {warnings[0] ? ` - ${warnings[0]}` : ''}
                              </p>
                            </div>
                            {totals ? (
                              <StatusBadge tone={run.status === 'FAILED' ? 'danger' : 'info'}>
                                {formatSyncTotals(totals)}
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone={run.status === 'FAILED' ? 'danger' : 'muted'}>
                                {run.status === 'FAILED' ? 'Needs attention' : 'Recorded'}
                              </StatusBadge>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="field-help">
                        No sync history yet. Run a dry-run first to preview import counts.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SurfaceCard>
    </div>
  );
}

function syncRunTotals(run: SyncRun) {
  const output = run.outputSnapshot;
  if (!output) return null;

  const directTotals = ['products', 'customers', 'orders'].reduce<Record<string, unknown>>(
    (totals, key) => {
      const value = output[key];
      if (typeof value === 'number') totals[key] = value;
      if (value && typeof value === 'object' && 'found' in value) totals[key] = value;
      return totals;
    },
    {},
  );
  if (Object.keys(directTotals).length) return directTotals;

  const nestedTotals = output.totals;
  return nestedTotals && typeof nestedTotals === 'object'
    ? (nestedTotals as Record<string, unknown>)
    : null;
}

function formatSyncTotals(totals: Record<string, unknown>) {
  return Object.entries(totals)
    .map(([key, value]) => {
      if (value && typeof value === 'object' && 'found' in value) {
        const item = value as Record<string, unknown>;
        return `${key}: ${String(item.found ?? 0)} found, ${String(item.created ?? 0)} new, ${String(item.updated ?? 0)} updated, ${String(item.failed ?? 0)} failed`;
      }
      return `${key}: ${String(value)}`;
    })
    .join(' - ');
}

import { revalidatePath } from 'next/cache';
import {
  DataTrustStrip,
  EmptyState,
  IntegrationHealthBadge,
  MetricCard,
  PageHeader,
  StatusBadge,
  SurfaceCard,
  integrationHealthState,
} from '@/components/ui/page';
import { apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface MarketingSummary {
  campaigns: number;
  draftActions: number;
  spend: number;
  clicks: number;
  conversions: number;
  impressions: number;
  reportedValue: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  metricSource: string;
  dateRange: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective?: string | null;
  metrics?: Array<{
    date: string;
    spend: string | number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: string | number;
    cpc?: string | number | null;
    ctr?: string | number | null;
    roas?: string | number | null;
    cpm?: string | number | null;
  }>;
}

async function optionalApiFetch<T>(path: string, fallback: T) {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

async function draftCampaignReview() {
  'use server';
  await apiFetch('/api/v1/marketing/meta-ads/draft-action', {
    method: 'POST',
    body: JSON.stringify({
      actionType: 'recommend_campaign_review',
      title: 'Review campaign efficiency',
      summary: 'Draft recommendation created. Shopy will not modify ads or budgets.',
      payload: { source: 'marketing-center' },
    }),
  });
  revalidatePath('/[locale]/campaigns', 'page');
  revalidatePath('/[locale]/automations', 'page');
}

export default async function CampaignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [summary, campaigns, integrations, settings] = await Promise.all([
    optionalApiFetch<MarketingSummary>('/api/v1/marketing/meta-ads/summary', {
      campaigns: 0,
      draftActions: 0,
      spend: 0,
      clicks: 0,
      conversions: 0,
      impressions: 0,
      reportedValue: 0,
      ctr: null,
      cpc: null,
      cpm: null,
      roas: null,
      metricSource: 'Meta Ads',
      dateRange: 'No synced period',
    }),
    optionalApiFetch<Campaign[]>('/api/v1/marketing/meta-ads/campaigns', []),
    optionalApiFetch<
      Array<{ provider: string; status: string; mode: string; config?: Record<string, unknown> }>
    >('/api/v1/integrations', []),
    optionalApiFetch<{ baseCurrency: string }>('/api/v1/settings/organization', {
      baseCurrency: 'USD',
    }),
  ]);

  const meta = integrations.find((integration) => integration.provider === 'META_ADS');
  const metaAccount = meta?.config?.account as Record<string, unknown> | undefined;
  const reportingCurrency = String(metaAccount?.currency ?? settings.baseCurrency);
  const facebook = integrations.find((integration) => integration.provider === 'FACEBOOK_PAGE');
  const instagram = integrations.find((integration) => integration.provider === 'INSTAGRAM');
  const metaConnected = meta?.status === 'CONNECTED';

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Marketing center"
        title="Campaigns"
        description="Read channel performance, collect draft recommendations, and keep ad budget and publishing actions approval-gated."
        actions={
          <form action={draftCampaignReview}>
            <button className="button button-primary" type="submit">
              Draft recommendation
            </button>
          </form>
        }
      />

      <DataTrustStrip
        label="Marketing data trust"
        items={[
          {
            label: 'Source',
            value: summary.metricSource || 'Meta Ads',
            detail: 'Provider-reported; not Shopy attribution',
            state: metaConnected ? 'confirmed' : 'unavailable',
          },
          {
            label: 'Reporting scope',
            value: metaConnected ? summary.dateRange : 'Unavailable',
            detail: 'Attribution windows may differ from Shopify',
            state: metaConnected ? 'confirmed' : 'unavailable',
          },
          {
            label: 'Currency',
            value: metaConnected ? reportingCurrency : 'Unavailable',
            detail: 'Meta account currency',
            state: metaConnected ? 'confirmed' : 'unavailable',
          },
          {
            label: 'Connection',
            value: (
              <IntegrationHealthBadge state={integrationHealthState({ status: meta?.status })} />
            ),
            detail: 'Read-only; no budget changes',
            state: metaConnected ? 'confirmed' : 'unavailable',
          },
        ]}
      />

      <section className="stats-grid" aria-label="Marketing summary">
        <MetricCard
          label="Spend"
          value={
            metaConnected ? formatMoney(summary.spend, reportingCurrency, locale) : 'Unavailable'
          }
          help="Latest synced Meta spend. No budgets are changed."
          badge="Read-only"
          badgeTone="info"
        />
        <MetricCard
          label="Impressions"
          value={metaConnected ? summary.impressions.toLocaleString(locale) : 'Unavailable'}
          help={`${summary.metricSource} · ${summary.dateRange}`}
          badge="Reported"
          badgeTone="muted"
        />
        <MetricCard
          label="Campaigns"
          value={metaConnected ? String(summary.campaigns) : 'Unavailable'}
          help="Campaign records currently available."
          badge={meta?.status ?? 'DISCONNECTED'}
          badgeTone={meta?.status === 'CONNECTED' ? 'success' : 'muted'}
        />
        <MetricCard
          label="CTR"
          value={summary.ctr == null ? 'Unavailable' : `${summary.ctr.toFixed(2)}%`}
          help="Clicks divided by Meta-reported impressions."
          badge="Reported"
          badgeTone="info"
        />
        <MetricCard
          label="CPC"
          value={
            summary.cpc == null
              ? 'Unavailable'
              : formatMoney(summary.cpc, reportingCurrency, locale)
          }
          help="Meta-reported spend divided by clicks."
          badge="Reported"
          badgeTone="info"
        />
        <MetricCard
          label="ROAS"
          value={summary.roas == null ? 'Unavailable' : `${summary.roas.toFixed(2)}×`}
          help="Only shown when Meta reports purchase value."
          badge={summary.roas == null ? 'No attribution' : 'Reported'}
          badgeTone={summary.roas == null ? 'muted' : 'info'}
        />
        <MetricCard
          label="Clicks"
          value={String(summary.clicks)}
          help="Synced click count from read-only snapshots."
          badge="Insights"
          badgeTone="muted"
        />
        <MetricCard
          label="Drafts"
          value={String(summary.draftActions)}
          help="Marketing actions waiting for review."
          badge="Approval"
          badgeTone={summary.draftActions ? 'warning' : 'success'}
        />
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <h2 className="section-title">Connected channels</h2>
          <div className="step-list" style={{ marginTop: 16 }}>
            {[
              ['Meta Ads', meta],
              ['Facebook Page', facebook],
              ['Instagram', instagram],
            ].map(([label, integration]) => (
              <div className="step-item" key={String(label)}>
                <span className="step-number">{String(label).slice(0, 2).toUpperCase()}</span>
                <div>
                  <p className="step-title">{String(label)}</p>
                  <p className="step-copy">
                    <IntegrationHealthBadge
                      state={integrationHealthState({
                        status: (integration as { status?: string } | undefined)?.status,
                      })}
                    />{' '}
                    Read-only and draft-first. Shopy will not launch ads, edit budgets, or publish
                    posts.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="section-title">Draft-first safety</h2>
          <p className="section-description">
            Marketing automation can draft review notes, content ideas, and budget suggestions.
            Execution is disabled in this phase.
          </p>
        </SurfaceCard>
      </section>

      {campaigns.length === 0 ? (
        <EmptyState
          icon="AD"
          title="No campaign snapshots yet"
          description="Connect Meta Ads in Settings and run a dry-run sync to prepare campaign reporting. No ad budget will be changed."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Objective</th>
                <th>Spend</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>Purchases</th>
                <th>Reported value</th>
                <th>ROAS</th>
                <th>Last synced</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const metric = campaign.metrics?.[0];
                return (
                  <tr key={campaign.id}>
                    <td className="strong-cell">{campaign.name}</td>
                    <td>
                      <StatusBadge tone={campaign.status === 'ACTIVE' ? 'success' : 'muted'}>
                        {campaign.status}
                      </StatusBadge>
                    </td>
                    <td>{campaign.objective ?? '-'}</td>
                    <td>
                      {metric
                        ? formatMoney(metric.spend, reportingCurrency, locale)
                        : 'Unavailable'}
                    </td>
                    <td>{metric ? metric.impressions.toLocaleString(locale) : 'Unavailable'}</td>
                    <td>{metric ? metric.clicks.toLocaleString(locale) : 'Unavailable'}</td>
                    <td>
                      {metric?.ctr == null ? 'Unavailable' : `${Number(metric.ctr).toFixed(2)}%`}
                    </td>
                    <td>
                      {metric?.cpc == null
                        ? 'Unavailable'
                        : formatMoney(metric.cpc, reportingCurrency, locale)}
                    </td>
                    <td>{metric ? metric.conversions.toLocaleString(locale) : 'Unavailable'}</td>
                    <td>
                      {metric && Number(metric.revenue) > 0
                        ? formatMoney(metric.revenue, reportingCurrency, locale)
                        : 'Unavailable'}
                    </td>
                    <td>
                      {metric?.roas == null ? 'Unavailable' : `${Number(metric.roas).toFixed(2)}×`}
                    </td>
                    <td>
                      {metric ? new Date(metric.date).toLocaleDateString(locale) : 'Not synced'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

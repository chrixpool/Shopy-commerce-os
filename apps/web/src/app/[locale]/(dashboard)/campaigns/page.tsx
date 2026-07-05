import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';
import { apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface MarketingSummary {
  campaigns: number;
  draftActions: number;
  spend: number;
  clicks: number;
  conversions: number;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective?: string | null;
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
    }),
    optionalApiFetch<Campaign[]>('/api/v1/marketing/meta-ads/campaigns', []),
    optionalApiFetch<Array<{ provider: string; status: string; mode: string }>>(
      '/api/v1/integrations',
      [],
    ),
    optionalApiFetch<{ baseCurrency: string }>('/api/v1/settings/organization', {
      baseCurrency: 'USD',
    }),
  ]);

  const meta = integrations.find((integration) => integration.provider === 'META_ADS');
  const facebook = integrations.find((integration) => integration.provider === 'FACEBOOK_PAGE');
  const instagram = integrations.find((integration) => integration.provider === 'INSTAGRAM');

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

      <section className="stats-grid" aria-label="Marketing summary">
        <MetricCard
          label="Spend"
          value={formatMoney(summary.spend, settings.baseCurrency, locale)}
          help="Latest synced Meta spend. No budgets are changed."
          badge="Read-only"
          badgeTone="info"
        />
        <MetricCard
          label="Campaigns"
          value={String(summary.campaigns)}
          help="Campaign records currently available."
          badge={meta?.status ?? 'DISCONNECTED'}
          badgeTone={meta?.status === 'CONNECTED' ? 'success' : 'muted'}
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
                    <StatusBadge
                      tone={
                        (integration as { status?: string } | undefined)?.status === 'CONNECTED'
                          ? 'success'
                          : 'muted'
                      }
                    >
                      {(integration as { status?: string } | undefined)?.status ?? 'DISCONNECTED'}
                    </StatusBadge>{' '}
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
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="strong-cell">{campaign.name}</td>
                  <td>{campaign.status}</td>
                  <td>{campaign.objective ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

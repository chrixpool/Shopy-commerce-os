import Link from 'next/link';
import { PageHeader, StatusBadge, SurfaceCard } from '@/components/ui/page';

const GUIDES = [
  {
    title: 'Connect Shopify',
    badge: 'Read-only',
    copy: 'Open Settings, choose Shopify, enter store domain, Client ID, and Client Secret, then run Connect & test. Use Dry-run sync before importing.',
    href: 'settings',
  },
  {
    title: 'Import orders',
    badge: 'Manual or CSV',
    copy: 'Create a single order from New order or paste CSV rows in Orders. Workspace currency applies to imported money values.',
    href: 'orders',
  },
  {
    title: 'Confirm orders',
    badge: 'Call center',
    copy: 'Use Confirmation to call customers, mark unreachable customers, and move confirmed orders into fulfillment.',
    href: 'confirmation',
  },
  {
    title: 'Fulfill and deliver',
    badge: 'Operations',
    copy: 'Pack confirmed orders in Fulfillment, then dispatch and close parcels in Delivery using manual status updates.',
    href: 'fulfillment',
  },
  {
    title: 'Calculate margin',
    badge: 'Factory',
    copy: 'Add factories, product unit costs, reusable components, and expenses. Recalculate margins to update order profitability.',
    href: 'factory',
  },
  {
    title: 'Automate safely',
    badge: 'Dry-run',
    copy: 'Use Automations for internal suggestions and draft actions. External writes, publishing, ads, and messages remain disabled.',
    href: 'automations',
  },
];

const BETA_CHECKLIST = [
  'Connect Shopify and verify totals',
  'Run Shopify sync twice and confirm duplicates do not increase',
  'Open one imported order in Order Control Center',
  'Confirm, pack, dispatch, and close one test workflow',
  'Assign product costs and recalculate margin',
  'Check webhook activity and Activity timeline',
  'Review the mobile workflow before handing to operators',
];

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operating manual"
        title="Help"
        description="Concise guides for running Shopy without paid services, automatic messages, Shopify writes, or ad-budget changes."
      />

      <section className="queue-grid" aria-label="Shopy workflow guides">
        {GUIDES.map((guide) => (
          <SurfaceCard key={guide.title}>
            <div className="queue-card-header">
              <div>
                <h2 className="section-title">{guide.title}</h2>
                <p className="section-description">{guide.copy}</p>
              </div>
              <StatusBadge tone="info">{guide.badge}</StatusBadge>
            </div>
            <div className="button-row">
              <Link
                className="button button-secondary"
                href={`/${locale}/${guide.href}`}
                prefetch={false}
              >
                Open workflow
              </Link>
            </div>
          </SurfaceCard>
        ))}
      </section>

      <SurfaceCard>
        <div className="section-header">
          <div>
            <h2 className="section-title">Safety model</h2>
            <p className="section-description">
              Shopy is designed for operational control first. External integrations import or draft
              work; they do not modify Shopify, Meta Ads, Facebook, Instagram, email, SMS, or
              courier systems in this phase.
            </p>
          </div>
          <StatusBadge tone="success">Approval-gated</StatusBadge>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="section-header">
          <div>
            <h2 className="section-title">Operator beta checklist</h2>
            <p className="section-description">
              Use this checklist before inviting a real team into the workspace.
            </p>
          </div>
          <StatusBadge tone="info">Beta readiness</StatusBadge>
        </div>
        <div className="step-list" style={{ marginTop: 18 }}>
          {BETA_CHECKLIST.map((item, index) => (
            <div className="step-item" key={item}>
              <span className="step-number">{index + 1}</span>
              <div>
                <p className="step-title">{item}</p>
                <p className="step-copy">Complete and verify before scaling daily operations.</p>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

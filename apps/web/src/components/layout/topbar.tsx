'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import type { Session } from 'next-auth';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'AR' },
];

const TITLES: Record<string, string> = {
  dashboard: 'dashboard',
  orders: 'orders',
  confirmation: 'confirmation',
  fulfillment: 'fulfillment',
  delivery: 'delivery',
  automations: 'automations',
  campaigns: 'campaigns',
  inventory: 'inventory',
  factory: 'factory',
  finance: 'finance',
  activity: 'activity',
  help: 'help',
  team: 'team',
  settings: 'settings',
};

const SUBTITLES: Record<string, string> = {
  dashboard: "Command center for today's commerce work.",
  orders: 'Review and move connected orders through operations.',
  confirmation: 'Prioritize customer follow-ups and confirmation outcomes.',
  fulfillment: 'Track packing work and inventory readiness.',
  delivery: 'Monitor parcels, failures, and final delivery status.',
  automations: 'Review rules, draft actions, and provider activity.',
  campaigns: 'Read channel performance and marketing recommendations.',
  inventory: 'Control stock, product data, and low-stock risk.',
  factory: 'Manage factories, unit costs, expenses, and margin signals.',
  finance: 'Track revenue, COGS, expenses, and gross margin.',
  activity: 'Review imports, order movement, automations, and sync history.',
  help: 'Use concise operating guides for the core Shopy workflows.',
  team: 'Manage members, roles, and local invite links.',
  settings: 'Workspace, currency, and integration controls.',
};

interface TopbarProps {
  session: Session;
  locale: string;
  onMenuClick: () => void;
}

export function Topbar({ session, locale, onMenuClick }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('nav');
  const activeSegment = pathname.split('/')[2] ?? 'dashboard';
  const titleKey = TITLES[activeSegment] ?? 'dashboard';

  function switchLocale(newLocale: string) {
    const withoutLocale = window.location.pathname.replace(/^\/(en|fr|ar)/, '');
    router.push(`/${newLocale}${withoutLocale}`);
  }

  return (
    <header className="topbar">
      <div className="topbar-context">
        <button
          aria-label="Toggle navigation"
          className="icon-button menu-button"
          onClick={onMenuClick}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div>
          <div className="topbar-title">{t(titleKey)}</div>
          <div className="topbar-subtitle">
            {SUBTITLES[activeSegment] ?? 'Keep the next business action clear.'}
          </div>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="topbar-status" aria-label="Workspace status">
          <span className="workspace-pulse" aria-hidden="true" />
          <span>Live operations</span>
        </div>

        <select
          aria-label="Switch language"
          className="locale-select"
          value={locale}
          onChange={(event) => switchLocale(event.target.value)}
        >
          {LOCALES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>

        <div className="user-chip" title={session.user?.email ?? undefined}>
          <span className="avatar" aria-hidden="true">
            {session.user?.name?.[0]?.toUpperCase() ?? 'O'}
          </span>
          <span className="chip-text">{session.user?.organizationName ?? 'Workspace'}</span>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => signOut({ callbackUrl: `/${locale}/sign-in` })}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface NavItem {
  key: string;
  href: string;
  icon: IconName;
}

const WORK_ITEMS: NavItem[] = [
  { key: 'dashboard', href: 'dashboard', icon: 'dashboard' },
  { key: 'orders', href: 'orders', icon: 'orders' },
  { key: 'confirmation', href: 'confirmation', icon: 'confirmation' },
  { key: 'fulfillment', href: 'fulfillment', icon: 'fulfillment' },
  { key: 'delivery', href: 'delivery', icon: 'delivery' },
];

const GROWTH_ITEMS: NavItem[] = [
  { key: 'automations', href: 'automations', icon: 'automations' },
  { key: 'campaigns', href: 'campaigns', icon: 'campaigns' },
  { key: 'inventory', href: 'inventory', icon: 'inventory' },
  { key: 'finance', href: 'finance', icon: 'finance' },
];

const ADMIN_ITEMS: NavItem[] = [
  { key: 'team', href: 'team', icon: 'team' },
  { key: 'settings', href: 'settings', icon: 'settings' },
];

type IconName =
  | 'dashboard'
  | 'orders'
  | 'confirmation'
  | 'fulfillment'
  | 'delivery'
  | 'automations'
  | 'campaigns'
  | 'inventory'
  | 'finance'
  | 'team'
  | 'settings';

function NavGroup({
  title,
  items,
  locale,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  locale: string;
  pathname: string;
  onNavigate: () => void;
}) {
  const t = useTranslations('nav');

  return (
    <div className="nav-section">
      <p className="nav-heading">{title}</p>
      <ul className="nav-list">
        {items.map((item) => {
          const href = `/${locale}/${item.href}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={item.key}>
              <Link
                href={href}
                prefetch
                className={`nav-link${isActive ? ' nav-link-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span className="nav-icon" aria-hidden="true">
                  <NavIcon name={item.icon} />
                </span>
                <span>{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar({
  locale,
  isOpen,
  onClose,
}: {
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`} aria-hidden={!isOpen}>
      <Link className="sidebar-brand" href={`/${locale}/dashboard`} onClick={onClose}>
        <span className="brand-mark">S</span>
        <span className="brand-copy">
          <span className="brand-name">Shopy</span>
          <span className="brand-subtitle">Operations cockpit</span>
        </span>
      </Link>

      <nav aria-label="Main navigation">
        <NavGroup
          title="Operate"
          items={WORK_ITEMS}
          locale={locale}
          pathname={pathname}
          onNavigate={onClose}
        />
        <NavGroup
          title="Grow"
          items={GROWTH_ITEMS}
          locale={locale}
          pathname={pathname}
          onNavigate={onClose}
        />
        <NavGroup
          title="Manage"
          items={ADMIN_ITEMS}
          locale={locale}
          pathname={pathname}
          onNavigate={onClose}
        />
      </nav>

      <div className="sidebar-footer">
        <span className="badge badge-info">Operations workspace</span>
        <p className="section-description">
          Manual workflows, CSV intake, local rules, and database-backed queues are enabled.
        </p>
      </div>
    </aside>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const icons: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <path d="M4 5h7v6H4z" />
        <path d="M13 5h7v4h-7z" />
        <path d="M13 11h7v8h-7z" />
        <path d="M4 13h7v6H4z" />
      </>
    ),
    orders: (
      <>
        <path d="M7 4h10l2 4v12H5V8z" />
        <path d="M7 8h10" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </>
    ),
    confirmation: (
      <>
        <path d="M5 6h14v12H5z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    fulfillment: (
      <>
        <path d="M4 8 12 4l8 4-8 4z" />
        <path d="M4 8v8l8 4 8-4V8" />
        <path d="M12 12v8" />
      </>
    ),
    delivery: (
      <>
        <path d="M4 7h10v9H4z" />
        <path d="M14 10h3l3 3v3h-6z" />
        <path d="M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        <path d="M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </>
    ),
    automations: (
      <>
        <path d="M7 7h5v5H7z" />
        <path d="M12 9h4a3 3 0 0 1 0 6h-1" />
        <path d="M17 15 15 13l-2 2" />
        <path d="M7 17h5" />
      </>
    ),
    campaigns: (
      <>
        <path d="M5 11v6h3l8 3V4L8 7H5z" />
        <path d="M18 9a3 3 0 0 1 0 6" />
      </>
    ),
    inventory: (
      <>
        <path d="M5 6h14v4H5z" />
        <path d="M7 10v9h10v-9" />
        <path d="M10 14h4" />
      </>
    ),
    finance: (
      <>
        <path d="M5 19V5" />
        <path d="M5 19h14" />
        <path d="M8 15l3-3 3 2 4-6" />
      </>
    ),
    team: (
      <>
        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M17 10a2.5 2.5 0 1 0 0-5" />
        <path d="M4 19a5 5 0 0 1 10 0" />
        <path d="M14 17a4 4 0 0 1 6 2" />
      </>
    ),
    settings: (
      <>
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
      </>
    ),
  };

  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      {icons[name]}
    </svg>
  );
}

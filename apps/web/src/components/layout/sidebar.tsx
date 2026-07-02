'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface NavItem {
  key: string;
  href: string;
  icon: string;
}

const WORK_ITEMS: NavItem[] = [
  { key: 'dashboard', href: 'dashboard', icon: 'DB' },
  { key: 'orders', href: 'orders', icon: 'OR' },
  { key: 'confirmation', href: 'confirmation', icon: 'CF' },
  { key: 'fulfillment', href: 'fulfillment', icon: 'PK' },
  { key: 'delivery', href: 'delivery', icon: 'DL' },
];

const GROWTH_ITEMS: NavItem[] = [
  { key: 'campaigns', href: 'campaigns', icon: 'AD' },
  { key: 'inventory', href: 'inventory', icon: 'IN' },
  { key: 'finance', href: 'finance', icon: 'FN' },
];

const ADMIN_ITEMS: NavItem[] = [
  { key: 'team', href: 'team', icon: 'TM' },
  { key: 'settings', href: 'settings', icon: 'ST' },
];

function NavGroup({
  title,
  items,
  locale,
  pathname,
}: {
  title: string;
  items: NavItem[];
  locale: string;
  pathname: string;
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
                className={`nav-link${isActive ? ' nav-link-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
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

export function Sidebar({ locale }: { locale: string }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link className="sidebar-brand" href={`/${locale}/dashboard`}>
        <span className="brand-mark">O</span>
        <span className="brand-copy">
          <span className="brand-name">Shopy</span>
          <span className="brand-subtitle">Commerce CRM</span>
        </span>
      </Link>

      <nav aria-label="Main navigation">
        <NavGroup title="Operate" items={WORK_ITEMS} locale={locale} pathname={pathname} />
        <NavGroup title="Grow" items={GROWTH_ITEMS} locale={locale} pathname={pathname} />
        <NavGroup title="Manage" items={ADMIN_ITEMS} locale={locale} pathname={pathname} />
      </nav>

      <div className="sidebar-footer">
        <span className="badge badge-info">Demo workspace</span>
        <p className="section-description">
          Authentication is temporarily bypassed while the product UI is reviewed.
        </p>
      </div>
    </aside>
  );
}

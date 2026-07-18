'use client';

import { useState } from 'react';
import type { Session } from 'next-auth';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell({
  children,
  locale,
  session,
}: {
  children: React.ReactNode;
  locale: string;
  session: Session;
}) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  return (
    <div className={`app-shell${isSidebarExpanded ? ' sidebar-expanded' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Sidebar locale={locale} isExpanded={isSidebarExpanded} />
      <div className="app-main">
        <Topbar
          session={session}
          locale={locale}
          onMenuClick={() => setIsSidebarExpanded((value) => !value)}
        />
        <main className="content-area" id="main-content" tabIndex={-1}>
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}

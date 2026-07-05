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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar locale={locale} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <button
        aria-label="Close navigation"
        className={`sidebar-scrim${isSidebarOpen ? ' sidebar-scrim-visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        type="button"
      />
      <div className="app-main">
        <Topbar
          session={session}
          locale={locale}
          onMenuClick={() => setIsSidebarOpen((value) => !value)}
        />
        <main className="content-area">
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}

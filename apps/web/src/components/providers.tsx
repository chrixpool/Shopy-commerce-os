'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function healthUrl() {
  const base = apiBase.replace(/\/$/, '');
  return base.endsWith('/api/v1') ? `${base}/health` : `${base}/api/v1/health`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);

    fetch(healthUrl(), { signal: controller.signal, cache: 'no-store' }).catch(() => {
      // Render Free can be waking up; page-level API states handle visible failures.
    });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}

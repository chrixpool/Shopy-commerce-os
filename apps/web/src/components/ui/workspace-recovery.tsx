'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function WorkspaceRecovery({
  active,
  message = 'The workspace API is starting. This usually takes a few seconds.',
}: {
  active: boolean;
  message?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!active) {
      sessionStorage.removeItem(`shopy-recovery:${pathname}`);
      return;
    }

    const key = `shopy-recovery:${pathname}`;
    const attempts = Number(sessionStorage.getItem(key) ?? 0);
    if (attempts >= 3) return;

    const timer = window.setTimeout(() => {
      sessionStorage.setItem(key, String(attempts + 1));
      setRetrying(true);
      router.refresh();
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [active, pathname, router]);

  if (!active) return null;

  return (
    <div className="status-banner status-banner-warning" role="status">
      <div>
        <strong>{retrying ? 'Reconnecting to Shopy...' : 'Starting workspace...'}</strong>
        <p>{message}</p>
      </div>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => {
          setRetrying(true);
          router.refresh();
        }}
      >
        Retry now
      </button>
    </div>
  );
}

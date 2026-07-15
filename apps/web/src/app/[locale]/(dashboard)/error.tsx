'use client';

import { useEffect, useState } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const isAuthFailure =
    error.message.includes('session is no longer valid') ||
    error.message.includes('Not authenticated') ||
    error.message.includes('401') ||
    error.message.includes('403');
  const isApiFailure =
    error.message.includes('API request failed') ||
    error.message.includes('fetch failed') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('Shopy API') ||
    error.message.includes('workspace API is starting') ||
    error.message.includes('workspace service could not be reached');

  useEffect(() => {
    if (!isApiFailure) return;
    const key = `shopy-error-recovery:${window.location.pathname}`;
    const attempts = Number(window.sessionStorage.getItem(key) ?? 0);
    if (attempts >= 2) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(key, String(attempts + 1));
      setRetrying(true);
      window.location.reload();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [isApiFailure]);

  return (
    <div className="page-stack">
      <div className="empty-state">
        <div>
          <span className="empty-icon" aria-hidden="true">
            ER
          </span>
          <h1 className="empty-title">
            {isAuthFailure
              ? 'Your session has ended'
              : isApiFailure
                ? 'Starting workspace'
                : 'This view is temporarily unavailable'}
          </h1>
          <p className="empty-description">
            {isAuthFailure
              ? 'Sign in again to continue working in Shopy.'
              : isApiFailure
                ? 'The workspace API is starting. This usually takes a few seconds and will not affect your data.'
                : 'We could not refresh this business view. Retry without leaving the page.'}
          </p>
          <div className="actions-row" style={{ justifyContent: 'center', marginTop: 18 }}>
            {isAuthFailure ? (
              <a className="button button-primary" href="../sign-in">
                Sign in again
              </a>
            ) : (
              <button
                className="button button-primary"
                type="button"
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  if (isApiFailure) window.location.reload();
                  else reset();
                }}
              >
                {retrying ? 'Reconnecting...' : 'Retry view'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

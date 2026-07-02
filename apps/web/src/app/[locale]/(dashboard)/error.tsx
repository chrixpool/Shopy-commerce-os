'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isApiFailure =
    error.message.includes('API request failed') ||
    error.message.includes('fetch failed') ||
    error.message.includes('ECONNREFUSED');

  return (
    <div className="page-stack">
      <div className="empty-state">
        <div>
          <span className="empty-icon" aria-hidden="true">
            ER
          </span>
          <h1 className="empty-title">
            {isApiFailure ? 'API unavailable' : 'Something went wrong'}
          </h1>
          <p className="empty-description">
            {isApiFailure
              ? 'The local API is not responding. Start Postgres and run pnpm dev, then try again.'
              : 'The page could not load. Try again or return to the dashboard.'}
          </p>
          <div className="actions-row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <button className="button button-primary" type="button" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

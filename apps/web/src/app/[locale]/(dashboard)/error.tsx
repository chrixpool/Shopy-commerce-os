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
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('Shopy API');

  return (
    <div className="page-stack">
      <div className="empty-state">
        <div>
          <span className="empty-icon" aria-hidden="true">
            ER
          </span>
          <h1 className="empty-title">
            {isApiFailure ? 'Connecting to Shopy API' : 'We could not load this view'}
          </h1>
          <p className="empty-description">
            {isApiFailure
              ? 'The workspace service may be starting on the free hosting tier. Please retry in a moment.'
              : 'Please retry. If the issue continues, return to the dashboard and reopen this view.'}
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

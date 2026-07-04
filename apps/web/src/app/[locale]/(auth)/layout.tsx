export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="auth-brand auth-brand-large">
          <span className="auth-logo" aria-hidden="true">
            S
          </span>
          <span className="auth-brand-name">Shopy</span>
        </div>
        <h1>Commerce operations cockpit for teams that move fast.</h1>
        <p>
          Control orders, confirmation, fulfillment, delivery, inventory, and workspace access from
          one focused operating system.
        </p>
        <div className="auth-proof-grid">
          <span>Database-backed workflows</span>
          <span>Manual-first operations</span>
          <span>Currency-aware workspace</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden="true">
            S
          </span>
          <span className="auth-brand-name">Shopy</span>
        </div>
        {children}
      </div>
    </div>
  );
}

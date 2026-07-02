export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden="true">
            O
          </span>
          <span className="auth-brand-name">Shopy</span>
        </div>
        {children}
      </div>
    </div>
  );
}

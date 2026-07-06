'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function healthUrl() {
  const base = apiBase.replace(/\/$/, '');
  return base.endsWith('/api/v1') ? `${base}/health` : `${base}/api/v1/health`;
}

export function SignInForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWarming, setIsWarming] = useState(true);
  const warmupPromise = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    warmupPromise.current = fetch(healthUrl(), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => setIsWarming(false));

    return () => controller.abort();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    if (isWarming) {
      await Promise.race([
        warmupPromise.current,
        new Promise((resolve) => window.setTimeout(resolve, 15000)),
      ]);
    }

    const formData = new FormData(event.currentTarget);
    const result = await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError(
        'Invalid email or password. If this took a long time, the free API may still be waking up.',
      );
      return;
    }

    router.replace(`/${locale}/dashboard`);
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Welcome back</p>
        <h1 className="auth-title">Sign in to Shopy</h1>
        <p className="auth-copy">Use your workspace account or the sample credentials below.</p>
      </div>

      <label className="form-field">
        <span>Email</span>
        <input className="field" name="email" type="email" defaultValue="demo@Shopy.app" required />
      </label>

      <div className="auth-helper">
        <span>Sample workspace</span>
        <code>demo@Shopy.app / Demo12345!</code>
      </div>

      <label className="form-field">
        <span>Password</span>
        <input
          className="field"
          name="password"
          type="password"
          defaultValue="Demo12345!"
          required
          minLength={8}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      {isWarming || isSubmitting ? (
        <p className="form-status" role="status" aria-live="polite">
          {isSubmitting
            ? 'Checking your workspace. Free hosting can take a moment after sleeping.'
            : 'Starting the Shopy API so sign-in is ready.'}
        </p>
      ) : null}

      <button className="button button-primary button-block" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Opening workspace...' : isWarming ? 'Start and sign in' : 'Sign in'}
      </button>

      <p className="auth-footnote">
        New workspace? <Link href={`/${locale}/sign-up`}>Create an account</Link>
      </p>
    </form>
  );
}

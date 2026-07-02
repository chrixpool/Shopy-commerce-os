'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState, type FormEvent } from 'react';

export function SignInForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const result = await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError('Invalid email or password.');
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
        <p className="auth-copy">Use the seeded demo account or your workspace account.</p>
      </div>

      <label className="form-field">
        <span>Email</span>
        <input className="field" name="email" type="email" defaultValue="demo@Shopy.app" required />
      </label>

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

      <button className="button button-primary button-block" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>

      <p className="auth-footnote">
        New workspace? <Link href={`/${locale}/sign-up`}>Create an account</Link>
      </p>
    </form>
  );
}

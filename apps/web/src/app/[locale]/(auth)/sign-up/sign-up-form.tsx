'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState, type FormEvent } from 'react';

const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SignUpForm({ locale }: { locale: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password,
      organizationName: String(formData.get('organizationName') ?? ''),
    };

    const response = await fetch(`${PUBLIC_API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError('Could not create the workspace. Try another email or workspace name.');
      setIsSubmitting(false);
      return;
    }

    const result = await signIn('credentials', {
      email: payload.email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError('Workspace created, but sign-in failed. Please sign in manually.');
      return;
    }

    router.replace(`/${locale}/dashboard`);
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Create workspace</p>
        <h1 className="auth-title">Start using Shopy</h1>
        <p className="auth-copy">Create an owner account and a default organization.</p>
      </div>

      <label className="form-field">
        <span>Name</span>
        <input className="field" name="name" type="text" required minLength={2} />
      </label>

      <label className="form-field">
        <span>Email</span>
        <input className="field" name="email" type="email" required />
      </label>

      <label className="form-field">
        <span>Workspace</span>
        <input
          className="field"
          name="organizationName"
          type="text"
          defaultValue="My Store"
          required
        />
      </label>

      <label className="form-field">
        <span>Password</span>
        <input className="field" name="password" type="password" required minLength={8} />
      </label>

      <label className="form-field">
        <span>Confirm password</span>
        <input className="field" name="confirmPassword" type="password" required minLength={8} />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="button button-primary button-block" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Creating...' : 'Create workspace'}
      </button>

      <p className="auth-footnote">
        Already have an account? <Link href={`/${locale}/sign-in`}>Sign in</Link>
      </p>
    </form>
  );
}

import Link from 'next/link';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';

async function signInAction(locale: string, formData: FormData) {
  'use server';

  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: `/${locale}/dashboard`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/${locale}/sign-in?error=credentials`);
    }
    throw error;
  }
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const session = await auth();

  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <form className="auth-card" action={signInAction.bind(null, locale)}>
      <div>
        <p className="eyebrow">Welcome back</p>
        <h1 className="auth-title">Sign in to Shopy</h1>
        <p className="auth-copy">Use your Shopy workspace owner account.</p>
      </div>

      <label className="form-field">
        <span>Email</span>
        <input
          className="field"
          name="email"
          type="email"
          defaultValue="Oussemawarteni@shopy.com"
          required
        />
      </label>

      <div className="auth-helper">
        <span>Workspace owner</span>
        <code>Oussemawarteni@shopy.com</code>
      </div>

      <label className="form-field">
        <span>Password</span>
        <input className="field" name="password" type="password" required minLength={8} />
      </label>

      {query.error ? (
        <p className="form-error">
          Invalid email or password. If this took a long time, the free API may still be waking up.
        </p>
      ) : null}

      <button className="button button-primary button-block" type="submit">
        Sign in
      </button>

      <p className="auth-footnote">
        New workspace? <Link href={`/${locale}/sign-up`}>Create an account</Link>
      </p>
    </form>
  );
}

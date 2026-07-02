import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SignInForm } from './sign-in-form';

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return <SignInForm locale={locale} />;
}

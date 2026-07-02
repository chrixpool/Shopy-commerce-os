import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SignUpForm } from './sign-up-form';

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  return <SignUpForm locale={locale} />;
}

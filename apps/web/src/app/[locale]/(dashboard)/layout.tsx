import { AppShell } from '@/components/layout/app-shell';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (!session) {
    redirect(`/${locale}/sign-in`);
  }

  return (
    <AppShell session={session} locale={locale}>
      {children}
    </AppShell>
  );
}

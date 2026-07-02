import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
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
    <div className="app-shell">
      <Sidebar locale={locale} />
      <div className="app-main">
        <Topbar session={session} locale={locale} />
        <main className="content-area">
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';

// Move the dashboard page into the (dashboard) group
export default function DashboardRedirect() {
  redirect('dashboard');
}

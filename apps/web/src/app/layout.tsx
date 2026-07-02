import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Shopy',
    template: '%s | Shopy',
  },
  description: 'commerce operations cockpit',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

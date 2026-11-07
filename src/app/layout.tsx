import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'OCD — Open Code Developers',
  description:
    'Track coding assignments between Mentors and Mentees. Automatically verify Codeforces & LeetCode problem submissions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}

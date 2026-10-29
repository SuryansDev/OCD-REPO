import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OCD — Open Club Developers',
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
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

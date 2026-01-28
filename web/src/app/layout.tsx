import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'D0T — I SEE YOU',
  description: 'Autonomous vision. I watch. I think. I act.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%2300ff00"/></svg>',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

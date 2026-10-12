import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'E-Voting Pemira Kampus | Langsung, Umum, Bebas, Rahasia, Jujur, Adil',
  description: 'Sistem Pemilihan Umum Raya Mahasiswa berbasis teknologi berkecepatan tinggi dan berintegritas.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

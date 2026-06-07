import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'SimpleCite — Agenda médica y cobros por WhatsApp',
  description:
    'Automatiza tus citas y cobra por QR sin salir de WhatsApp. Agenda online, recordatorios automáticos y pagos QR Simple para clínicas y consultorios en Bolivia.',
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

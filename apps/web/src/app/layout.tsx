import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { SmoothScroll } from '@/components/SmoothScroll';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SimpleCite — Agenda médica y cobros por WhatsApp',
  description:
    'Automatiza tus citas y cobra por QR sin salir de WhatsApp. Agenda online, recordatorios automáticos y pagos QR Simple para clínicas y consultorios en Bolivia.',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Aplica el tema guardado antes de pintar para evitar el flash.
            Claro por defecto (DESIGN.md: fondo blanco): el oscuro solo se
            activa si el usuario lo eligió con el toggle, nunca por el
            prefers-color-scheme del sistema. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('sc-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <SmoothScroll />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

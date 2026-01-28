import { ReactNode } from 'react';
import './globals.css';
import { Roboto } from 'next/font/google';

const roboto = Roboto({ 
  subsets: ['latin'],
  variable: '--font-roboto',
  weight: ['400', '500', '700']
});

export default function RootLayout({
  children,
  params: { locale }
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  return (
    <html lang={locale} suppressHydrationWarning className={roboto.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1DB954" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

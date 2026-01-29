import { ReactNode } from 'react';
import './globals.css';
import { Poppins } from 'next/font/google';

const poppins = Poppins({ 
  subsets: ['latin'],
  variable: '--font-poppins',
  weight: ['400', '500', '600', '700']
});

export default function RootLayout({
  children,
  params: { locale }
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  return (
    <html lang={locale} suppressHydrationWarning className={poppins.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00D68F" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

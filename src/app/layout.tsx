import { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({
  children,
  params: { locale }
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        {children}
      </body>
    </html>
  );
}

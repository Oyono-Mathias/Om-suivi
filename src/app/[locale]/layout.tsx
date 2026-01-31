import type { Metadata } from 'next';
import AppShell from '@/components/app-shell';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ShiftProvider } from '@/context/ShiftContext';
import { AdProvider } from '@/context/AdContext';
import { ReactNode } from 'react';
import '../globals.css';
import { Poppins } from 'next/font/google';
import { PwaInstallProvider } from '@/context/PwaInstallContext';

const poppins = Poppins({ 
  subsets: ['latin'],
  variable: '--font-poppins',
  weight: ['400', '500', '600', '700']
});

export const metadata: Metadata = {
  title: 'OM Suivi',
  description: 'Une application pour le suivi des heures supplémentaires.',
  manifest: '/manifest.json',
};

type Props = {
  children: ReactNode;
};

export default async function LocaleLayout({
  children,
}: Props) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className={poppins.variable}>
       <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PwaInstallProvider>
            <FirebaseClientProvider>
              <AdProvider>
                <ShiftProvider>
                  <AppShell>{children}</AppShell>
                </ShiftProvider>
              </AdProvider>
              <Toaster />
            </FirebaseClientProvider>
          </PwaInstallProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

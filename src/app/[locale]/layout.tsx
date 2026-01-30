
import type { Metadata } from 'next';
import AppShell from '@/components/app-shell';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ShiftProvider } from '@/context/ShiftContext';
import { AdProvider } from '@/context/AdContext';
import { ReactNode } from 'react';
import '../globals.css';
import { Poppins } from 'next/font/google';

const poppins = Poppins({ 
  subsets: ['latin'],
  variable: '--font-poppins',
  weight: ['400', '500', '600', '700']
});

export const metadata: Metadata = {
  title: 'OM Suivi',
  description: 'Une application pour le suivi des heures supplémentaires.',
};

type Props = {
  children: React.ReactNode;
  params: {locale: string};
};

export default async function LocaleLayout({
  children,
  params: {locale}
}: Props) {
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className={poppins.variable}>
       <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <FirebaseClientProvider>
            <AdProvider>
              <ShiftProvider>
                <AppShell>{children}</AppShell>
              </ShiftProvider>
            </AdProvider>
            <Toaster />
          </FirebaseClientProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

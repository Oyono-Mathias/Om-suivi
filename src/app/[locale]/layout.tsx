
import type { Metadata } from 'next';
import AppShell from '@/components/app-shell';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ShiftProvider } from '@/context/ShiftContext';
import { AdProvider } from '@/context/AdContext';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Prima Dee-Lite',
  description: 'Une application pour le suivi des heures supplémentaires.',
};

type Props = {
  children: React.ReactNode;
  params: {locale: string};
};

export default async function LocaleLayout({
  children,
  params
}: Props) {
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={params.locale} messages={messages}>
      <FirebaseClientProvider>
        <AdProvider>
          <ShiftProvider>
            <AppShell>{children}</AppShell>
          </ShiftProvider>
        </AdProvider>
        <Toaster />
      </FirebaseClientProvider>
    </NextIntlClientProvider>
  );
}

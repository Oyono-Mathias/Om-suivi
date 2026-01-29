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
  title: 'OM Suivi',
  description: 'Une application pour le suivi des heures supplémentaires.',
};

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages();

  return (
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
  );
}

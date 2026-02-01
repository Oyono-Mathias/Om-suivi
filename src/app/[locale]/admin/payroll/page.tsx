'use client';

import React from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Construction } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { doc } from 'firebase/firestore';
import type { Profile } from '@/lib/types';
import { AdminAccessDenied } from '@/components/admin-access-denied';

function AdminPayrollPageContent() {
    const t = useTranslations('AdminPayrollPage');
    
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                    <p className="text-muted-foreground">{t('description')}</p>
                </div>
            </div>

            <Alert className="border-dashed">
                <Construction className="h-4 w-4" />
                <AlertTitle>{t('comingSoonTitle')}</AlertTitle>
                <AlertDescription>
                    {t('comingSoonDescription')}
                </AlertDescription>
            </Alert>
        </div>
    );
}

export default function AdminPayrollPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const tShared = useTranslations('Shared');
  
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const isLoading = isUserLoading || isLoadingProfile;
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4">
        <p className="text-xl">{tShared('pleaseLogin')}</p>
        <Link href="/login">
          <Button>{tShared('loginButton')}</Button>
        </Link>
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return <AdminAccessDenied />;
  }

  return <AdminPayrollPageContent />;
}

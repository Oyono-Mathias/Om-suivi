'use client';

import React from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, User } from 'lucide-react';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import type { Profile } from '@/lib/types';
import { AdminAccessDenied } from '@/components/admin-access-denied';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash);
};
const avatarPlaceholders = PlaceHolderImages.filter(p => p.description.includes('Avatar'));

function AdminReportsPageContent() {
    const t = useTranslations('AdminReportsPage');
    const tProfile = useTranslations('ProfilePage');
    const firestore = useFirestore();

    const allProfilesQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name')), [firestore]);
    const { data: allProfiles, isLoading: isLoadingProfiles } = useCollection<Profile>(allProfilesQuery);

    if (isLoadingProfiles) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                    <p className="text-muted-foreground">{t('description')}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('selectUserTitle')}</CardTitle>
                    <CardDescription>{t('selectUserDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allProfiles && allProfiles.length > 0 ? (
                        allProfiles.map(profile => {
                            const userAvatar = avatarPlaceholders.length > 0 ? avatarPlaceholders[simpleHash(profile.id) % avatarPlaceholders.length] : null;
                            return (
                                <Link key={profile.id} href={{ pathname: '/admin/reports/[userId]', params: { userId: profile.id } }}>
                                    <Card className="flex items-center p-4 gap-4 cursor-pointer hover:bg-muted/50 transition-colors h-full">
                                        <Avatar className="h-12 w-12">
                                            <AvatarImage src={userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint} alt={profile.name} />
                                            <AvatarFallback>{profile.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <p className="font-medium">{profile.name}</p>
                                            <p className="text-sm text-muted-foreground">{profile.profession ? tProfile(`professions.${profile.profession}`) : ''}</p>
                                        </div>
                                    </Card>
                                </Link>
                            )
                        })
                    ) : (
                        <p className="text-muted-foreground col-span-full text-center py-8">{t('noUsersFound')}</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function AdminReportsPage() {
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

  return <AdminReportsPageContent />;
}

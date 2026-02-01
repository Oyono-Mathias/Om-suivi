'use client';

import React, { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, serverTimestamp, where, doc } from 'firebase/firestore';
import type { Profile, TimeEntry, LeaveAnnouncement } from '@/lib/types';
import { Loader2, PartyPopper, ShieldX } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { useTranslations, useLocale } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { format, parse } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { UserTimeEntriesSheet } from '@/components/user-time-entries-sheet';
import { PlaceHolderImages } from '@/lib/placeholder-images';

// Copied from team/page.tsx
const avatarPlaceholders = PlaceHolderImages.filter(p => p.description.includes('Avatar'));

const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

// Copied from team/page.tsx
function UserStatusCard({ user, onClick }: { user: Profile, onClick?: () => void }) {
  const t = useTranslations('TeamPage');
  const tProfile = useTranslations('ProfilePage');
  const locale = useLocale();
  const dateFnsLocale = locale === 'fr' ? fr : enUS;
  const firestore = useFirestore();

  const latestEntryQuery = useMemoFirebase(
    () => query(collection(firestore, 'users', user.id, 'timeEntries'), orderBy('date', 'desc'), orderBy('startTime', 'desc'), limit(1)),
    [firestore, user.id]
  );
  
  const { data: latestEntries, isLoading } = useCollection<TimeEntry>(latestEntryQuery);

  const statusInfo = useMemo(() => {
    if (isLoading) return { isOnline: false, label: '...' };
    if (!latestEntries || latestEntries.length === 0) return { isOnline: false, label: t('statusOffline') };
    
    const lastEntry = latestEntries[0];
    const isOnline = !lastEntry.endTime;

    if (isOnline) {
      return { isOnline: true, label: t('statusOnline') };
    } else {
      const lastSeenTime = parse(lastEntry.endTime, 'HH:mm', new Date());
      return {
          isOnline: false,
          label: t('lastSeen', { time: format(lastSeenTime, 'p', { locale: dateFnsLocale }) })
      };
    }
  }, [latestEntries, isLoading, t, dateFnsLocale]);

  const userAvatar = useMemo(() => {
    if (avatarPlaceholders.length === 0) return null;
    const hash = simpleHash(user.id);
    const index = hash % avatarPlaceholders.length;
    return avatarPlaceholders[index];
  }, [user.id]);

  const professionLabel = user.profession ? tProfile(`professions.${user.profession}`) : '';

  if(isLoading) {
    return (
        <Card className="flex items-center p-4 gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </div>
        </Card>
    )
  }

  return (
    <Card onClick={onClick} className={cn("flex items-center p-4 gap-4", onClick && "cursor-pointer hover:bg-muted/50 transition-colors")}>
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src={userAvatar?.imageUrl} data-ai-hint={userAvatar?.imageHint} alt={user.name} />
          <AvatarFallback>{user.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
        </Avatar>
        <span className={cn(
          "absolute bottom-0 right-0 block h-3.5 w-3.5 rounded-full border-2 border-card",
          statusInfo.isOnline ? 'bg-green-500' : 'bg-gray-400'
        )} />
      </div>
      <div className="flex-1">
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">{professionLabel}</p>
        <p className={cn("text-xs", statusInfo.isOnline ? 'text-green-400' : 'text-muted-foreground')}>{statusInfo.label}</p>
      </div>
    </Card>
  );
}

// Copied from admin/users/page.tsx
function AccessDenied() {
  const t = useTranslations('Shared');
  return (
    <div className="flex flex-col justify-center items-center h-screen text-center gap-4">
      <ShieldX className="w-16 h-16 text-destructive" />
      <h1 className="text-3xl font-bold">{t('accessDenied')}</h1>
      <p className="text-muted-foreground">{t('accessDeniedDescription')}</p>
      <Link href="/">
        <Button variant="outline">Retour à l'accueil</Button>
      </Link>
    </div>
  );
}


export default function LiveTrackingPage() {
  const t = useTranslations('LiveTrackingPage');
  const tTeam = useTranslations('TeamPage');
  const tShared = useTranslations('Shared');
  const { user: authUser, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [managingUser, setManagingUser] = useState<Profile | null>(null);

  const currentUserProfileRef = useMemoFirebase(() => {
    if (!authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);
  const { data: currentUserProfile, isLoading: isLoadingCurrentUserProfile } = useDoc<Profile>(currentUserProfileRef);

  const allProfilesQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name')), [firestore]);
  const { data: allProfiles, isLoading: isLoadingProfiles } = useCollection<Profile>(allProfilesQuery);

  const leaveAnnouncementsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return query(collection(firestore, 'leaveAnnouncements'), where('leaveStartDate', '==', todayStr));
  }, [firestore]);
  const { data: leaveAnnouncements, isLoading: isLoadingLeaveAnnouncements } = useCollection<LeaveAnnouncement>(leaveAnnouncementsQuery);

  const isAdmin = currentUserProfile?.role === 'admin';

  const isLoading = isUserLoading || isLoadingProfiles || isLoadingCurrentUserProfile || isLoadingLeaveAnnouncements;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4">
        <p className="text-xl">{tShared('pleaseLogin')}</p>
        <Link href="/login">
          <Button>{tShared('loginButton')}</Button>
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
      return <AccessDenied />;
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      {leaveAnnouncements && leaveAnnouncements.length > 0 && (
          <div className="space-y-2">
            {leaveAnnouncements.map(announcement => (
              <Alert key={announcement.id} className="bg-primary/10 border-primary/20 text-primary-foreground">
                <PartyPopper className="h-5 w-5 text-primary" />
                <AlertTitle className="font-semibold">Congés !</AlertTitle>
                <AlertDescription>
                  {tTeam('leaveAnnouncement', { name: announcement.userName })}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

      <Card>
        <CardHeader>
          <CardTitle>{tTeam('directoryTitle')}</CardTitle>
          <CardDescription>{tTeam('directoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-4">
              {allProfiles && allProfiles.length > 0 ? (
                allProfiles
                  .map((profile) => (
                    <UserStatusCard 
                        key={profile.id} 
                        user={profile} 
                        onClick={() => setManagingUser(profile)}
                    />
                ))
              ) : (
                <div className="text-center h-24 flex items-center justify-center">
                  <p>{tTeam('noUsersFound')}</p>
                </div>
              )}
            </div>
        </CardContent>
      </Card>
    </div>
    
    <UserTimeEntriesSheet 
        user={managingUser}
        onOpenChange={(open) => !open && setManagingUser(null)}
    />
    </>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, serverTimestamp, where } from 'firebase/firestore';
import type { Profile, TimeEntry, Announcement, LeaveAnnouncement } from '@/lib/types';
import { Loader2, Send, PartyPopper } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { useTranslations, useLocale } from 'next-intl';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc } from 'firebase/firestore';
import { format, parse } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { UserTimeEntriesSheet } from '@/components/user-time-entries-sheet';

// WhatsApp Icon Component
const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
        <title>WhatsApp</title>
        <path d="M12.04 0C5.43 0 0 5.43 0 12.04c0 2.21.59 4.29 1.66 6.09L0 24l6.09-1.65c1.8.97 3.88 1.55 6.09 1.55 6.61 0 12.04-5.43 12.04-12.04C24.08 5.43 18.65 0 12.04 0zM12.04 22.08c-1.9 0-3.68-.52-5.19-1.42l-.37-.22-3.85 1.04 1.06-3.75-.24-.38a9.96 9.96 0 0 1-1.5-5.29c0-5.52 4.49-10.01 10.01-10.01s10.01 4.49 10.01 10.01-4.49 10.01-10.01 10.01zM17.47 14.38c-.3-.15-1.76-.87-2.03-1-.27-.11-.47-.15-.67.15-.2.3-.77.87-.94 1.04-.18.18-.35.2-.64.04-.3-.15-1.25-.46-2.38-1.47s-1.8-1.74-2.11-2.04-.26-.35-.11-.54c.15-.2.3-.35.45-.52.15-.18.2-.22.3-.37.1-.15.05-.3-.02-.45-.07-.15-.67-1.61-.92-2.2-.25-.58-.5-.5-.67-.5h-.58c-.2 0-.52.07-.79.37-.27.3-.92.9-.92 2.19s.94 2.54 1.06 2.71c.12.18 1.84 2.81 4.46 3.93 2.62 1.12 2.62.74 3.1.72.47-.02 1.52-.62 1.73-1.22.21-.6.21-1.11.15-1.22-.06-.11-.25-.18-.55-.33z"/>
    </svg>
);


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
      {user.email && 
        <a href={`mailto:${user.email}`} aria-label={`Contact ${user.name}`} className="text-muted-foreground hover:text-primary transition-colors">
            <WhatsAppIcon className="h-7 w-7 fill-current" />
        </a>
      }
    </Card>
  );
}


export default function TeamPage() {
  const t = useTranslations('TeamPage');
  const tShared = useTranslations('Shared');
  const { user: authUser, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
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

  const announcementSchema = z.object({
    message: z.string().min(1, { message: "Message cannot be empty." }),
  });

  const form = useForm<z.infer<typeof announcementSchema>>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { message: '' },
  });

  const handleSendAnnouncement = async (values: z.infer<typeof announcementSchema>) => {
    if (!isAdmin || !currentUserProfile) return;

    const newAnnouncement: Omit<Announcement, 'id'> = {
      message: values.message,
      authorName: currentUserProfile.name,
      createdAt: serverTimestamp(),
    };
    await addDocumentNonBlocking(collection(firestore, 'announcements'), newAnnouncement);
    toast({ title: t('announcementSentSuccess') });
    setIsAnnouncementOpen(false);
    form.reset();
  };

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

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>
        </div>
        {isAdmin && (
            <Button onClick={() => setIsAnnouncementOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                {t('sendAnnouncement')}
            </Button>
        )}
      </div>

      {leaveAnnouncements && leaveAnnouncements.length > 0 && (
          <div className="space-y-2">
            {leaveAnnouncements.map(announcement => (
              <Alert key={announcement.id} className="bg-primary/10 border-primary/20 text-primary-foreground">
                <PartyPopper className="h-5 w-5 text-primary" />
                <AlertTitle className="font-semibold">Congés !</AlertTitle>
                <AlertDescription>
                  {t('leaveAnnouncement', { name: announcement.userName })}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

      <Card>
        <CardHeader>
          <CardTitle>{t('directoryTitle')}</CardTitle>
          <CardDescription>{t('directoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-4">
              {allProfiles && allProfiles.length > 0 ? (
                allProfiles
                  .map((profile) => (
                    <UserStatusCard 
                        key={profile.id} 
                        user={profile} 
                        onClick={isAdmin ? () => setManagingUser(profile) : undefined}
                    />
                ))
              ) : (
                <div className="text-center h-24 flex items-center justify-center">
                  <p>{t('noUsersFound')}</p>
                </div>
              )}
            </div>
        </CardContent>
      </Card>
    </div>
    
    {isAdmin && (
        <UserTimeEntriesSheet 
            user={managingUser}
            onOpenChange={(open) => !open && setManagingUser(null)}
        />
    )}

    <Dialog open={isAnnouncementOpen} onOpenChange={setIsAnnouncementOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('announcementDialogTitle')}</DialogTitle>
          <DialogDescription>{t('announcementDialogDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSendAnnouncement)} className="space-y-4">
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('messageLabel')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Votre message ici..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">{t("AdminPage.deleteEntryCancel")}</Button>
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('sendButton')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  );
}

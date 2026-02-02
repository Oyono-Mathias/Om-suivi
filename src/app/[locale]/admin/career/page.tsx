'use client';

import React, { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc, addDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, orderBy, setDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, TrendingUp, ShieldCheck, Gift, ChevronsRight, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Profile } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { AdminAccessDenied } from '@/components/admin-access-denied';
import { differenceInYears, differenceInMonths, addYears, differenceInDays } from 'date-fns';
import { salaryGrid } from '@/lib/salary-grid';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


// Helper function to get the next echelon and salary
const getNextAdvancement = (currentCategory?: string, currentEchelon?: string) => {
    if (!currentCategory || !currentEchelon) {
        return { nextEchelon: 'N/A', nextCategory: 'N/A', nextSalary: 0 };
    }
    const currentIndex = salaryGrid.findIndex(
        (entry) => entry.category === currentCategory && entry.echelon === currentEchelon
    );

    if (currentIndex === -1 || currentIndex + 1 >= salaryGrid.length) {
        return { nextEchelon: 'Max', nextCategory: 'Max', nextSalary: 0 };
    }
    const nextEntry = salaryGrid[currentIndex + 1];
    return {
        nextEchelon: nextEntry.echelon,
        nextCategory: nextEntry.category,
        nextSalary: nextEntry.sm,
    };
};

function UserAdvancementCard({ user, onApprove }: { user: Profile & { advancement: any }, onApprove: (user: Profile & { advancement: any }) => void }) {
    const t = useTranslations('AdminCareerPage');
    const [isConfirming, setIsConfirming] = useState(false);

    const handleApproveClick = () => {
        if (user.advancement.daysUntilNextMilestone > 0) {
            setIsConfirming(true);
        } else {
            onApprove(user);
        }
    };
    
    return (
        <Card className="flex flex-col">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">{user.name}</CardTitle>
                        <CardDescription>{user.email}</CardDescription>
                    </div>
                     <Badge variant="outline">{user.advancement.seniorityString}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-grow">
                 <p><span className="font-semibold">{t('hireDateLabel')}:</span> {new Date(user.hireDate!).toLocaleDateString()}</p>
                 <div className="flex items-center justify-center gap-4 text-center bg-muted/50 p-2 rounded-md">
                     <div>
                         <p className="text-xs text-muted-foreground">{t('currentEchelonLabel')}</p>
                         <p className="font-bold">{user.category}-{user.echelon}</p>
                     </div>
                     <ChevronsRight className="h-5 w-5 text-muted-foreground shrink-0"/>
                     <div>
                         <p className="text-xs text-muted-foreground">{t('nextEchelonLabel')}</p>
                         <p className="font-bold text-primary">{user.advancement.nextCategory}-{user.advancement.nextEchelon}</p>
                     </div>
                 </div>
                 <div className="flex items-center gap-2 text-primary">
                    <Gift className="h-4 w-4" />
                    <p>{t('futureBonusLabel')}</p>
                 </div>
            </CardContent>
            <div className="p-4 pt-0">
                 <Button className="w-full" onClick={handleApproveClick} disabled={user.advancement.isProcessing}>
                    {user.advancement.isProcessing ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                    <span>{t('approveButton')} ({user.advancement.daysUntilNextMilestone > 0 ? t('inXDays', {days: user.advancement.daysUntilNextMilestone}) : t('today')})</span>
                </Button>
            </div>
             <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirmEarlyTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('confirmEarlyDescription', {name: user.name, days: user.advancement.daysUntilNextMilestone})}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancelButton')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { onApprove(user); setIsConfirming(false); }}>{t('approveButton')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}


export default function AdminCareerPage() {
    const t = useTranslations('AdminCareerPage');
    const tShared = useTranslations('Shared');
    const tNotif = useTranslations('AdvancementNotification');
    const { user: adminUser, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [processingUsers, setProcessingUsers] = useState<string[]>([]);
    
    const adminProfileRef = useMemoFirebase(() => adminUser ? doc(firestore, 'users', adminUser.uid) : null, [firestore, adminUser]);
    const { data: adminProfile } = useDoc<Profile>(adminProfileRef);

    const allProfilesQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('hireDate', 'asc')), [firestore]);
    const { data: allProfiles, isLoading: isLoadingProfiles } = useCollection<Profile>(allProfilesQuery);

    const processedUsers = useMemo(() => {
        if (!allProfiles) return { alertUsers: [], otherUsers: [] };
        
        const now = new Date();
        const usersWithAdvancement = allProfiles
            .filter(user => user.hireDate && user.category && user.echelon)
            .map(user => {
                const hireDate = new Date(user.hireDate!);
                const seniorityYears = differenceInYears(now, hireDate);
                const seniorityMonths = differenceInMonths(now, hireDate) % 12;

                const nextMilestoneYears = (Math.floor(seniorityYears / 3) + 1) * 3;
                const nextMilestoneDate = addYears(hireDate, nextMilestoneYears);
                const daysUntilNextMilestone = differenceInDays(nextMilestoneDate, now);

                const { nextEchelon, nextCategory, nextSalary } = getNextAdvancement(user.category, user.echelon);

                return {
                    ...user,
                    advancement: {
                        seniorityYears,
                        seniorityString: `${seniorityYears}a ${seniorityMonths}m`,
                        daysUntilNextMilestone,
                        isAlert: daysUntilNextMilestone >= 0 && daysUntilNextMilestone <= 30,
                        nextEchelon,
                        nextCategory,
                        nextSalary,
                        isProcessing: processingUsers.includes(user.id),
                    }
                };
            });

        return {
            alertUsers: usersWithAdvancement.filter(u => u.advancement.isAlert),
            otherUsers: usersWithAdvancement.filter(u => !u.advancement.isAlert),
        };
    }, [allProfiles, processingUsers]);
    
    const handleApproveAdvancement = async (userToUpdate: Profile & { advancement: any }) => {
        setProcessingUsers(prev => [...prev, userToUpdate.id]);
        try {
            const userRef = doc(firestore, 'users', userToUpdate.id);
            await setDoc(userRef, {
                category: userToUpdate.advancement.nextCategory,
                echelon: userToUpdate.advancement.nextEchelon,
                monthlyBaseSalary: userToUpdate.advancement.nextSalary
            }, { merge: true });

            toast({
                title: t('successTitle'),
                description: t('successDescription', { name: userToUpdate.name, echelon: `${userToUpdate.advancement.nextCategory}-${userToUpdate.advancement.nextEchelon}` })
            });

            // Create notification for the user
            const newEchelon = `${userToUpdate.advancement.nextCategory}-${userToUpdate.advancement.nextEchelon}`;
            const seniorityYears = Math.floor(userToUpdate.advancement.seniorityYears / 3) * 3;
            
            const notifTitle = tNotif('title', { years: seniorityYears });
            const notifBody = `${tNotif('bodyLine1', { name: userToUpdate.name, years: seniorityYears })}\n\n${tNotif('bodyLine2')}\n${tNotif('benefitEchelon', { echelon: newEchelon })}\n${tNotif('benefitLeave')}\n\n${tNotif('bodyLine3')}`;
            
            const newNotification = {
                userId: userToUpdate.id,
                type: 'advancement',
                title: notifTitle,
                body: notifBody,
                isRead: false,
                createdAt: serverTimestamp(),
            };
            addDocumentNonBlocking(collection(firestore, 'users', userToUpdate.id, 'notifications'), newNotification);


        } catch (error) {
            toast({ variant: 'destructive', title: t('errorTitle') });
        } finally {
            setProcessingUsers(prev => prev.filter(id => id !== userToUpdate.id));
        }
    };


    const isLoading = isUserLoading || isLoadingProfiles;
    if (isLoading) return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
    if (!adminUser) return <div className="flex h-screen w-full items-center justify-center"><p>{tShared('pleaseLogin')}</p></div>;
    if (adminProfile?.role !== 'admin') return <AdminAccessDenied />;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                <p className="text-muted-foreground">{t('description')}</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                         <TrendingUp className="h-6 w-6 text-primary" />
                        <CardTitle>{t('alertsTitle')}</CardTitle>
                    </div>
                    <CardDescription>{t('alertsDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {processedUsers.alertUsers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {processedUsers.alertUsers.map(user => (
                                <UserAdvancementCard key={user.id} user={user} onApprove={handleApproveAdvancement} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">{t('noAlerts')}</p>
                    )}
                </CardContent>
            </Card>
            
             <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <UserIcon className="h-6 w-6" />
                        <CardTitle>{t('allEmployeesTitle')}</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    {processedUsers.otherUsers.map(user => (
                         <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                            <div className="space-y-1">
                                <p className="font-medium">{user.name}</p>
                                <p className="text-xs text-muted-foreground">{t('hireDateLabel')}: {new Date(user.hireDate!).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold">{user.advancement.seniorityString}</p>
                                <p className="text-xs text-muted-foreground">{t('currentEchelonLabel')}: {user.category}-{user.echelon}</p>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <p className="text-xs text-center text-muted-foreground pt-4">{t('footerNote')}</p>
        </div>
    );
}

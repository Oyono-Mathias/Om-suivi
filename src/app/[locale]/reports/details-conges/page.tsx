'use client';

import React, { useMemo } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { useTranslations, useLocale } from 'next-intl';
import { differenceInYears, parseISO, format, addYears, startOfYear, getMonth } from 'date-fns';
import { fr, enUS } from "date-fns/locale";
import type { Profile, LeaveAnnouncement } from '@/lib/types';
import { Link } from '@/navigation';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function DetailCongesScreen() {
    const t = useTranslations('DetailsCongesPage');
    const tShared = useTranslations('Shared');
    const tLeaveRequest = useTranslations('LeaveRequestPage');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);
    
    const leaveAnnouncementsQuery = useMemoFirebase(() => user ? query(collection(firestore, 'leaveAnnouncements'), where('userId', '==', user.uid)) : null, [firestore, user]);
    const { data: leaveAnnouncements, isLoading: isLoadingLeaveAnnouncements } = useCollection<LeaveAnnouncement>(leaveAnnouncementsQuery);

    const annualLeaveData = useMemo(() => {
        if (!profile?.hireDate || !leaveAnnouncements) return [];

        try {
            const hireDate = parseISO(profile.hireDate);
            const firstYearOfService = hireDate.getFullYear();
            const currentYear = new Date().getFullYear();
            const years = [];

            for (let year = firstYearOfService; year <= currentYear; year++) {
                years.push(year);
            }

            return years.map(year => {
                const referencePeriodStart = new Date(year, 5, 26); // June 26
                const referencePeriodEnd = new Date(year + 1, 5, 25); // June 25 next year

                if (referencePeriodStart > new Date()) return null;

                const seniorityYears = differenceInYears(referencePeriodEnd, hireDate);
                let senioritySurplus = 0;
                if (seniorityYears >= 3) {
                    senioritySurplus = 4;
                }

                const baseDays = 18;
                const totalDays = baseDays + senioritySurplus;
                
                // Simplified payout calculation using current base salary
                const annualGrossSalary = profile.monthlyBaseSalary * 12;
                const leavePayout = annualGrossSalary / 12;
                
                const wasLeaveTaken = leaveAnnouncements.some(announcement => {
                    const leaveDate = parseISO(announcement.leaveStartDate);
                    return leaveDate >= referencePeriodStart && leaveDate <= referencePeriodEnd;
                });
                const status = wasLeaveTaken ? t('statusTaken') : t('statusToBeTaken');

                return {
                    year: year,
                    referencePeriod: `${format(referencePeriodStart, 'dd/MM/yyyy')} - ${format(referencePeriodEnd, 'dd/MM/yyyy')}`,
                    days: {
                        base: baseDays,
                        seniority: senioritySurplus,
                        total: totalDays,
                    },
                    payout: leavePayout,
                    annualGross: annualGrossSalary,
                    status,
                };
            }).filter(Boolean).reverse();

        } catch (e) {
            console.error("Could not parse date for leave calculation", e);
            return [];
        }
    }, [profile, leaveAnnouncements, t]);

    const isLoading = isUserLoading || isLoadingProfile || isLoadingLeaveAnnouncements;
    
    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    if (!user) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    if (!profile || !profile.hireDate) return <div className="flex flex-col justify-center items-center h-screen gap-4 text-center"><p className="text-xl">{tShared('pleaseCompleteProfile')}</p><Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link></div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>

            <Accordion type="single" collapsible className="w-full space-y-4">
                {annualLeaveData.length > 0 ? annualLeaveData.map((data, index) => data && (
                    <AccordionItem value={`item-${index}`} key={index} className="border rounded-lg bg-card text-card-foreground">
                        <AccordionTrigger className="p-4 font-bold text-lg hover:no-underline">
                            {t('year', {year: data.year})}
                             <Badge variant={data.status === t('statusTaken') ? 'default' : 'secondary'} className="ml-auto mr-4">{data.status}</Badge>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 pt-0">
                            <div className="space-y-6">
                                <p className="text-sm text-muted-foreground">{t('referencePeriod')}: {data.referencePeriod}</p>
                                
                                <Card>
                                    <CardHeader><CardTitle className="text-base">{t('daysSectionTitle')}</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="p-4 bg-muted/50 rounded-md text-center">
                                            <p className="text-lg">
                                                {data.days.base} ({t('baseLabel')}) + {data.days.seniority} ({t('seniorityLabel')}) = <span className="font-bold text-primary text-xl">{data.days.total} {tLeaveRequest('daysUnit')}</span>
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader><CardTitle className="text-base">{t('financialSectionTitle')}</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="p-4 bg-muted/50 rounded-md text-center">
                                            <p className="text-sm">{t('annualGrossFormula')}</p>
                                            <p className="text-2xl font-bold text-primary mt-2">{formatCurrency(data.payout)} FCFA</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                )) : (
                    <p className="text-center text-muted-foreground py-8">{t('noLeaveHistory')}</p>
                )}
            </Accordion>
            
            <div className="text-center pt-4">
                <Link href="/leave">
                    <Button size="lg" className="h-14 text-lg">
                        <Paperclip className="mr-2 h-5 w-5" />
                        {t('generateRequestButton')}
                    </Button>
                </Link>
            </div>
        </div>
    );
}

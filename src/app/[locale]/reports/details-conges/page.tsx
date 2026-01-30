'use client';

import React, { useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { differenceInYears, parseISO } from 'date-fns';
import type { Profile } from '@/lib/types';
import { Link } from '@/navigation';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Paperclip } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function DetailsCongesPage() {
    const t = useTranslations('DetailsCongesPage');
    const tShared = useTranslations('Shared');
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const leaveData = useMemo(() => {
        if (!profile?.hireDate) return { baseDays: 18, senioritySurplus: 0, totalDays: 18, seniorityYears: 0, dailyRate: 0, totalPayout: 0 };
        try {
            const hireDate = parseISO(profile.hireDate);
            const now = new Date();

            const seniorityYears = differenceInYears(now, hireDate);
            let senioritySurplus = 0;
            if (seniorityYears >= 5) {
                senioritySurplus = 2 + Math.floor(Math.max(0, seniorityYears - 5) / 2) * 2;
            }
            
            const baseDays = 18; // Annual base
            const totalDays = baseDays + senioritySurplus;
            const dailyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 30) : 0;
            const totalPayout = dailyRate * totalDays;

            return {
                baseDays,
                senioritySurplus,
                totalDays,
                seniorityYears,
                dailyRate,
                totalPayout
            };
        } catch (e) {
            console.error("Could not parse date for leave calculation", e);
            return { baseDays: 18, senioritySurplus: 0, totalDays: 18, seniorityYears: 0, dailyRate: 0, totalPayout: 0 };
        }
    }, [profile?.hireDate, profile?.monthlyBaseSalary]);

    const isLoading = isUserLoading || isLoadingProfile;
    
    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    if (!user) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    if (!profile || !profile.hireDate) return <div className="flex flex-col justify-center items-center h-screen gap-4 text-center"><p className="text-xl">{tShared('pleaseCompleteProfile')}</p><Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link></div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>

            <Card>
                <CardHeader>
                    <CardTitle>{t('visualSummaryTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableBody>
                            <TableRow>
                                <TableCell>{t('baseLeave')}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{leaveData.baseDays.toFixed(1)} {t('daysUnit')}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell>{t('senioritySurplus')}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{leaveData.senioritySurplus.toFixed(1)} {t('daysUnit')}</TableCell>
                            </TableRow>
                            <TableRow className="font-bold bg-primary/5 text-primary">
                                <TableCell>{t('totalLeave')}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-lg">{leaveData.totalDays.toFixed(1)} {t('daysUnit')}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('calculationTitle')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h4 className="font-semibold">{t('step1Title')}</h4>
                        <p className="text-sm text-muted-foreground">{t('step1Formula')}</p>
                        <div className="mt-2 p-3 bg-muted/50 rounded-md font-mono text-center text-lg">
                            {t('step1Result', {
                                salary: profile.monthlyBaseSalary.toLocaleString('fr-FR'),
                                dailyRate: leaveData.dailyRate.toLocaleString('fr-FR'),
                                currency: profile.currency
                            })}
                        </div>
                    </div>
                    <Separator />
                    <div>
                        <h4 className="font-semibold">{t('step2Title')}</h4>
                        <p className="text-sm text-muted-foreground">{t('step2Formula')}</p>
                        <div className="mt-2 p-4 bg-primary/5 rounded-md font-mono text-center text-2xl font-bold text-primary">
                             {t('step2Result', {
                                dailyRate: leaveData.dailyRate.toLocaleString('fr-FR'),
                                totalDays: leaveData.totalDays.toFixed(1),
                                totalPayout: leaveData.totalPayout.toLocaleString('fr-FR'),
                                currency: profile.currency
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-muted/30">
                 <CardHeader>
                    <CardTitle>{t('accrualLogicTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        {t('accrualLogicDescription', {
                            senioritySurplus: leaveData.senioritySurplus,
                            seniorityYears: leaveData.seniorityYears
                        })}
                    </p>
                </CardContent>
            </Card>
            
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

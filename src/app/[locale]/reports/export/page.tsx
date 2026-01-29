
"use client";

import React, { useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, getDay, startOfMonth, endOfMonth, getWeek } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2, Briefcase } from 'lucide-react';
import { Link } from '@/navigation';
import { useTranslations, useLocale } from 'next-intl';

const OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  sunday: 1.4,
  holiday: 1.5,
};

export default function ExportReportPage() {
    const t = useTranslations('ExportReportPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return collection(firestore, 'users', user.uid, 'timeEntries');
    }, [firestore, user]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);
    
    const reportId = useMemo(() => `REP-${Date.now()}-${user?.uid.slice(0, 4)}`, [user]);

    const handlePrint = () => {
        window.print();
    };

    const { sortedEntries, totalDuration, totalOvertime, totalPayout, reportMonth, overtimeBreakdown } = useMemo(() => {
        if (!timeEntries || !profile) {
            return {
                sortedEntries: [],
                totalDuration: 0,
                totalOvertime: 0,
                totalPayout: 0,
                reportMonth: format(new Date(), 'MMMM yyyy', {locale: dateFnsLocale}),
                overtimeBreakdown: { tier1: { minutes: 0, rate: 1.2, payout: 0 }, tier2: { minutes: 0, rate: 1.3, payout: 0 }, sunday: { minutes: 0, rate: 1.4, payout: 0 }, holiday: { minutes: 0, rate: 1.5, payout: 0 } },
            };
        }

        const currentMonthStart = startOfMonth(new Date());
        const currentMonthEnd = endOfMonth(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= currentMonthStart && entryDate <= currentMonthEnd;
        });

        const sorted = [...monthEntries].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;

        const breakdown = {
            tier1: { minutes: 0, rate: OVERTIME_RATES.tier1, payout: 0 },
            tier2: { minutes: 0, rate: OVERTIME_RATES.tier2, payout: 0 },
            sunday: { minutes: 0, rate: OVERTIME_RATES.sunday, payout: 0 },
            holiday: { minutes: 0, rate: OVERTIME_RATES.holiday, payout: 0 },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        sorted.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) {
                entriesByWeek[week] = [];
            }
            entriesByWeek[week].push(entry);
        });

        let grandTotalOvertimeMinutes = 0;
        let grandTotalDuration = 0;

        sorted.forEach(entry => grandTotalDuration += entry.duration);

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyOvertimeMinutes = 0;
            weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                grandTotalOvertimeMinutes += entry.overtimeDuration;

                const dayOfWeek = getDay(parseISO(entry.date)); // Sunday is 0

                if (entry.isPublicHoliday) {
                    breakdown.holiday.minutes += entry.overtimeDuration;
                    continue;
                }

                if (dayOfWeek === 0) {
                    breakdown.sunday.minutes += entry.overtimeDuration;
                    continue;
                }
                
                const weeklyTier1CapInMinutes = 8 * 60;
                const remainingTier1Capacity = weeklyTier1CapInMinutes - weeklyOvertimeMinutes;

                if (remainingTier1Capacity > 0) {
                    const minutesForTier1 = Math.min(entry.overtimeDuration, remainingTier1Capacity);
                    breakdown.tier1.minutes += minutesForTier1;
                    
                    const minutesForTier2 = entry.overtimeDuration - minutesForTier1;
                    if (minutesForTier2 > 0) {
                        breakdown.tier2.minutes += minutesForTier2;
                    }
                } else {
                    breakdown.tier2.minutes += entry.overtimeDuration;
                }
                weeklyOvertimeMinutes += entry.overtimeDuration;
            }
        }
        
        breakdown.tier1.payout = (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
        breakdown.tier2.payout = (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
        breakdown.sunday.payout = (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
        breakdown.holiday.payout = (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;
        
        const totalPayout = breakdown.tier1.payout + breakdown.tier2.payout + breakdown.sunday.payout + breakdown.holiday.payout;

        const month = sorted.length > 0 ? format(parseISO(sorted[0].date), 'MMMM yyyy', {locale: dateFnsLocale}) : format(new Date(), 'MMMM yyyy', {locale: dateFnsLocale});

        return {
            sortedEntries: sorted,
            totalDuration: grandTotalDuration,
            totalOvertime: grandTotalOvertimeMinutes,
            totalPayout: totalPayout,
            reportMonth: month,
            overtimeBreakdown: breakdown,
        };

    }, [timeEntries, profile, dateFnsLocale]);
    
    useEffect(() => {
        if (profile && reportMonth) {
            const safeName = profile.name.replace(/\s+/g, '-');
            const safeMonth = reportMonth.replace(/\s+/g, '-');
            document.title = `rapport-${safeName}-${safeMonth}`.toLowerCase();
        }
    }, [profile, reportMonth]);

    const formatMinutesToHours = (minutes: number) => (minutes / 60).toFixed(2);
    const formatCurrency = (amount: number) => amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    if (isUserLoading || isLoadingProfile || isLoadingEntries) {
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
    
    if (!profile || profile.monthlyBaseSalary === 0) {
        return (
            <div className="flex flex-col justify-center items-center h-screen gap-4">
                <p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p>
                <Link href="/profile">
                    <Button>{tShared('goToProfileButton')}</Button>
                </Link>
            </div>
        )
    }

    const professionLabel = profile.profession ? tProfile(`professions.${profile.profession}`) : 'N/A';

    return (
        <div className="bg-background text-foreground min-h-screen p-4 font-body sm:p-8 print:p-0 print:bg-white print:text-black">
            <style jsx global>{`
                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-container {
                        padding: 0;
                        border: none;
                        box-shadow: none;
                    }
                    .print-sticky-footer {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                    }
                }
            `}</style>

            <div className="max-w-4xl mx-auto print-container">
                <header className="flex flex-wrap justify-between items-center gap-4 mb-8 no-print">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">{t('title')}</h1>
                        <p className="text-muted-foreground">{t('description', {reportMonth})}</p>
                    </div>
                    <Button onClick={handlePrint} className="h-12 w-full md:w-auto">{t('printButton')}</Button>
                </header>

                <div className="border rounded-lg p-2 sm:p-8 print:border-none print:shadow-none print:rounded-none">
                    <header className="flex justify-between items-start mb-8 border-b pb-6">
                        <div className="flex items-center gap-4">
                           <Briefcase className="w-12 h-12 text-primary shrink-0" />
                            <div>
                                <h2 className="text-2xl font-bold text-primary font-headline">{t('appName')}</h2>
                                <h3 className="text-lg font-semibold">{t('reportTitle')}</h3>
                                <p className="text-sm text-muted-foreground">{profile.name}</p>
                                <p className="text-sm text-muted-foreground">{t('jobTitleLabel')}: {professionLabel}</p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                            <p className="font-semibold text-lg">{reportMonth}</p>
                            <p className="text-sm text-muted-foreground">{t('hourlyRateLabel')}: {Math.round(profile.monthlyBaseSalary / 173.33).toLocaleString('fr-FR')} {profile.currency}</p>
                        </div>
                    </header>
                    
                    <main>
                         {/* Responsive Layout: Cards for mobile, Table for desktop */}
                        <div className="md:hidden space-y-4">
                        {sortedEntries.length > 0 ? (
                            sortedEntries.map(entry => (
                            <Card key={entry.id}>
                                <CardHeader>
                                <CardTitle className="text-base">{format(parseISO(entry.date), 'EEE, d MMM', {locale: dateFnsLocale})} {entry.isPublicHoliday ? '(Férié)' : ''}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                <p><strong>{t('tableType')}:</strong> {entry.location === 'Mission' ? t('typeMission') : t('typeNormal')}</p>
                                <p><strong>{t('tableCheckIn')}/{t('tableCheckOut')}:</strong> {entry.startTime} - {entry.endTime}</p>
                                <p><strong>{t('tableLocation')}:</strong> {entry.location || 'N/A'}</p>
                                <p><strong>{t('tableDuration')}:</strong> {entry.duration} min</p>
                                <p><strong>{t('tableOvertime')}:</strong> {entry.overtimeDuration > 0 ? `${entry.overtimeDuration} min` : '-'}</p>
                                {entry.modified_manually && <p><strong>{t('tableRemarks')}:</strong> <span className="text-destructive font-semibold">{t('remarkPauseLimit')}</span></p>}
                                </CardContent>
                            </Card>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground py-10">{t('noEntries')}</p>
                        )}
                        </div>

                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('tableDate')}</TableHead>
                                <TableHead>{t('tableCheckIn')}</TableHead>
                                <TableHead>{t('tableCheckOut')}</TableHead>
                                <TableHead>{t('tableLocation')}</TableHead>
                                <TableHead>{t('tableOvertime')}</TableHead>
                                <TableHead>{t('tableType')}</TableHead>
                                <TableHead>{t('tableRemarks')}</TableHead>
                                <TableHead className="text-right">{t('tableDuration')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sortedEntries.length > 0 ? (
                                sortedEntries.map(entry => (
                                  <TableRow key={entry.id}>
                                    <TableCell>
                                      {format(parseISO(entry.date), 'PPP', { locale: dateFnsLocale })}
                                      {entry.isPublicHoliday ? ` (${t('overtimeHoliday').replace('{rate}', OVERTIME_RATES.holiday * 100 + '%')})` : ''}
                                    </TableCell>
                                    <TableCell>{entry.startTime}</TableCell>
                                    <TableCell>{entry.endTime}</TableCell>
                                    <TableCell>{entry.location || 'N/A'}</TableCell>
                                    <TableCell>{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} min` : '-'}</TableCell>
                                    <TableCell>{entry.location === 'Mission' ? t('typeMission') : t('typeNormal')}</TableCell>
                                    <TableCell>
                                      {entry.modified_manually && <Badge variant="destructive">{t('remarkPauseLimit')}</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right">{entry.duration} min</TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={8} className="h-24 text-center">{t('noEntries')}</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                    </main>

                    <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground space-y-2 print-sticky-footer">
                        <p>{t('locationDisclaimer')}</p>
                        <p>{t('tamperProof')}</p>
                        <p className="font-mono text-xs">{t('reportId')}: {reportId}</p>
                        <p>{t('footerGenerated', {date: format(new Date(), 'PPP p', {locale: dateFnsLocale})})}</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}


"use client";

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { format, parseISO, getDay, startOfMonth, endOfMonth, getWeek } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { shifts } from '@/lib/shifts';
import type { TimeEntry, Profile } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
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
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid, 'userProfiles', user.uid);
    }, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return collection(firestore, 'users', user.uid, 'timeEntries');
    }, [firestore, user]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);


    const handlePrint = () => {
        window.print();
    };

    const { sortedEntries, totalOvertime, totalPayout, reportMonth, overtimeBreakdown } = useMemo(() => {
        if (!timeEntries || !profile) {
            return {
                sortedEntries: [],
                totalOvertime: 0,
                totalPayout: 0,
                reportMonth: format(new Date(), 'MMMM yyyy', {locale: dateFnsLocale}),
                overtimeBreakdown: { tier1: { minutes: 0 }, tier2: { minutes: 0 }, sunday: { minutes: 0 }, holiday: { minutes: 0 } },
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
            tier1: { minutes: 0, rate: OVERTIME_RATES.tier1 },
            tier2: { minutes: 0, rate: OVERTIME_RATES.tier2 },
            sunday: { minutes: 0, rate: OVERTIME_RATES.sunday },
            holiday: { minutes: 0, rate: OVERTIME_RATES.holiday },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        sorted.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) {
                entriesByWeek[week] = [];
            }
            entriesByWeek[week].push(entry);
        });

        let totalOvertimeMinutes = 0;

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyOvertimeMinutes = 0;
            weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                totalOvertimeMinutes += entry.overtimeDuration;

                const dayOfWeek = getDay(parseISO(entry.date)); // Sunday is 0

                if (entry.isPublicHoliday) {
                    breakdown.holiday.minutes += entry.overtimeDuration;
                    continue;
                }

                if (dayOfWeek === 0) {
                    breakdown.sunday.minutes += entry.overtimeDuration;
                    continue;
                }

                const remainingWeeklyTier1Cap = (8 * 60) - weeklyOvertimeMinutes;
                if (remainingWeeklyTier1Cap > 0) {
                    const toTier1 = Math.min(entry.overtimeDuration, remainingWeeklyTier1Cap);
                    breakdown.tier1.minutes += toTier1;
                    weeklyOvertimeMinutes += toTier1;
                    
                    const toTier2 = entry.overtimeDuration - toTier1;
                    if (toTier2 > 0) {
                        breakdown.tier2.minutes += toTier2;
                        weeklyOvertimeMinutes += toTier2;
                    }
                } else {
                    breakdown.tier2.minutes += entry.overtimeDuration;
                    weeklyOvertimeMinutes += toTier2;
                }
            }
        }
        
        let payout = 0;
        payout += (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
        payout += (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
        payout += (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
        payout += (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;

        const month = sorted.length > 0 ? format(parseISO(sorted[0].date), 'MMMM yyyy', {locale: dateFnsLocale}) : format(new Date(), 'MMMM yyyy', {locale: dateFnsLocale});

        return {
            sortedEntries: sorted,
            totalOvertime: totalOvertimeMinutes,
            totalPayout: payout,
            reportMonth: month,
            overtimeBreakdown: breakdown,
        };

    }, [timeEntries, profile, dateFnsLocale]);

    const formatMinutes = (minutes: number) => (minutes / 60).toFixed(2);
    
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

    return (
        <div className="bg-background text-foreground min-h-screen p-4 font-body sm:p-8 print:p-0">
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
                }
            `}</style>

            <div className="max-w-4xl mx-auto print-container">
                <header className="flex flex-wrap justify-between items-center gap-4 mb-8 no-print">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">{t('title')}</h1>
                        <p className="text-muted-foreground">{t('description', {reportMonth})}</p>
                    </div>
                    <Button onClick={handlePrint}>{t('printButton')}</Button>
                </header>

                <div className="border rounded-lg p-6 sm:p-8 print:border-none print:shadow-none print:rounded-none">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-primary font-headline">{t('appName')}</h2>
                            <h3 className="text-lg font-semibold">{t('reportTitle')}</h3>
                            <p className="text-muted-foreground">{profile.name}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold">{reportMonth}</p>
                            <p className="text-sm text-muted-foreground">{t('hourlyRateLabel')}: {Math.round(profile.monthlyBaseSalary / 173.33).toLocaleString('fr-FR')} {profile.currency}</p>
                        </div>
                    </div>
                    
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('tableDate')}</TableHead>
                                <TableHead>{t('tableShift')}</TableHead>
                                <TableHead>{t('tableCheckIn')}</TableHead>
                                <TableHead>{t('tableCheckOut')}</TableHead>
                                <TableHead>{t('tableLocation')}</TableHead>
                                <TableHead className="text-right">{t('tableOvertime')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedEntries.length > 0 ? (
                                sortedEntries.map(entry => (
                                    <TableRow key={entry.id}>
                                        <TableCell>{format(parseISO(entry.date), 'EEE, d MMM', {locale: dateFnsLocale})} {entry.isPublicHoliday ? '(Férié)' : ''}</TableCell>
                                        <TableCell>{shifts.find(s => s.id === entry.shiftId)?.name || 'N/A'}</TableCell>
                                        <TableCell>{entry.startTime}</TableCell>
                                        <TableCell>{entry.endTime}</TableCell>
                                        <TableCell>{entry.location || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-medium">{entry.overtimeDuration > 0 ? entry.overtimeDuration : '-'}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">{t('noEntries')}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">{t('overtimeTier1', {rate: overtimeBreakdown.tier1.rate * 100})}</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.tier1.minutes)} {t('hourUnit')}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">{t('overtimeTier2', {rate: overtimeBreakdown.tier2.rate * 100})}</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.tier2.minutes)} {t('hourUnit')}</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">{t('overtimeSunday', {rate: overtimeBreakdown.sunday.rate * 100})}</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.sunday.minutes)} {t('hourUnit')}</TableCell>
                            </TableRow>
                             <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">{t('overtimeHoliday', {rate: overtimeBreakdown.holiday.rate * 100})}</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.holiday.minutes)} {t('hourUnit')}</TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                                <TableCell colSpan={5} className="text-right font-bold">{t('totalOvertime')}</TableCell>
                                <TableCell className="text-right font-bold">{formatMinutes(totalOvertime)} {t('hourUnit')}</TableCell>
                            </TableRow>
                            <TableRow className="bg-primary/10">
                                <TableCell colSpan={5} className="text-right font-bold text-primary">{t('estimatedPayout')}</TableCell>
                                <TableCell className="text-right font-bold text-primary">{totalPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {profile.currency}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>

                    <footer className="mt-12 text-center text-xs text-muted-foreground">
                        <p>{t('footerGenerated', {date: format(new Date(), 'PPP p', {locale: dateFnsLocale})})}</p>
                        <p>{t('footerDisclaimer')}</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}

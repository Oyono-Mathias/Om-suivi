"use client";

import React, { useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, parse } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2, Briefcase } from 'lucide-react';
import { Link } from '@/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { shifts } from '@/lib/shifts';
import { getPayrollCycle } from '@/lib/utils';
import Image from 'next/image';
import { AdminAccessDenied } from '@/components/admin-access-denied';

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

export default function AdminUserExportPage({ params }: { params: { userId: string } }) {
    const t = useTranslations('ExportReportPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user: adminUser, isUserLoading: isAdminUserLoading } = useUser();
    const firestore = useFirestore();

    const { userId } = params;

    // Admin's profile to check for role
    const adminProfileRef = useMemoFirebase(() => {
        if (!adminUser) return null;
        return doc(firestore, 'users', adminUser.uid);
    }, [firestore, adminUser]);
    const { data: adminProfile, isLoading: isLoadingAdminProfile } = useDoc<Profile>(adminProfileRef);

    // The user for whom the report is being generated
    const userProfileRef = useMemoFirebase(() => {
        if (!userId) return null;
        return doc(firestore, 'users', userId);
    }, [firestore, userId]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!userId) return null;
        return collection(firestore, 'users', userId, 'timeEntries');
    }, [firestore, userId]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

    const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const reportId = useMemo(() => `REP-${Date.now()}-${userId.slice(0, 4)}`, [userId]);

    const handlePrint = () => {
        window.print();
    };

    const { sortedEntries, totalDuration, totalOvertime, totalPayout, reportMonth, overtimeBreakdown, hourlyRate } = useMemo(() => {
        if (!timeEntries || !profile) {
            return {
                sortedEntries: [],
                totalDuration: 0,
                totalOvertime: 0,
                totalPayout: 0,
                reportMonth: format(new Date(), 'MMMM yyyy', {locale: dateFnsLocale}),
                overtimeBreakdown: { tier1: { minutes: 0, rate: 1.2, payout: 0 }, tier2: { minutes: 0, rate: 1.3, payout: 0 }, night: { minutes: 0, rate: 1.4, payout: 0 }, sunday: { minutes: 0, rate: 1.5, payout: 0 }, holiday: { minutes: 0, rate: 1.5, payout: 0 } },
                hourlyRate: 0,
            };
        }

        const rates = globalSettings?.overtimeRates || DEFAULT_OVERTIME_RATES;
        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= cycleStart && entryDate <= cycleEnd;
        });

        const sorted = [...monthEntries].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        const calculatedHourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;

        const breakdown = {
            tier1: { minutes: 0, rate: rates.tier1, payout: 0 },
            tier2: { minutes: 0, rate: rates.tier2, payout: 0 },
            night: { minutes: 0, rate: rates.night, payout: 0 },
            sunday: { minutes: 0, rate: rates.sunday, payout: 0 },
            holiday: { minutes: 0, rate: rates.holiday, payout: 0 },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        sorted.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) entriesByWeek[week] = [];
            entriesByWeek[week].push(entry);
        });

        let grandTotalOvertimeMinutes = 0;
        let grandTotalDuration = 0;

        sorted.forEach(entry => grandTotalDuration += entry.duration);

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyDaytimeOvertimeMinutes = 0;
            weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                grandTotalOvertimeMinutes += entry.overtimeDuration;

                let overtimeToProcess = entry.overtimeDuration;
                const entryDate = parseISO(entry.date);

                if (entry.isPublicHoliday) {
                    breakdown.holiday.minutes += overtimeToProcess;
                    continue;
                }
                if (getDay(entryDate) === 0) {
                    breakdown.sunday.minutes += overtimeToProcess;
                    continue;
                }
                
                const shift = shifts.find(s => s.id === entry.shiftId);
                if(shift) {
                    const shiftStartDateTime = parse(`${entry.date} ${shift.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    let shiftEndDateTime = parse(`${entry.date} ${shift.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    if (shiftEndDateTime <= shiftStartDateTime) shiftEndDateTime = addDays(shiftEndDateTime, 1);
                    
                    const overtimeStartDateTime = shiftEndDateTime;
                    const overtimeEndDateTime = addMinutes(overtimeStartDateTime, entry.overtimeDuration);
                    
                    const dayOfOvertime = startOfDay(overtimeStartDateTime);
                    let nightWindowStart, nightWindowEnd;
                    
                    if (getHours(overtimeStartDateTime) < 6) {
                        nightWindowStart = set(addDays(dayOfOvertime, -1), { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 });
                        nightWindowEnd = set(dayOfOvertime, { hours: 6, minutes: 0, seconds: 0, milliseconds: 0 });
                    } else {
                        nightWindowStart = set(dayOfOvertime, { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 });
                        nightWindowEnd = set(addDays(dayOfOvertime, 1), { hours: 6, minutes: 0, seconds: 0, milliseconds: 0 });
                    }

                    const overlapStart = max([overtimeStartDateTime, nightWindowStart]);
                    const overlapEnd = min([overtimeEndDateTime, nightWindowEnd]);
                    const nightOverlapMinutes = differenceInMinutes(overlapEnd, overlapStart);

                    if (nightOverlapMinutes > 0) {
                        breakdown.night.minutes += nightOverlapMinutes;
                        overtimeToProcess -= nightOverlapMinutes;
                    }
                }
                
                if (overtimeToProcess > 0) {
                    const weeklyTier1CapInMinutes = 8 * 60;
                    const remainingTier1Capacity = weeklyTier1CapInMinutes - weeklyDaytimeOvertimeMinutes;
                    const minutesForTier1 = Math.min(overtimeToProcess, remainingTier1Capacity);
                    if (minutesForTier1 > 0) breakdown.tier1.minutes += minutesForTier1;
                    const minutesForTier2 = overtimeToProcess - minutesForTier1;
                    if (minutesForTier2 > 0) breakdown.tier2.minutes += minutesForTier2;
                    weeklyDaytimeOvertimeMinutes += overtimeToProcess;
                }
            }
        }
        
        breakdown.tier1.payout = (breakdown.tier1.minutes / 60) * calculatedHourlyRate * breakdown.tier1.rate;
        breakdown.tier2.payout = (breakdown.tier2.minutes / 60) * calculatedHourlyRate * breakdown.tier2.rate;
        breakdown.night.payout = (breakdown.night.minutes / 60) * calculatedHourlyRate * breakdown.night.rate;
        breakdown.sunday.payout = (breakdown.sunday.minutes / 60) * calculatedHourlyRate * breakdown.sunday.rate;
        breakdown.holiday.payout = (breakdown.holiday.minutes / 60) * calculatedHourlyRate * breakdown.holiday.rate;
        
        const totalPayout = breakdown.tier1.payout + breakdown.tier2.payout + breakdown.night.payout + breakdown.sunday.payout + breakdown.holiday.payout;

        const month = `${format(cycleStart, 'd MMM', {locale: dateFnsLocale})} - ${format(cycleEnd, 'd MMM yyyy', {locale: dateFnsLocale})}`;

        return {
            sortedEntries: sorted,
            totalDuration: grandTotalDuration,
            totalOvertime: grandTotalOvertimeMinutes,
            totalPayout: totalPayout,
            reportMonth: month,
            overtimeBreakdown: breakdown,
            hourlyRate: calculatedHourlyRate
        };

    }, [timeEntries, profile, dateFnsLocale, globalSettings]);
    
    useEffect(() => {
        if (profile && reportMonth) {
            const safeName = profile.name.replace(/\s+/g, '-');
            const safeMonth = reportMonth.replace(/\s+/g, '-');
            document.title = `rapport-${safeName}-${safeMonth}`.toLowerCase();
        }
    }, [profile, reportMonth]);

    const formatMinutesToHM = (minutes: number) => {
        if (minutes <= 0) return '-';
        const h = Math.floor(minutes/60);
        const m = minutes % 60;
        return `${h}h ${m}min`;
    }
    
    const isLoading = isAdminUserLoading || isLoadingAdminProfile || isLoadingProfile || isLoadingEntries || isLoadingSettings;

    if (isLoading) {
        return (
          <div className="flex justify-center items-center h-screen">
            <Loader2 className="h-16 w-16 animate-spin" />
          </div>
        );
    }
    
    if (!adminUser) {
        return (
            <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl">{tShared('pleaseLogin')}</p>
            <Link href="/login">
                <Button>{tShared('loginButton')}</Button>
            </Link>
            </div>
        );
    }

    if (adminProfile?.role !== 'admin') {
        return <AdminAccessDenied />;
    }
    
    if (!profile) {
        return (
            <div className="flex flex-col justify-center items-center h-screen gap-4">
                <p className="text-xl text-center">Utilisateur introuvable.</p>
                <Link href="/admin/reports">
                    <Button>Retour aux rapports</Button>
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
                }
            `}</style>

            <div className="max-w-4xl mx-auto print-container">
                <header className="flex flex-wrap justify-between items-center gap-4 mb-8 no-print">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">{t('reportTitle')}</h1>
                        <p className="text-muted-foreground">{t('description', {reportMonth})}: <span className="font-semibold">{profile.name}</span></p>
                    </div>
                    <Button onClick={handlePrint} className="h-12 w-full md:w-auto">{t('printButton')}</Button>
                </header>

                <div className="border rounded-lg p-2 sm:p-8 print:border-none print:shadow-none print:rounded-none">
                    <header className="flex justify-between items-start mb-8 border-b pb-6">
                        <div className="flex items-center gap-4">
                           <Image src="/logo-omsuivi.png" alt="OM Suivi Logo" width={48} height={48} className="rounded-full" />
                            <div>
                                <h2 className="text-2xl font-bold text-primary font-headline">{t('appName')}</h2>
                                <h3 className="text-lg font-semibold">{t('reportTitle')}</h3>
                                <p className="text-sm text-muted-foreground">{profile.name}</p>
                                <p className="text-sm text-muted-foreground">{t('jobTitleLabel')}: {professionLabel}</p>
                            </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                            <p className="font-semibold text-lg">{reportMonth}</p>
                            <p className="text-sm text-muted-foreground">{t('hourlyRateLabel')}: {hourlyRate.toLocaleString('fr-FR')} {profile.currency}</p>
                        </div>
                    </header>
                    
                    <main>
                        <Card>
                             <CardHeader><CardTitle>{t('tableTitle', {defaultValue: 'Journal des Pointages'})}</CardTitle></CardHeader>
                            <CardContent>
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
                                        <TableHead className="text-right">{t('tableDuration')}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sortedEntries.length > 0 ? (
                                        sortedEntries.map(entry => (
                                          <TableRow key={entry.id}>
                                            <TableCell>{format(parseISO(entry.date), 'PPP', { locale: dateFnsLocale })}</TableCell>
                                            <TableCell>{entry.startTime}</TableCell>
                                            <TableCell>{entry.endTime}</TableCell>
                                            <TableCell>{entry.location || 'N/A'}</TableCell>
                                            <TableCell>{entry.overtimeDuration > 0 ? `${entry.overtimeDuration} min` : '-'}</TableCell>
                                            <TableCell>{entry.location === 'Mission' ? t('typeMission') : t('typeNormal')}</TableCell>
                                            <TableCell className="text-right">{entry.duration} min</TableCell>
                                          </TableRow>
                                        ))
                                      ) : (
                                        <TableRow>
                                          <TableCell colSpan={7} className="h-24 text-center">{t('noEntries')}</TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                            <Card>
                                <CardHeader><CardTitle>{t('overtimeBreakdownTitle')}</CardTitle></CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Heures</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {overtimeBreakdown.tier1.minutes > 0 && <TableRow><TableCell>{t('overtimeTier1', {rate: (overtimeBreakdown.tier1.rate*100-100)})}</TableCell><TableCell className="text-right">{formatMinutesToHM(overtimeBreakdown.tier1.minutes)}</TableCell></TableRow>}
                                            {overtimeBreakdown.tier2.minutes > 0 && <TableRow><TableCell>{t('overtimeTier2', {rate: (overtimeBreakdown.tier2.rate*100-100)})}</TableCell><TableCell className="text-right">{formatMinutesToHM(overtimeBreakdown.tier2.minutes)}</TableCell></TableRow>}
                                            {overtimeBreakdown.night.minutes > 0 && <TableRow><TableCell>{t('overtimeNight', {rate: (overtimeBreakdown.night.rate*100-100)})}</TableCell><TableCell className="text-right">{formatMinutesToHM(overtimeBreakdown.night.minutes)}</TableCell></TableRow>}
                                            {overtimeBreakdown.sunday.minutes > 0 && <TableRow><TableCell>{t('overtimeSunday', {rate: (overtimeBreakdown.sunday.rate*100-100)})}</TableCell><TableCell className="text-right">{formatMinutesToHM(overtimeBreakdown.sunday.minutes)}</TableCell></TableRow>}
                                            {overtimeBreakdown.holiday.minutes > 0 && <TableRow><TableCell>{t('overtimeHoliday', {rate: (overtimeBreakdown.holiday.rate*100-100)})}</TableCell><TableCell className="text-right">{formatMinutesToHM(overtimeBreakdown.holiday.minutes)}</TableCell></TableRow>}
                                            <TableRow className="font-bold border-t-2"><TableCell>{t('totalOvertime')}</TableCell><TableCell className="text-right">{formatMinutesToHM(totalOvertime)}</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader><CardTitle>{t('financialSummaryTitle')}</CardTitle></CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Description</TableHead>
                                                <TableHead className="text-right">Montant</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow><TableCell>{t('totalDuration')}</TableCell><TableCell className="text-right">{formatMinutesToHM(totalDuration)}</TableCell></TableRow>
                                            <TableRow><TableCell>{t('totalOvertime')}</TableCell><TableCell className="text-right">{formatMinutesToHM(totalOvertime)}</TableCell></TableRow>
                                            <TableRow className="font-bold border-t-2"><TableCell>{t('estimatedPayout')}</TableCell><TableCell className="text-right">{totalPayout.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {profile.currency}</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    </main>

                    <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground space-y-2">
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

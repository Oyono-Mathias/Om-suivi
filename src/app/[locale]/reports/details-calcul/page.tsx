'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import type { Profile, GlobalSettings, TimeEntry, AttendanceOverride } from "@/lib/types";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { getPayrollCycle } from '@/lib/utils';
import { shifts } from '@/lib/shifts';
import { parseISO, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, getDay, parse } from "date-fns";
import { Loader2 } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

function CalculationDetails() {
    const t = useTranslations('ReportsPage');
    const tShared = useTranslations('Shared');
    const tDetails = useTranslations('DetailsCalculPage');

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'timeEntries') : null, [firestore, user]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);
    
    const settingsRef = useMemoFirebase(() => user ? doc(firestore, 'settings', 'global') : null, [firestore, user]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const overridesQuery = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'attendanceOverrides') : null, [firestore, user]);
    const { data: attendanceOverrides, isLoading: isLoadingOverrides } = useCollection<AttendanceOverride>(overridesQuery);

    const reportSummary = React.useMemo(() => {
        if (!timeEntries || !profile || !attendanceOverrides) return null;
        
        const rates = globalSettings?.overtimeRates || DEFAULT_OVERTIME_RATES;
        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());
        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= cycleStart && entryDate <= cycleEnd;
        });

        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;
        const breakdown = {
            tier1: { minutes: 0, rate: rates.tier1, payout: 0 },
            tier2: { minutes: 0, rate: rates.tier2, payout: 0 },
            night: { minutes: 0, rate: rates.night, payout: 0 },
            sunday: { minutes: 0, rate: rates.sunday, payout: 0 },
            holiday: { minutes: 0, rate: rates.holiday, payout: 0 },
        };
        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        monthEntries.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) entriesByWeek[week] = [];
            entriesByWeek[week].push(entry);
        });

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyDaytimeOvertimeMinutes = 0;
            weekEntries.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                let overtimeToProcess = entry.overtimeDuration;
                const entryDate = parseISO(entry.date);
                if (entry.isPublicHoliday) {
                    breakdown.holiday.minutes += overtimeToProcess;
                    continue;
                }
                if (getDay(entryDate) === 0) { // Sunday
                    breakdown.sunday.minutes += overtimeToProcess;
                    continue;
                }
                const shift = shifts.find(s => s.id === entry.shiftId);
                if (shift) {
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
        breakdown.tier1.payout = (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
        breakdown.tier2.payout = (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
        breakdown.night.payout = (breakdown.night.minutes / 60) * hourlyRate * breakdown.night.rate;
        breakdown.sunday.payout = (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
        breakdown.holiday.payout = (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;
        const totalPayout = breakdown.tier1.payout + breakdown.tier2.payout + breakdown.night.payout + breakdown.sunday.payout + breakdown.holiday.payout;
        
        return {
            estimatedPayout: totalPayout,
            hourlyRate,
            overtimeBreakdown: breakdown,
        };
    }, [timeEntries, profile, globalSettings, attendanceOverrides]);

    const isLoading = isLoadingProfile || isLoadingEntries || isLoadingSettings;

    if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (!profile || !reportSummary) return null;

    return (
        <Card className="bg-muted/30 scroll-mt-20">
            <CardHeader>
                <CardTitle>{tDetails('title')}</CardTitle>
                <CardDescription>{tDetails('description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
                <div>
                    <h4 className="font-semibold mb-2">{t('hourlyRateFormulaTitle')}</h4>
                    <div className="p-3 bg-background/50 rounded-md font-mono text-center text-base md:text-lg">
                        <span className="tabular-nums">
                        {t('hourlyRateFormula', {
                            salary: profile.monthlyBaseSalary.toLocaleString('fr-FR'),
                            rate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                            currency: profile.currency,
                        })}
                        </span>
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">{t('overtimePayoutFormulaTitle')}</h4>
                    <div className="space-y-2 p-3 bg-background/50 rounded-md font-mono tabular-nums">
                        {Object.entries(reportSummary.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) => {
                             const tierKey = key as keyof typeof reportSummary.overtimeBreakdown;
                            let label;
                            switch(tierKey) {
                                case 'tier1': label = t('overtimeTier1', { rate: (tier.rate * 100 - 100).toFixed(0) }); break;
                                case 'tier2': label = t('overtimeTier2', { rate: (tier.rate * 100 - 100).toFixed(0) }); break;
                                case 'night': label = t('overtimeNight', { rate: (tier.rate * 100 - 100).toFixed(0) }); break;
                                case 'sunday': label = t('overtimeSunday', { rate: (tier.rate * 100 - 100).toFixed(0) }); break;
                                case 'holiday': label = t('overtimeHoliday', { rate: (tier.rate * 100 - 100).toFixed(0) }); break;
                                default: label = t('overtimeTierLabel', { rate: (tier.rate * 100 - 100).toFixed(0) });
                            }
                            return(
                            <p key={key}>
                                <span className="font-semibold">{label}:</span> {t('overtimeTierFormula', {
                                    hours: (tier.minutes / 60).toFixed(2),
                                    hourlyRate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                                    multiplier: tier.rate,
                                    payout: tier.payout.toLocaleString('fr-FR', { minimumFractionDigits: 0 }),
                                    currency: profile.currency
                                })}
                            </p>
                        )})}
                        <Separator className="my-2"/>
                        <p className="font-bold text-right pt-2">{t('totalEstimatedPayout')}: {reportSummary.estimatedPayout.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {profile.currency}</p>
                    </div>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">{t('estimatedDeductionsTitle')}</h4>
                    <div className="space-y-2 p-3 bg-background/50 rounded-md font-mono tabular-nums">
                        <p>{t('cnpsDeductionLabel')}: -{(reportSummary.estimatedPayout * 0.042).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {profile.currency}</p>
                        <Separator className="my-2"/>
                        <p className="font-bold text-right pt-2">{t('estimatedNetPayout')}: {(reportSummary.estimatedPayout - (reportSummary.estimatedPayout * 0.042)).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {profile.currency}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function DetailsCalculPage() {
    const tShared = useTranslations('Shared');
    const tDetails = useTranslations('DetailsCalculPage');
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const isLoading = isUserLoading || isLoadingProfile;
    
    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    if (!user) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    if (!profile || profile.monthlyBaseSalary === 0 || !profile.profession) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p><Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link></div>;

    return (
        <div className="space-y-6">
             <h1 className="text-3xl font-headline font-bold">{tDetails('title')}</h1>
            <CalculationDetails />
        </div>
    )
}

    
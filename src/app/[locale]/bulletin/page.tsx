'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, differenceInYears, eachDayOfInterval } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import { Link } from '@/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { shifts } from '@/lib/shifts';
import { getPayrollCycle } from '@/lib/utils';
import { cn } from '@/lib/utils';
import NetPayableCard from '@/components/net-payable-card';
import Image from 'next/image';

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

// This is a placeholder for a real IRPP calculation.
const calculateIRPP = (taxableSalary: number) => {
    if (taxableSalary <= 0) return 0;
    const annualTaxable = taxableSalary * 12;
    let annualIRPP = 0;
    if (annualTaxable > 5000000) {
        annualIRPP = (annualTaxable - 5000000) * 0.35 + 840000;
    } else if (annualTaxable > 3000000) {
        annualIRPP = (annualTaxable - 3000000) * 0.25 + 340000;
    } else if (annualTaxable > 2000000) {
        annualIRPP = (annualTaxable - 2000000) * 0.15 + 190000;
    } else if (annualTaxable > 0) {
        annualIRPP = annualTaxable * 0.1;
    }
    return Math.round(annualIRPP / 12);
}

export default function BulletinPage() {
    const t = useTranslations('BulletinPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

    const cycleStartString = useMemo(() => format(cycleStart, 'yyyy-MM-dd'), [cycleStart]);
    const cycleEndString = useMemo(() => format(cycleEnd, 'yyyy-MM-dd'), [cycleEnd]);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(
            collection(firestore, 'users', user.uid, 'timeEntries'),
            where('date', '>=', cycleStartString),
            where('date', '<=', cycleEndString)
        );
    }, [firestore, user, cycleStartString, cycleEndString]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

    const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const handlePrint = () => {
        window.print();
    };

    const payrollData = useMemo(() => {
        if (!timeEntries || !profile || !globalSettings) {
            return null;
        }
        
        const cycleEntries = timeEntries;
        const rates = globalSettings.overtimeRates || DEFAULT_OVERTIME_RATES;
        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;
        const baseSalary = profile.monthlyBaseSalary;

        const breakdown = {
            tier1: { minutes: 0, rate: rates.tier1, payout: 0 },
            tier2: { minutes: 0, rate: rates.tier2, payout: 0 },
            night: { minutes: 0, rate: rates.night, payout: 0 },
            sunday: { minutes: 0, rate: rates.sunday, payout: 0 },
            holiday: { minutes: 0, rate: rates.holiday, payout: 0 },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        cycleEntries.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) entriesByWeek[week] = [];
            entriesByWeek[week].push(entry);
        });

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyDaytimeOvertimeMinutes = 0;
            weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                let overtimeToProcess = entry.overtimeDuration;
                const entryDate = parseISO(entry.date);

                if (entry.isPublicHoliday) { breakdown.holiday.minutes += overtimeToProcess; continue; }
                if (getDay(entryDate) === 0) { breakdown.sunday.minutes += overtimeToProcess; continue; }
                
                const shift = shifts.find(s => s.id === entry.shiftId);
                if (shift) {
                    const shiftStartDateTime = parseISO(`${entry.date}T${shift.startTime}:00`);
                    let shiftEndDateTime = parseISO(`${entry.date}T${shift.endTime}:00`);
                    if (shiftEndDateTime <= shiftStartDateTime) shiftEndDateTime = addDays(shiftEndDateTime, 1);
                    
                    const overtimeStartDateTime = shiftEndDateTime;
                    const overtimeEndDateTime = addMinutes(overtimeStartDateTime, entry.overtimeDuration);
                    
                    const dayOfOvertime = startOfDay(overtimeStartDateTime);
                    let nightWindowStart, nightWindowEnd;
                    
                    if (getHours(overtimeStartDateTime) < 6) {
                        nightWindowStart = set(addDays(dayOfOvertime, -1), { hours: 22 });
                        nightWindowEnd = set(dayOfOvertime, { hours: 6 });
                    } else {
                        nightWindowStart = set(dayOfOvertime, { hours: 22 });
                        nightWindowEnd = set(addDays(dayOfOvertime, 1), { hours: 6 });
                    }
                    const nightOverlapMinutes = differenceInMinutes(min([overtimeEndDateTime, nightWindowEnd]), max([overtimeStartDateTime, nightWindowStart]));
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
        
        const totalOvertimePayout = Object.values(breakdown).reduce((sum, tier) => sum + tier.payout, 0);
        const nightBonusCount = cycleEntries.filter(e => e.shiftId === 'night').length;
        const nightBonusPayout = nightBonusCount * 1400;

        // --- Seniority and Absence Logic ---
        let seniorityBonus = 0;
        if (profile.hireDate) {
            const yearsOfService = differenceInYears(new Date(), parseISO(profile.hireDate));
            if (yearsOfService >= 2) {
                const bonusTiers = Math.floor(yearsOfService / 2);
                seniorityBonus = bonusTiers * (baseSalary * 0.02);
            }
        }
        
        const workDaysInCycle = eachDayOfInterval({ start: cycleStart, end: cycleEnd }).filter(day => getDay(day) !== 0); // Mon-Sat
        const workedDays = new Set(cycleEntries.map(entry => entry.date));
        const absenceCount = workDaysInCycle.filter(day => !workedDays.has(format(day, 'yyyy-MM-dd'))).length;

        let attendanceBonus = 3000;
        let performanceBonus = 4000;
        let absenceDeduction = 0;
        const transportBonus = 18325;

        if (absenceCount > 0) {
            attendanceBonus = 0;
            performanceBonus = 0;
            const dailySalaryDeduction = baseSalary / 26;
            const dailyTransportDeduction = transportBonus / 26;
            absenceDeduction = absenceCount * (dailySalaryDeduction + dailyTransportDeduction);
        }

        const housingBonus = 7280;
        const totalFixedPrimes = seniorityBonus + attendanceBonus + performanceBonus + transportBonus + housingBonus;
        const grossSalary = baseSalary + totalFixedPrimes + totalOvertimePayout + nightBonusPayout;

        // Deductions
        const cnpsDeduction = grossSalary * 0.042;
        const cacDeduction = grossSalary * 0.01;
        const taxableForIRPP = grossSalary - cnpsDeduction;
        const irppDeduction = calculateIRPP(taxableForIRPP);
        const communalTaxDeduction = 2500; 

        const totalDeductions = cnpsDeduction + irppDeduction + cacDeduction + communalTaxDeduction + absenceDeduction;
        const netPay = grossSalary - totalDeductions;

        return {
            cycleStart,
            cycleEnd,
            baseSalary,
            seniorityBonus, attendanceBonus, performanceBonus, transportBonus, housingBonus,
            overtimeBreakdown: breakdown,
            totalOvertimePayout,
            nightBonusCount,
            nightBonusPayout,
            grossSalary,
            cnpsDeduction,
            irppDeduction,
            cacDeduction,
            communalTaxDeduction,
            absenceDeduction,
            totalDeductions,
            netPay,
        };

    }, [timeEntries, profile, globalSettings, cycleStart, cycleEnd]);
    
    if (isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    }
    
    if (!user) {
        return (<div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl">{tShared('pleaseLogin')}</p>
            <Link href="/login"><Button>{tShared('loginButton')}</Button></Link>
        </div>);
    }
    
    if (!profile || profile.monthlyBaseSalary === 0) {
        return (<div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p>
            <Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link>
        </div>);
    }

    const professionLabel = profile.profession ? tProfile(`professions.${profile.profession}`) : 'N/A';
    
    if (!payrollData) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                <p className="text-muted-foreground">{t('noData')}</p>
            </div>
        );
    }

    const formatCurrency = (amount: number) => <span className='font-mono tabular-nums'>{Math.round(amount).toLocaleString('fr-FR')}</span>;
    const formatHours = (minutes: number) => (minutes / 60).toFixed(2);
    
    return (
        <div className="space-y-6">
             <style jsx global>{`
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-container { padding: 0 !important; border: none !important; box-shadow: none !important; }
                    main { padding: 0 !important; }
                }
            `}</style>
            <div className="flex flex-wrap items-center justify-between gap-4 no-print">
                <div>
                    <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                    <p className="text-muted-foreground">{t('description', {
                        startDate: format(payrollData.cycleStart, 'd MMMM', { locale: dateFnsLocale }),
                        endDate: format(payrollData.cycleEnd, 'd MMMM yyyy', { locale: dateFnsLocale })
                    })}</p>
                </div>
                <Button onClick={handlePrint} className="h-12">{t('printButton')}</Button>
            </div>

            <div className="p-1 print-container space-y-6">
                <header className="flex justify-between items-start mb-2 border-b pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-primary font-headline">{t('title')}</h2>
                        <p>{t('periodLabel')}: {format(payrollData.cycleStart, 'dd/MM/yy')} - {format(payrollData.cycleEnd, 'dd/MM/yy')}</p>
                    </div>
                    <div className='text-right'>
                        <p className="font-semibold">{profile.name}</p>
                        <p className="text-sm text-muted-foreground">{t('jobTitleLabel')}: {professionLabel}</p>
                    </div>
                </header>

                <div className="space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
                    {/* Gains Card */}
                    <Card className="md:col-span-1">
                        <CardHeader>
                            <CardTitle>{t('gainsSectionTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent className="divide-y divide-border text-sm">
                            <div className="flex justify-between py-3"><p>{t('baseSalaryLabel')}</p><p className="font-medium">{formatCurrency(payrollData.baseSalary)}</p></div>
                            {payrollData.seniorityBonus > 0 && <div className="flex justify-between py-3"><p>{t('seniorityBonusLabel')}</p><p className="font-medium">{formatCurrency(payrollData.seniorityBonus)}</p></div>}
                            <div className="flex justify-between py-3"><p>{t('attendanceBonusLabel')}</p><p className="font-medium">{formatCurrency(payrollData.attendanceBonus)}</p></div>
                            <div className="flex justify-between py-3"><p>{t('performanceBonusLabel')}</p><p className="font-medium">{formatCurrency(payrollData.performanceBonus)}</p></div>
                            <div className="flex justify-between py-3"><p>{t('transportBonusLabel')}</p><p className="font-medium">{formatCurrency(payrollData.transportBonus)}</p></div>
                            <div className="flex justify-between py-3"><p>{t('housingBonusLabel')}</p><p className="font-medium">{formatCurrency(payrollData.housingBonus)}</p></div>
                            
                            {Object.values(payrollData.overtimeBreakdown).some(tier => tier.minutes > 0) && (
                                <div className="py-3">
                                    <p className="font-semibold mb-2">{t('overtimeLabel')}</p>
                                    <div className="pl-4 space-y-2">
                                        {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) => (
                                            <div key={key} className="flex justify-between text-sm">
                                                <p className="text-muted-foreground">{t(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, { rate: (tier.rate * 100).toFixed(0) })} ({formatHours(tier.minutes)}h)</p>
                                                <p className="font-medium">{formatCurrency(tier.payout)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                             {payrollData.nightBonusPayout > 0 && (
                                 <div className="flex justify-between py-3"><p>{t('nightBonusLabel')} ({payrollData.nightBonusCount})</p><p className="font-medium">{formatCurrency(payrollData.nightBonusPayout)}</p></div>
                            )}
                            
                            <div className="flex justify-between pt-4 font-bold text-base"><p>{t('grossSalaryLabel')}</p><p>{formatCurrency(payrollData.grossSalary)} FCFA</p></div>
                        </CardContent>
                    </Card>

                    {/* Deductions Card */}
                     <Card className="md:col-span-1">
                        <CardHeader>
                            <CardTitle>{t('deductionsSectionTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent className="divide-y divide-border text-sm">
                            <div className="flex justify-between py-3"><p>{t('cnpsLabel')}</p><p className="font-medium">-{formatCurrency(payrollData.cnpsDeduction)}</p></div>
                            <div className="flex justify-between py-3"><p>{t('cacLabel')}</p><p className="font-medium">-{formatCurrency(payrollData.cacDeduction)}</p></div>
                            <div className="flex justify-between py-3"><p>{t('irppLabel')}</p><p className="font-medium">-{formatCurrency(payrollData.irppDeduction)}</p></div>
                            <div className="flex justify-between py-3"><p>{t('communalTaxLabel')}</p><p className="font-medium">-{formatCurrency(payrollData.communalTaxDeduction)}</p></div>
                            {payrollData.absenceDeduction > 0 && <div className="flex justify-between py-3"><p>{t('absenceDeductionLabel')}</p><p className="font-medium text-destructive">-{formatCurrency(payrollData.absenceDeduction)}</p></div>}
                            <div className="flex justify-between pt-4 font-bold text-base"><p>{t('totalDeductionsLabel')}</p><p>-{formatCurrency(payrollData.totalDeductions)} FCFA</p></div>
                        </CardContent>
                    </Card>
                </div>

                {/* Net Payable Card */}
                <NetPayableCard netPay={payrollData.netPay} />

                <footer className="mt-6 pt-6 border-t text-center text-xs text-muted-foreground">
                    <p>{t('footerText')}</p>
                </footer>
            </div>
        </div>
    );
}

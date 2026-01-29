'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { format, parse, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import { Link } from '@/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { shifts } from '@/lib/shifts';
import { Separator } from '@/components/ui/separator';
import { getPayrollCycle } from '@/lib/utils';

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

// Simplified IRPP calculation. THIS IS A PLACEHOLDER.
// A real implementation would require the full official tax brackets.
const calculateIRPP = (taxableSalary: number) => {
    if (taxableSalary <= 0) return 0;
    // This is a highly simplified progressive tax calculation for demonstration.
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
    return annualIRPP / 12;
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

    const timeEntriesQuery = useMemoFirebase(() => user ? collection(firestore, 'users', user.uid, 'timeEntries') : null, [firestore, user]);
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

        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

        const cycleEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= cycleStart && entryDate <= cycleEnd;
        });

        const rates = globalSettings.overtimeRates || DEFAULT_OVERTIME_RATES;
        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;

        // Overtime calculation
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
                    const shiftStartDateTime = parse(`${entry.date} ${shift.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    let shiftEndDateTime = parse(`${entry.date} ${shift.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
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

        // Night bonus calculation
        const nightBonusCount = cycleEntries.filter(e => e.shiftId === 'night').length;
        const nightBonusPayout = nightBonusCount * 1400;

        // Gross salary
        const grossSalary = profile.monthlyBaseSalary + totalOvertimePayout + nightBonusPayout;

        // Deductions
        const cnpsDeduction = grossSalary * 0.042;
        const taxableSalary = grossSalary - cnpsDeduction;
        const irppDeduction = calculateIRPP(taxableSalary);
        const cacDeduction = grossSalary * 0.01; // Assuming 1% for Crédit Foncier
        const communalTaxDeduction = 2500; // Assuming fixed amount

        const totalDeductions = cnpsDeduction + irppDeduction + cacDeduction + communalTaxDeduction;
        const netPay = grossSalary - totalDeductions;

        return {
            cycleStart,
            cycleEnd,
            baseSalary: profile.monthlyBaseSalary,
            overtimeBreakdown: breakdown,
            totalOvertimePayout,
            nightBonusCount,
            nightBonusPayout,
            grossSalary,
            cnpsDeduction,
            irppDeduction,
            cacDeduction,
            communalTaxDeduction,
            totalDeductions,
            netPay,
        };

    }, [timeEntries, profile, globalSettings]);
    
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

    const formatCurrency = (amount: number) => amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

            <Card className="p-4 sm:p-8 print-container">
                <header className="flex justify-between items-start mb-8 border-b pb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-primary font-headline">{t('title')}</h2>
                        <p>{t('periodLabel')}: {format(payrollData.cycleStart, 'dd/MM/yy')} - {format(payrollData.cycleEnd, 'dd/MM/yy')}</p>
                    </div>
                    <div className='text-right'>
                        <p className="font-semibold">{profile.name}</p>
                        <p className="text-sm text-muted-foreground">{t('jobTitleLabel')}: {professionLabel}</p>
                    </div>
                </header>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* GAINS */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold border-b pb-2">{t('gainsSectionTitle')}</h3>
                        <Table>
                            <TableBody>
                                <TableRow>
                                    <TableCell>{t('baseSalaryLabel')}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(payrollData.baseSalary)} FCFA</TableCell>
                                </TableRow>
                                {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) => (
                                    <TableRow key={key}>
                                        <TableCell className="pl-6 text-muted-foreground">
                                            {t(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, { rate: (tier.rate * 100 - 100).toFixed(0) })}
                                            <span className='ml-2 text-xs'>({formatHours(tier.minutes)}h)</span>
                                        </TableCell>
                                        <TableCell className="text-right">{formatCurrency(tier.payout)} FCFA</TableCell>
                                    </TableRow>
                                ))}
                                {payrollData.nightBonusPayout > 0 && (
                                     <TableRow>
                                        <TableCell>{t('nightBonusLabel')} ({payrollData.nightBonusCount}x)</TableCell>
                                        <TableCell className="text-right">{formatCurrency(payrollData.nightBonusPayout)} FCFA</TableCell>
                                    </TableRow>
                                )}
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell>{t('grossSalaryLabel')}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(payrollData.grossSalary)} FCFA</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {/* DEDUCTIONS */}
                     <div className="space-y-4">
                        <h3 className="text-xl font-semibold border-b pb-2">{t('deductionsSectionTitle')}</h3>
                        <Table>
                            <TableBody>
                                <TableRow>
                                    <TableCell>{t('cnpsLabel')}</TableCell>
                                    <TableCell className="text-right">-{formatCurrency(payrollData.cnpsDeduction)} FCFA</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>{t('irppLabel')}</TableCell>
                                    <TableCell className="text-right">-{formatCurrency(payrollData.irppDeduction)} FCFA</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>{t('cacLabel')}</TableCell>
                                    <TableCell className="text-right">-{formatCurrency(payrollData.cacDeduction)} FCFA</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell>{t('communalTaxLabel')}</TableCell>
                                    <TableCell className="text-right">-{formatCurrency(payrollData.communalTaxDeduction)} FCFA</TableCell>
                                </TableRow>
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell>{t('totalDeductionsLabel')}</TableCell>
                                    <TableCell className="text-right">-{formatCurrency(payrollData.totalDeductions)} FCFA</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>
                
                <Separator className="my-8" />

                <div className="text-right">
                    <p className="text-muted-foreground">{t('netPayableLabel')}</p>
                    <p className="text-3xl font-bold text-primary">{formatCurrency(payrollData.netPay)} FCFA</p>
                </div>

                <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground">
                    <p>{t('footerText')}</p>
                </footer>
            </Card>
        </div>
    );
}

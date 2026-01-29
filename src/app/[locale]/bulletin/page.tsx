'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, differenceInYears, eachDayOfInterval, parse } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import { Link } from '@/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { shifts } from '@/lib/shifts';
import { getPayrollCycle } from '@/lib/utils';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

const calculateIRPP = (grossSalary: number, transportBonus: number, housingBonus: number, cnpsDeduction: number) => {
    if (grossSalary <= 0) return 0;
    
    // The IRPP base is Gross Salary minus specific non-taxable allowances like transport.
    const netImposable = grossSalary - transportBonus; 
    
    // Professional expenses abatement (30%) on (Net Imposable - CNPS)
    const taxableBase = (netImposable - cnpsDeduction) * 0.7;
    
    const annualTaxable = taxableBase * 12;
    let annualIRPP = 0;

    if (annualTaxable <= 2000000) {
        annualIRPP = annualTaxable * 0.1;
    } else if (annualTaxable <= 3000000) {
        annualIRPP = ((annualTaxable - 2000000) * 0.15) + 200000;
    } else if (annualTaxable <= 5000000) {
        annualIRPP = ((annualTaxable - 3000000) * 0.25) + 350000;
    } else {
        annualIRPP = ((annualTaxable - 5000000) * 0.35) + 850000;
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
        
        // --- Seniority, Absence, and Fixed Bonuses ---
        let seniorityBonus = 0;
        if (profile.hireDate) {
            const yearsOfService = differenceInYears(new Date(), parseISO(profile.hireDate));
            if (yearsOfService >= 2) {
                const bonusTiers = Math.floor(yearsOfService / 2);
                seniorityBonus = bonusTiers * (baseSalary * 0.02);
            }
        }
        
        const workDaysInCycle = eachDayOfInterval({ start: cycleStart, end: cycleEnd }).filter(day => getDay(day) !== 0 && getDay(day) !== 6); // Mon-Fri
        const workedDays = new Set(cycleEntries.map(entry => entry.date));
        const absenceCount = workDaysInCycle.filter(day => !workedDays.has(format(day, 'yyyy-MM-dd'))).length;

        let attendanceBonus = 3000;
        let performanceBonus = 4000;
        let absenceDeduction = 0;
        const transportBonus = 18325;
        const housingBonus = baseSalary * 0.1; // 10% of base salary

        if (absenceCount > 0) {
            attendanceBonus = 0;
            performanceBonus = 0;
            const dailySalaryDeduction = baseSalary / 21.67; // Avg working days
            absenceDeduction = absenceCount * dailySalaryDeduction;
        }

        const grossSalary = baseSalary + seniorityBonus + attendanceBonus + performanceBonus + transportBonus + housingBonus + totalOvertimePayout - absenceDeduction;

        // Deductions
        const cnpsBase = grossSalary - transportBonus - housingBonus;
        const cnpsDeduction = cnpsBase * 0.042;
        
        const cacBase = grossSalary - transportBonus;
        const cacDeduction = cacBase * 0.01;
        
        const irppDeduction = calculateIRPP(grossSalary, transportBonus, housingBonus, cnpsDeduction);
        const cacSurIRPP = irppDeduction * 0.1; // 10% of IRPP
        const redevanceCRTV = 1950; // Fixed from payslip
        const cotisationSyndicale = baseSalary * 0.01; // 1% of base salary
        const taxeCommunale = 270; // Fixed from payslip

        const totalDeductions = cnpsDeduction + cacDeduction + irppDeduction + cacSurIRPP + redevanceCRTV + taxeCommunale + cotisationSyndicale;
        const netPay = grossSalary - totalDeductions;
        
        const totalHours = cycleEntries.reduce((acc, e) => acc + e.duration, 0) / 60;
        const totalOvertimeHours = Object.values(breakdown).reduce((acc, tier) => acc + tier.minutes, 0) / 60;

        return {
            cycleStart, cycleEnd, baseSalary, seniorityBonus, attendanceBonus, performanceBonus, transportBonus, housingBonus, absenceDeduction,
            overtimeBreakdown: breakdown, hourlyRate, totalOvertimePayout, grossSalary,
            cnpsDeduction, cnpsBase, cacDeduction, cacBase, irppDeduction, cacSurIRPP, redevanceCRTV, cotisationSyndicale, taxeCommunale,
            totalDeductions, netPay, totalHours, totalOvertimeHours
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
    
    const formatCurrency = (amount: number) => Math.round(amount).toLocaleString('fr-FR');
    const formatNumber = (num: number, decimals = 2) => num.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    
    const renderRow = (label: string, number: string | number | null, base: string | number | null, rate: string | number | null, gain: number | null, deduction: number | null, isBold=false) => (
        <TableRow className={isBold ? "font-bold" : ""}>
            <TableCell>{label}</TableCell>
            <TableCell className="text-right">{number !== null ? (typeof number === 'number' ? formatNumber(number) : number) : ''}</TableCell>
            <TableCell className="text-right">{base !== null ? (typeof base === 'number' ? formatCurrency(base) : base) : ''}</TableCell>
            <TableCell className="text-right">{rate !== null ? (typeof rate === 'number' ? formatNumber(rate,3) : rate) : ''}</TableCell>
            <TableCell className="text-right">{gain !== null ? formatCurrency(gain) : ''}</TableCell>
            <TableCell className="text-right">{deduction !== null ? formatCurrency(deduction) : ''}</TableCell>
        </TableRow>
    );

    return (
        <div className="space-y-6 pb-28">
             <style jsx global>{`
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .print-container { padding: 0 !important; border: none !important; box-shadow: none !important; }
                    main { padding: 0 !important; }
                    .print-table { font-size: 9px; }
                    .print-table th, .print-table td { padding: 4px 6px; }
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

            <div className="p-0 sm:p-6 sm:border sm:rounded-lg sm:bg-card sm:text-card-foreground print-container">
                <header className="hidden sm:flex justify-between items-start mb-6 border-b pb-4">
                    <div>
                        <Image src="/logo-om.png" alt="Company Logo" width={48} height={48} className="mb-2" />
                        <h2 className="text-2xl font-bold text-primary font-headline">{t('title')}</h2>
                        <p className="text-sm">{t('periodLabel')}: {format(payrollData.cycleStart, 'dd/MM/yy')} - {format(payrollData.cycleEnd, 'dd/MM/yy')}</p>
                    </div>
                    <div className='text-right'>
                        <p className="font-semibold">{profile.name}</p>
                        <p className="text-sm text-muted-foreground">{t('jobTitleLabel')}: {professionLabel}</p>
                    </div>
                </header>

                <div className="space-y-4 sm:hidden">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('gainsSectionTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span>{t('baseSalaryLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.baseSalary)}</span></div>
                                {payrollData.seniorityBonus > 0 && <div className="flex justify-between"><span>{t('seniorityBonusLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.seniorityBonus)}</span></div>}
                                {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) =>
                                    <div className="flex justify-between" key={`gain-${key}`}>
                                        <span>{t(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, {rate: (tier.rate * 100).toFixed(0)})}</span>
                                        <span className="font-mono">{formatCurrency(tier.payout)}</span>
                                    </div>
                                )}
                                {payrollData.attendanceBonus > 0 && <div className="flex justify-between"><span>{t('attendanceBonusLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.attendanceBonus)}</span></div>}
                                {payrollData.performanceBonus > 0 && <div className="flex justify-between"><span>{t('performanceBonusLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.performanceBonus)}</span></div>}
                                <div className="flex justify-between"><span>{t('transportBonusLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.transportBonus)}</span></div>
                                <div className="flex justify-between"><span>{t('housingBonusLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.housingBonus)}</span></div>
                                {payrollData.absenceDeduction > 0 && <div className="flex justify-between text-destructive"><span>{t('absenceDeductionLabel')}</span> <span className="font-mono">- {formatCurrency(payrollData.absenceDeduction)}</span></div>}
                                <div className="flex justify-between font-bold pt-2 border-t"><span>{t('grossSalaryLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.grossSalary)}</span></div>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>{t('deductionsSectionTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span>{t('cnpsLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.cnpsDeduction)}</span></div>
                                <div className="flex justify-between"><span>{t('cacLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.cacDeduction)}</span></div>
                                <div className="flex justify-between"><span>{t('redevanceCRTVLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.redevanceCRTV)}</span></div>
                                {payrollData.cotisationSyndicale > 0 && <div className="flex justify-between"><span>{t('cotisationSyndicaleLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.cotisationSyndicale)}</span></div>}
                                <div className="flex justify-between"><span>{t('irppLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.irppDeduction)}</span></div>
                                <div className="flex justify-between"><span>{t('cacSurIRPPLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.cacSurIRPP)}</span></div>
                                <div className="flex justify-between"><span>{t('communalTaxLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.taxeCommunale)}</span></div>
                                <div className="flex justify-between font-bold pt-2 border-t"><span>{t('totalDeductionsLabel')}</span> <span className="font-mono">{formatCurrency(payrollData.totalDeductions)}</span></div>
                            </div>
                        </CardContent>
                    </Card>
                </div>


                <div className="overflow-x-auto print-table hidden sm:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-2/5">{t('tableDesignation')}</TableHead>
                            <TableHead className="text-right">{t('tableNumber')}</TableHead>
                            <TableHead className="text-right">{t('tableBase')}</TableHead>
                            <TableHead className="text-right">{t('tableRate')}</TableHead>
                            <TableHead className="text-right">{t('tableGain')}</TableHead>
                            <TableHead className="text-right">{t('tableDeduction')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {renderRow(t('baseSalaryLabel'), "30,00", (payrollData.baseSalary / 30).toFixed(2), null, payrollData.baseSalary, null)}
                        {payrollData.seniorityBonus > 0 && renderRow(t('seniorityBonusLabel'), null, payrollData.baseSalary, '2.000', payrollData.seniorityBonus, null)}
                        {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) =>
                           React.cloneElement(
                                renderRow(t(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, {rate: (tier.rate * 100).toFixed(0)}), (tier.minutes/60).toFixed(2), payrollData.hourlyRate, tier.rate*100, tier.payout, null),
                                { key: `overtime-${key}` }
                            )
                        )}
                        {payrollData.attendanceBonus > 0 && renderRow(t('attendanceBonusLabel'), null, null, null, payrollData.attendanceBonus, null)}
                        {payrollData.performanceBonus > 0 && renderRow(t('performanceBonusLabel'), null, null, null, payrollData.performanceBonus, null)}
                        {renderRow(t('transportBonusLabel'), null, null, null, payrollData.transportBonus, null)}
                        {renderRow(t('housingBonusLabel'), payrollData.baseSalary, 0.1, 10, payrollData.housingBonus, null)}
                        {payrollData.absenceDeduction > 0 && renderRow(t('absenceDeductionLabel'), null, null, null, null, null, payrollData.absenceDeduction)}

                        {renderRow(t('grossMonthlySalaryLabel'), null, null, null, null, null, true)}
                        {renderRow('', null, null, null, payrollData.grossSalary, null, true)}
                        
                        <TableRow><TableCell colSpan={6} className="h-4"></TableCell></TableRow>

                        {renderRow(t('cnpsLabel'), payrollData.cnpsBase, '4.200', null, null, payrollData.cnpsDeduction)}
                        {renderRow(t('cacLabel'), payrollData.cacBase, '1.000', null, null, payrollData.cacDeduction)}
                        {renderRow(t('redevanceCRTVLabel'), null, null, null, null, payrollData.redevanceCRTV)}
                        {payrollData.cotisationSyndicale > 0 && renderRow(t('cotisationSyndicaleLabel'), payrollData.baseSalary, '1.000', null, null, payrollData.cotisationSyndicale)}
                        {renderRow(t('irppLabel'), null, null, null, null, payrollData.irppDeduction)}
                        {renderRow(t('cacSurIRPPLabel'), payrollData.irppDeduction, '10.000', null, null, payrollData.cacSurIRPP)}
                        {renderRow(t('communalTaxLabel'), null, null, null, null, payrollData.taxeCommunale)}

                        {renderRow(t('totalDeductionsLabel'), null, null, null, null, null, true)}
                        {renderRow('', null, null, null, null, payrollData.totalDeductions, true)}
                    </TableBody>
                </Table>
                </div>
                
                <div className="flex justify-center sm:justify-end mt-8">
                  <div className="border-2 border-primary rounded-2xl p-4 w-full max-w-sm bg-primary/5">
                      <div className="flex justify-between items-center font-bold text-lg">
                          <span className="text-primary">{t('netPayableLabel')}</span>
                          <span className="text-primary font-mono tabular-nums">{formatCurrency(payrollData.netPay)} FCFA</span>
                      </div>
                  </div>
                </div>

                <footer className="mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
                    <p>{t('footerText')}</p>
                </footer>
            </div>
        </div>
    );
}

    
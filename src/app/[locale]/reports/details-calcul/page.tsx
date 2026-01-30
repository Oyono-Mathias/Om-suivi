'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTranslations } from "next-intl";
import type { Profile, GlobalSettings, TimeEntry, AttendanceOverride } from "@/lib/types";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { getPayrollCycle } from '@/lib/utils';
import { shifts } from '@/lib/shifts';
import { parseISO, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, getDay, parse, differenceInYears, eachDayOfInterval, format } from "date-fns";
import { Loader2 } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';

// Calculation logic from bulletin/page.tsx
const calculateIRPP = (grossSalary: number, transportBonus: number, housingBonus: number, cnpsDeduction: number) => {
    if (grossSalary <= 0) return 0;
    const netImposable = grossSalary - transportBonus; 
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

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

export default function DetailsCalculPage() {
    const tShared = useTranslations('Shared');
    const tDetails = useTranslations('DetailsCalculPage');
    const tBulletin = useTranslations('BulletinPage');
    const tProfile = useTranslations('ProfilePage');
    const tReports = useTranslations('ReportsPage');

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const { start: cycleStart, end: cycleEnd } = useMemo(() => getPayrollCycle(new Date()), []);
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

    const settingsRef = useMemoFirebase(() => (user ? doc(firestore, 'settings', 'global') : null), [firestore, user]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const overridesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'users', user.uid, 'attendanceOverrides'),
            where('__name__', '>=', cycleStartString),
            where('__name__', '<=', cycleEndString)
        );
    }, [firestore, user, cycleStartString, cycleEndString]);
    const { data: attendanceOverrides, isLoading: isLoadingOverrides } = useCollection<AttendanceOverride>(overridesQuery);

     const payrollData = useMemo(() => {
        if (!timeEntries || !profile || !globalSettings || !attendanceOverrides) return null;
        
        const rates = globalSettings.overtimeRates || DEFAULT_OVERTIME_RATES;
        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;
        const baseSalary = profile.monthlyBaseSalary;

        const overtimeBreakdown = {
            tier1: { minutes: 0, rate: rates.tier1, payout: 0 },
            tier2: { minutes: 0, rate: rates.tier2, payout: 0 },
            night: { minutes: 0, rate: rates.night, payout: 0 },
            sunday: { minutes: 0, rate: rates.sunday, payout: 0 },
            holiday: { minutes: 0, rate: rates.holiday, payout: 0 },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        timeEntries.forEach(entry => {
            const weekNum = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[weekNum]) entriesByWeek[weekNum] = [];
            entriesByWeek[weekNum].push(entry);
        });

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyDaytimeOvertimeMinutes = 0;
            weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                let overtimeToProcess = entry.overtimeDuration;
                const entryDate = parseISO(entry.date);

                if (entry.isPublicHoliday) { overtimeBreakdown.holiday.minutes += overtimeToProcess; continue; }
                if (getDay(entryDate) === 0) { overtimeBreakdown.sunday.minutes += overtimeToProcess; continue; }
                
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
                        overtimeBreakdown.night.minutes += nightOverlapMinutes;
                        overtimeToProcess -= nightOverlapMinutes;
                    }
                }
                
                if (overtimeToProcess > 0) {
                    const weeklyTier1CapInMinutes = 8 * 60;
                    const remainingTier1Capacity = weeklyTier1CapInMinutes - weeklyDaytimeOvertimeMinutes;
                    const minutesForTier1 = Math.min(overtimeToProcess, remainingTier1Capacity);
                    if (minutesForTier1 > 0) overtimeBreakdown.tier1.minutes += minutesForTier1;
                    const minutesForTier2 = overtimeToProcess - minutesForTier1;
                    if (minutesForTier2 > 0) overtimeBreakdown.tier2.minutes += minutesForTier2;
                    weeklyDaytimeOvertimeMinutes += overtimeToProcess;
                }
            }
        }
        
        overtimeBreakdown.tier1.payout = (overtimeBreakdown.tier1.minutes / 60) * hourlyRate * rates.tier1;
        overtimeBreakdown.tier2.payout = (overtimeBreakdown.tier2.minutes / 60) * hourlyRate * rates.tier2;
        overtimeBreakdown.night.payout = (overtimeBreakdown.night.minutes / 60) * hourlyRate * rates.night;
        overtimeBreakdown.sunday.payout = (overtimeBreakdown.sunday.minutes / 60) * hourlyRate * rates.sunday;
        overtimeBreakdown.holiday.payout = (overtimeBreakdown.holiday.minutes / 60) * hourlyRate * rates.holiday;
        
        let seniorityBonus = 0;
        if (profile.hireDate) {
            try {
                const seniorityYears = differenceInYears(new Date(), parseISO(profile.hireDate));
                if (seniorityYears > 0) {
                    seniorityBonus = baseSalary * 0.017 * seniorityYears;
                }
            } catch (e) { console.error("Could not parse hireDate", profile.hireDate); }
        }

        let attendanceBonus = 3000;
        let performanceBonus = 4000;
        
        const cycleWorkDays = eachDayOfInterval({ start: cycleStart, end: min([cycleEnd, new Date()]) }).filter(d => getDay(d) !== 0);
        const workedDays = new Set(timeEntries.map(e => e.date));
        const sickLeaveDays = new Set(attendanceOverrides.filter(o => o.status === 'sick_leave').map(o => o.id));

        let unjustifiedAbsenceCount = 0;
        if (profile.hireDate) {
            const hireDate = parseISO(profile.hireDate);
            for (const day of cycleWorkDays) {
                const dayString = format(day, 'yyyy-MM-dd');
                if (day >= startOfDay(hireDate) && !workedDays.has(dayString) && !sickLeaveDays.has(dayString)) {
                    unjustifiedAbsenceCount++;
                }
            }
        }
        
        const totalWorkableDaysInCycle = cycleWorkDays.length;
        const totalDaysWorked = workedDays.size + sickLeaveDays.size;
        const proratedBaseSalary = (baseSalary / totalWorkableDaysInCycle) * totalDaysWorked;
        
        if (unjustifiedAbsenceCount > 0) {
            attendanceBonus = 0;
            performanceBonus = 0;
        }
        
        const transportBonus = (18325 / 26) * (totalDaysWorked); 
        const housingBonus = proratedBaseSalary * 0.1;
        const totalOvertimePayout = Object.values(overtimeBreakdown).reduce((sum, tier) => sum + tier.payout, 0);

        const totalEarnings = proratedBaseSalary + seniorityBonus + attendanceBonus + performanceBonus + totalOvertimePayout + transportBonus + housingBonus;
        
        const cnpsBase = totalEarnings - transportBonus - housingBonus;
        const cnpsDeduction = cnpsBase * 0.042;
        const cacBase = totalEarnings - transportBonus;
        const cacDeduction = cacBase * 0.01;
        const irppDeduction = calculateIRPP(totalEarnings, transportBonus, housingBonus, cnpsDeduction);
        const cacSurIRPP = irppDeduction * 0.1;
        const redevanceCRTV = 1950;
        const cotisationSyndicale = proratedBaseSalary * 0.01;
        const taxeCommunale = 270;

        const totalDeductions = cnpsDeduction + cacDeduction + irppDeduction + cacSurIRPP + redevanceCRTV + taxeCommunale + cotisationSyndicale;
        const netPay = totalEarnings - totalDeductions;

        return {
            hourlyRate,
            baseSalary: proratedBaseSalary, transportBonus, housingBonus,
            seniorityBonus, attendanceBonus, performanceBonus,
            overtimeBreakdown,
            totalOvertimePayout,
            grossSalary: totalEarnings,
            cnpsDeduction, cacDeduction, irppDeduction, cacSurIRPP, redevanceCRTV, cotisationSyndicale, taxeCommunale,
            totalDeductions, netPay
        };
    }, [timeEntries, profile, globalSettings, attendanceOverrides, cycleStart, cycleEnd]);

    const isLoading = isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings || isLoadingOverrides;
    
    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    if (!user) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    if (!profile || profile.monthlyBaseSalary === 0 || !profile.profession) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p><Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link></div>;

    const formatCurrency = (amount: number) => Math.round(amount).toLocaleString('fr-FR');

    return (
        <div className="space-y-6">
             <h1 className="text-3xl font-headline font-bold">{tDetails('title')}</h1>
             <p className="text-muted-foreground">{tDetails('description')}</p>
            
            {payrollData && (
                 <Card>
                    <CardContent className="p-0">
                        <Accordion type="single" collapsible className="w-full" defaultValue="gains">
                            <AccordionItem value="gains">
                                <AccordionTrigger className="text-lg font-semibold px-6">{tBulletin('gainsSectionTitle')}</AccordionTrigger>
                                <AccordionContent className="space-y-2 pt-2 text-sm px-6">
                                    <p><strong>{tBulletin('baseSalaryLabel')}:</strong> {formatCurrency(payrollData.baseSalary)} {profile.currency}</p>
                                    <p><strong>{tBulletin('seniorityBonusLabel')}:</strong> {formatCurrency(payrollData.seniorityBonus)} {profile.currency}</p>
                                    <p><strong>{tBulletin('attendanceBonusLabel')}:</strong> {formatCurrency(payrollData.attendanceBonus)} {profile.currency}</p>
                                    <p><strong>{tBulletin('performanceBonusLabel')}:</strong> {formatCurrency(payrollData.performanceBonus)} {profile.currency}</p>
                                    <p><strong>{tBulletin('transportBonusLabel')}:</strong> {formatCurrency(payrollData.transportBonus)} {profile.currency}</p>
                                    <p><strong>{tBulletin('housingBonusLabel')}:</strong> {formatCurrency(payrollData.housingBonus)} {profile.currency}</p>
                                    <p><strong>{tBulletin('overtimeLabel')}:</strong> {formatCurrency(payrollData.totalOvertimePayout)} {profile.currency}</p>
                                    <hr className="my-2"/>
                                    <p className="font-bold">{tBulletin('grossSalaryLabel')}: {formatCurrency(payrollData.grossSalary)} {profile.currency}</p>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="overtime">
                                <AccordionTrigger className="text-lg font-semibold px-6">{tReports('overtimePayoutFormulaTitle')}</AccordionTrigger>
                                <AccordionContent className="space-y-3 pt-4 text-sm px-6">
                                    <div className="p-3 bg-muted/50 rounded-md font-mono text-center text-base">
                                        <p>{tReports('hourlyRateFormulaTitle')}: {profile.monthlyBaseSalary} / 173.33 = {payrollData.hourlyRate} {profile.currency}/h</p>
                                    </div>
                                    <div className="p-3 bg-muted/50 rounded-md font-mono text-sm space-y-1">
                                        {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) => (
                                        <p key={key}>
                                            {tBulletin(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, {rate: (tier.rate * 100).toFixed(0)})}: {(tier.minutes/60).toFixed(2)}h &times; ({payrollData.hourlyRate} &times; {tier.rate}) = {formatCurrency(tier.payout)} {profile.currency}
                                        </p>
                                    ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="deductions">
                                <AccordionTrigger className="text-lg font-semibold px-6">{tBulletin('deductionsSectionTitle')}</AccordionTrigger>
                                <AccordionContent className="space-y-2 pt-2 text-sm px-6">
                                    <p><strong>{tBulletin('cnpsLabel')}:</strong> {formatCurrency(payrollData.cnpsDeduction)} {profile.currency}</p>
                                    <p><strong>{tBulletin('cacLabel')}:</strong> {formatCurrency(payrollData.cacDeduction)} {profile.currency}</p>
                                    <p><strong>{tBulletin('irppLabel')}:</strong> {formatCurrency(payrollData.irppDeduction)} {profile.currency}</p>
                                    <p><strong>{tBulletin('redevanceCRTVLabel')}:</strong> {formatCurrency(payrollData.redevanceCRTV)} {profile.currency}</p>
                                    <p><strong>{tBulletin('cacSurIRPPLabel')}:</strong> {formatCurrency(payrollData.cacSurIRPP)} {profile.currency}</p>
                                    <p><strong>{tBulletin('communalTaxLabel')}:</strong> {formatCurrency(payrollData.taxeCommunale)} {profile.currency}</p>
                                    <p><strong>{tBulletin('cotisationSyndicaleLabel')}:</strong> {formatCurrency(payrollData.cotisationSyndicale)} {profile.currency}</p>
                                    <hr className="my-2"/>
                                    <p className="font-bold">{tBulletin('totalDeductionsLabel')}: {formatCurrency(payrollData.totalDeductions)} {profile.currency}</p>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="net">
                                <AccordionTrigger className="text-lg font-semibold px-6">{tBulletin('netPayableLabel')}</AccordionTrigger>
                                <AccordionContent className="space-y-2 pt-4 text-2xl font-bold text-center text-primary px-6">
                                {formatCurrency(payrollData.netPay)} {profile.currency}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

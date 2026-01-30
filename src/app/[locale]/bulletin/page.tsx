
'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, differenceInYears, eachDayOfInterval, differenceInCalendarMonths } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings, AttendanceOverride } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { shifts } from '@/lib/shifts';
import { getPayrollCycle, cn } from '@/lib/utils';
import Image from 'next/image';

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

const calculateIRPP = (grossSalary: number, transportBonus: number, housingBonus: number, cnpsDeduction: number) => {
    if (grossSalary <= 0) return 0;
    
    // Net imposable is gross earnings minus transport allowance.
    const netImposable = grossSalary - transportBonus; 
    
    // Taxable base is 70% of (net imposable minus CNPS deduction).
    const taxableBase = (netImposable - cnpsDeduction) * 0.7;
    
    const annualTaxable = taxableBase * 12;
    let annualIRPP = 0;

    // Progressive tax brackets for Cameroon
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

// Reusable component for paystub line items
const PaystubRow = ({ label, value, isAbsence, isTotal }: { label: string; value: string; isAbsence?: boolean; isTotal?: boolean; }) => (
    <div className={cn("flex justify-between items-center text-sm", isTotal && "font-bold pt-2 border-t mt-2 border-muted-foreground/20")}>
        <span className={cn("text-card-foreground/80", isAbsence && "text-destructive" )}>{label}</span>
        <span className={cn("font-mono tabular-nums", isAbsence ? "text-destructive" : "text-card-foreground")}>{value}</span>
    </div>
);


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

    const settingsRef = useMemoFirebase(() => user ? doc(firestore, 'settings', 'global') : null, [firestore, user]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const overridesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'users', user.uid, 'attendanceOverrides'),
            where('__name__', '>=', cycleStartString),
            where('__name__', '<=', cycleEndString)
        );
    }, [firestore, user, cycleStartString, cycleEndString]);
    const { data: attendanceOverrides, isLoading: isLoadingOverrides } = useCollection<AttendanceOverride>(overridesQuery);

    const handlePrint = () => {
        window.print();
    };

    const payrollData = useMemo(() => {
        if (!timeEntries || !profile || !globalSettings || !attendanceOverrides) {
            return null;
        }
        
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
                    const shiftStartDateTime = parseISO(`${entry.date}T${shift.startTime}`);
                    let shiftEndDateTime = parseISO(`${entry.date}T${shift.endTime}`);
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
        
        const totalOvertimePayout = Object.values(overtimeBreakdown).reduce((sum, tier) => sum + tier.payout, 0);

        let seniorityBonus = 0;
        if (profile.hireDate) {
            try {
                const seniorityYears = differenceInYears(new Date(), parseISO(profile.hireDate));
                if (seniorityYears > 0) {
                    // 1.7% per year of service
                    seniorityBonus = baseSalary * 0.017 * seniorityYears;
                }
            } catch (e) {
                console.error("Could not parse hireDate", profile.hireDate);
            }
        }

        let attendanceBonus = 3000;
        let performanceBonus = 4000;
        let absenceDeduction = 0;
        let unjustifiedAbsenceCount = 0;
        let sickLeaveCount = 0;
        let preRegistrationAbsenceCount = 0;
        
        if (profile.hireDate) {
            const hireDate = parseISO(profile.hireDate);
            const cycleWorkDays = eachDayOfInterval({ start: cycleStart, end: min([cycleEnd, new Date()]) })
              .filter(d => getDay(d) !== 0); // Mon-Sat are work days
            
            const workedDays = new Set(timeEntries.map(e => e.date));
            const overridesMap = new Map(attendanceOverrides.map(o => [o.id, o.status]));

            for (const day of cycleWorkDays) {
                const dayString = format(day, 'yyyy-MM-dd');
                
                if (day < startOfDay(hireDate)) {
                    preRegistrationAbsenceCount++;
                } else {
                    if (!workedDays.has(dayString)) {
                        const status = overridesMap.get(dayString);
                        if (status === 'sick_leave') {
                            sickLeaveCount++;
                        } else {
                            unjustifiedAbsenceCount++;
                        }
                    }
                }
            }
        }
        
        const totalAbsenceForDeduction = unjustifiedAbsenceCount + preRegistrationAbsenceCount;
        if (totalAbsenceForDeduction > 0) {
            const salaryDeduction = totalAbsenceForDeduction * 3360;
            const transportDeduction = totalAbsenceForDeduction * 705;
            absenceDeduction = salaryDeduction + transportDeduction;
        }

        if (unjustifiedAbsenceCount > 0) {
            attendanceBonus = 0;
            performanceBonus = 0;
        }
        
        const transportBonus = 18325;
        const housingBonus = baseSalary * 0.1;

        const totalEarnings = baseSalary + totalOvertimePayout + seniorityBonus + attendanceBonus + performanceBonus + transportBonus + housingBonus;
        const grossSalary = totalEarnings - absenceDeduction;
        
        const cnpsBase = totalEarnings - transportBonus - housingBonus;
        const cnpsDeduction = cnpsBase * 0.042;
        
        const cacBase = totalEarnings - transportBonus;
        const cacDeduction = cacBase * 0.01;
        
        const irppDeduction = calculateIRPP(totalEarnings, transportBonus, housingBonus, cnpsDeduction);
        const cacSurIRPP = irppDeduction * 0.1;
        const redevanceCRTV = 1950;
        const cotisationSyndicale = baseSalary * 0.01;
        const taxeCommunale = 270;

        const totalDeductions = cnpsDeduction + cacDeduction + irppDeduction + cacSurIRPP + redevanceCRTV + taxeCommunale + cotisationSyndicale;
        const netPay = grossSalary - totalDeductions;

        return {
            cycleStart, cycleEnd, baseSalary, transportBonus, housingBonus,
            seniorityBonus, attendanceBonus, performanceBonus,
            absenceDeduction, unjustifiedAbsenceCount, sickLeaveCount, grossSalary,
            overtimeBreakdown, totalOvertimePayout,
            cnpsDeduction, cacDeduction, irppDeduction, cacSurIRPP, redevanceCRTV, cotisationSyndicale, taxeCommunale,
            totalDeductions, netPay
        };

    }, [timeEntries, profile, globalSettings, attendanceOverrides, cycleStart, cycleEnd]);

    const leaveData = useMemo(() => {
        if (!profile?.leaveStartDate || !profile?.hireDate || !payrollData) {
            return { accruedDays: 0, leavePayAllocation: 0, baseDays: 0, senioritySurplus: 0 };
        }
        try {
            const cycleStartDate = parseISO(profile.leaveStartDate);
            const hireDate = parseISO(profile.hireDate);
            const now = new Date();

            const monthsWorkedInCycle = differenceInCalendarMonths(now, cycleStartDate);
            const baseDays = monthsWorkedInCycle > 0 ? (monthsWorkedInCycle * 1.5) : 0;

            const seniorityYears = differenceInYears(now, hireDate);
            let senioritySurplus = 0;
            if (seniorityYears >= 5) {
                senioritySurplus = 2 + Math.floor((seniorityYears - 5) / 2) * 2;
            }
            
            const accruedDays = baseDays + senioritySurplus;
            
            const taxableGross = payrollData.grossSalary;
            const leavePayAllocation = (taxableGross / 30) * accruedDays;

            return { accruedDays, leavePayAllocation, baseDays, senioritySurplus };

        } catch (e) {
            console.error("Could not parse date for leave calculation", e);
            return { accruedDays: 0, leavePayAllocation: 0, baseDays: 0, senioritySurplus: 0 };
        }
    }, [profile?.leaveStartDate, profile?.hireDate, payrollData]);
    
    const isLoading = isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings || isLoadingOverrides;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    }
    
    if (!user) {
        return (<div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl">{tShared('pleaseLogin')}</p>
            <Link href="/login"><Button>{tShared('loginButton')}</Button></Link>
        </div>);
    }
    
    if (!profile || profile.monthlyBaseSalary === 0 || !profile.hireDate || !profile.leaveStartDate) {
        return (<div className="flex flex-col justify-center items-center h-screen gap-4 text-center">
            <p className="text-xl">{tShared('pleaseCompleteProfile')}</p>
            <p className="text-muted-foreground max-w-sm">Assurez-vous que le salaire de base, la date d'embauche et la date de début du cycle de congé sont définis dans votre profil.</p>
            <Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link>
        </div>);
    }
    
    if (!payrollData) {
        return (
            <div className="space-y-6 pb-28">
                <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                <p className="text-muted-foreground">{t('noData')}</p>
            </div>
        );
    }
    
    const formatCurrency = (amount: number) => Math.round(amount).toLocaleString('fr-FR');
    
    return (
        <div className="space-y-6 pb-28">
             <style jsx global>{`
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    main { padding: 0 !important; }
                    .print-container {
                        padding: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                    .print-primary { color: hsl(var(--primary)) !important; }
                    .print-muted { color: hsl(var(--muted-foreground)) !important; }
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
            
            <div className="space-y-6">
                {/* Mobile View */}
                <div className="space-y-4 md:hidden">
                    <Card>
                        <CardHeader><CardTitle>{t('gainsSectionTitle')}</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                             <PaystubRow label={t('baseSalaryLabel')} value={formatCurrency(payrollData.baseSalary)} />
                            {payrollData.seniorityBonus > 0 && <PaystubRow label={t('seniorityBonusLabel')} value={formatCurrency(payrollData.seniorityBonus)} />}
                            {payrollData.attendanceBonus > 0 && <PaystubRow label={t('attendanceBonusLabel')} value={formatCurrency(payrollData.attendanceBonus)} />}
                            {payrollData.performanceBonus > 0 && <PaystubRow label={t('performanceBonusLabel')} value={formatCurrency(payrollData.performanceBonus)} />}
                            {payrollData.totalOvertimePayout > 0 && <PaystubRow label={t('overtimeLabel')} value={formatCurrency(payrollData.totalOvertimePayout)} />}
                            <PaystubRow label={t('transportBonusLabel')} value={formatCurrency(payrollData.transportBonus)} />
                            <PaystubRow label={t('housingBonusLabel')} value={formatCurrency(payrollData.housingBonus)} />
                             {payrollData.sickLeaveCount > 0 && <PaystubRow label={t('paidSickLeaveLabel')} value={`${payrollData.sickLeaveCount} jours`} />}
                            <PaystubRow label={t('grossSalaryLabel')} value={formatCurrency(payrollData.grossSalary + payrollData.absenceDeduction)} isTotal />
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader><CardTitle>{t('deductionsSectionTitle')}</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            {payrollData.absenceDeduction > 0 && <PaystubRow label={t('absenceDeductionLabel')} value={`-${formatCurrency(payrollData.absenceDeduction)}`} isAbsence />}
                            <PaystubRow label={t('cnpsLabel')} value={formatCurrency(payrollData.cnpsDeduction)} />
                            <PaystubRow label={t('cacLabel')} value={formatCurrency(payrollData.cacDeduction)} />
                            <PaystubRow label={t('redevanceCRTVLabel')} value={formatCurrency(payrollData.redevanceCRTV)} />
                            {payrollData.cotisationSyndicale > 0 && <PaystubRow label={t('cotisationSyndicaleLabel')} value={formatCurrency(payrollData.cotisationSyndicale)} />}
                            <PaystubRow label={t('irppLabel')} value={formatCurrency(payrollData.irppDeduction)} />
                            <PaystubRow label={t('cacSurIRPPLabel')} value={formatCurrency(payrollData.cacSurIRPP)} />
                            <PaystubRow label={t('communalTaxLabel')} value={formatCurrency(payrollData.taxeCommunale)} />
                             <PaystubRow label={t('totalDeductionsLabel')} value={formatCurrency(payrollData.totalDeductions + payrollData.absenceDeduction)} isTotal />
                        </CardContent>
                    </Card>
                     <Card className="border-primary">
                        <CardContent className="p-4">
                             <div className="flex justify-between items-center">
                                <span className="text-lg font-bold text-primary">{t('netPayableLabel')}</span>
                                <span className="text-2xl font-bold text-primary font-mono tabular-nums">{formatCurrency(payrollData.netPay)} {profile.currency}</span>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader><CardTitle>{t('acquiredRightsTitle')}</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                             <PaystubRow label={t('accruedLeaveDaysLabel')} value={`${leaveData.accruedDays.toFixed(1)} ${t('leaveDaysUnit')}`} />
                             <p className="text-xs text-muted-foreground pl-1">Base ({leaveData.baseDays.toFixed(1)}j) + Surplus ({leaveData.senioritySurplus}j)</p>
                             <PaystubRow label={t('estimatedLeavePayLabel')} value={`${formatCurrency(leaveData.leavePayAllocation)}`} />
                        </CardContent>
                    </Card>
                </div>

                {/* Print & Desktop View */}
                 <Card className="hidden md:block print-container print:shadow-none print:border-none">
                    <CardContent className="p-6">
                         <header className="flex justify-between items-start mb-8 border-b pb-6">
                            <div className="flex items-center gap-4">
                                <Image src="/logo-om.png" alt="OM Suivi Logo" width={48} height={48} className="rounded-md" />
                                <div>
                                    <h2 className="text-2xl font-bold text-primary print-primary">{t('appName')}</h2>
                                    <p className="text-sm print-muted">{t('periodLabel')}: {format(payrollData.cycleStart, 'dd/MM/yy')} - {format(payrollData.cycleEnd, 'dd/MM/yy')}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-semibold">{t('employeeLabel')}: {profile.name}</p>
                                <p className="text-sm text-muted-foreground">{t('jobTitleLabel')}: {profile.profession ? tProfile(`professions.${profile.profession}`) : ''}</p>
                            </div>
                        </header>
                        
                        <div className="grid grid-cols-5 gap-4 text-sm">
                            <div className="col-span-3">
                                <h3 className="font-bold mb-2 border-b pb-1">{t('gainsSectionTitle')}</h3>
                                {payrollData.baseSalary > 0 && <PaystubRow label={t('baseSalaryLabel')} value={formatCurrency(payrollData.baseSalary)} />}
                                {payrollData.seniorityBonus > 0 && <PaystubRow label={t('seniorityBonusLabel')} value={formatCurrency(payrollData.seniorityBonus)} />}
                                {payrollData.attendanceBonus > 0 && <PaystubRow label={t('attendanceBonusLabel')} value={formatCurrency(payrollData.attendanceBonus)} />}
                                {payrollData.performanceBonus > 0 && <PaystubRow label={t('performanceBonusLabel')} value={formatCurrency(payrollData.performanceBonus)} />}
                                {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) => (
                                    <PaystubRow key={`gain-${key}`} label={t(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, {rate: (tier.rate * 100).toFixed(0)})} value={formatCurrency(tier.payout)} />
                                ))}
                                {payrollData.transportBonus > 0 && <PaystubRow label={t('transportBonusLabel')} value={formatCurrency(payrollData.transportBonus)} />}
                                {payrollData.housingBonus > 0 && <PaystubRow label={t('housingBonusLabel')} value={formatCurrency(payrollData.housingBonus)} />}
                                 {payrollData.sickLeaveCount > 0 && <PaystubRow label={t('paidSickLeaveLabel')} value={`${payrollData.sickLeaveCount} jours`} />}
                                <PaystubRow label={t('grossSalaryLabel')} value={formatCurrency(payrollData.grossSalary + payrollData.absenceDeduction)} isTotal />
                            </div>
                            <div className="col-span-2">
                                <h3 className="font-bold mb-2 border-b pb-1">{t('deductionsSectionTitle')}</h3>
                                {payrollData.absenceDeduction > 0 && <PaystubRow label={t('absenceDeductionLabel')} value={`${formatCurrency(payrollData.absenceDeduction)}`} isAbsence />}
                                <PaystubRow label={t('cnpsLabel')} value={formatCurrency(payrollData.cnpsDeduction)} />
                                <PaystubRow label={t('cacLabel')} value={formatCurrency(payrollData.cacDeduction)} />
                                <PaystubRow label={t('redevanceCRTVLabel')} value={formatCurrency(payrollData.redevanceCRTV)} />
                                {payrollData.cotisationSyndicale > 0 && <PaystubRow label={t('cotisationSyndicaleLabel')} value={formatCurrency(payrollData.cotisationSyndicale)} />}
                                <PaystubRow label={t('irppLabel')} value={formatCurrency(payrollData.irppDeduction)} />
                                <PaystubRow label={t('cacSurIRPPLabel')} value={formatCurrency(payrollData.cacSurIRPP)} />
                                <PaystubRow label={t('communalTaxLabel')} value={formatCurrency(payrollData.taxeCommunale)} />
                                <PaystubRow label={t('totalDeductionsLabel')} value={formatCurrency(payrollData.totalDeductions + payrollData.absenceDeduction)} isTotal />
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t-2 border-primary">
                            <div className="flex justify-between items-center max-w-sm ml-auto">
                                <span className="text-xl font-bold text-primary">{t('netToPayLabel')}</span>
                                <span className="text-3xl font-bold text-primary font-mono tabular-nums">{formatCurrency(payrollData.netPay)} {profile.currency}</span>
                            </div>
                        </div>

                         <div className="mt-8 pt-4 border-t print:border-gray-300">
                             <h3 className="font-bold mb-2 text-lg">{t('acquiredRightsTitle')}</h3>
                             <div className="space-y-1 text-sm">
                                 <PaystubRow label={t('accruedLeaveDaysLabel')} value={`${leaveData.accruedDays.toFixed(1)} ${t('leaveDaysUnit')}`} />
                                 <p className="text-xs text-muted-foreground pl-2">Détail: Congé de base ({leaveData.baseDays.toFixed(1)}j) + Surplus Ancienneté ({leaveData.senioritySurplus}j)</p>
                                 <PaystubRow label={t('estimatedLeavePayLabel')} value={`${formatCurrency(leaveData.leavePayAllocation)}`} />
                             </div>
                         </div>
                    </CardContent>
                </Card>
                <p className="text-xs text-center text-muted-foreground pt-4 no-print">{t('footerText')}</p>
            </div>
        </div>
    );
}

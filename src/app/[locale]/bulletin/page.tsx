'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { format, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, differenceInYears, eachDayOfInterval, differenceInCalendarMonths } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings, AttendanceOverride } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { shifts } from '@/lib/shifts';
import { getPayrollCycle } from '@/lib/utils';
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

const TableRowItem = ({ label, base, rate, gain, deduction }: { label: string; base?: string | number; rate?: string | number; gain?: string | number; deduction?: string | number; }) => (
    <tr>
        <td className="px-2 py-1">{label}</td>
        <td className="px-2 py-1 text-center">{base ?? ''}</td>
        <td className="px-2 py-1 text-right">{rate ?? ''}</td>
        <td className="px-2 py-1 text-right font-mono tabular-nums">{gain ?? ''}</td>
        <td className="px-2 py-1 text-right font-mono tabular-nums">{deduction ?? ''}</td>
    </tr>
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

    const handlePrint = () => { window.print(); };

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
        let salaryDeduction = 0;
        
        if (profile.hireDate) {
            const hireDate = parseISO(profile.hireDate);
            const cycleWorkDays = eachDayOfInterval({ start: cycleStart, end: min([cycleEnd, new Date()]) }).filter(d => getDay(d) !== 0);
            const workedDays = new Set(timeEntries.map(e => e.date));
            const overridesMap = new Map(attendanceOverrides.map(o => [o.id, o.status]));
            
            let unjustifiedAbsenceCount = 0;
            let preRegistrationAbsenceCount = 0;

            for (const day of cycleWorkDays) {
                const dayString = format(day, 'yyyy-MM-dd');
                if (day < startOfDay(hireDate)) {
                    preRegistrationAbsenceCount++;
                } else if (!workedDays.has(dayString) && overridesMap.get(dayString) !== 'sick_leave') {
                    unjustifiedAbsenceCount++;
                }
            }
            const totalAbsenceForDeduction = unjustifiedAbsenceCount + preRegistrationAbsenceCount;
            salaryDeduction = totalAbsenceForDeduction * (3360 + 705); // Salary + Transport
            if (unjustifiedAbsenceCount > 0) {
                attendanceBonus = 0;
                performanceBonus = 0;
            }
        }
        
        const proratedBaseSalary = baseSalary - (salaryDeduction > 0 ? (unjustifiedAbsenceCount + preRegistrationAbsenceCount) * 3360 : 0);
        const transportBonus = 18325 - (salaryDeduction > 0 ? (unjustifiedAbsenceCount + preRegistrationAbsenceCount) * 705 : 0);
        const housingBonus = baseSalary * 0.1;
        const totalOvertimePayout = Object.values(overtimeBreakdown).reduce((sum, tier) => sum + tier.payout, 0);

        const totalEarnings = proratedBaseSalary + seniorityBonus + attendanceBonus + performanceBonus + totalOvertimePayout + transportBonus + housingBonus;
        
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
        const netPay = totalEarnings - totalDeductions;

        let accruedLeaveDays = 0;
        if (profile.leaveStartDate) {
            try {
                const leaveCycleStart = parseISO(profile.leaveStartDate);
                const monthsInCycle = differenceInCalendarMonths(new Date(), leaveCycleStart);
                if (monthsInCycle > 0) accruedLeaveDays = monthsInCycle * 1.5;
            } catch (e) { console.error("Could not parse leaveStartDate", profile.leaveStartDate); }
        }

        let senioritySurplusLeave = 0;
        if (profile.hireDate) {
            try {
                const seniorityYrs = differenceInYears(new Date(), parseISO(profile.hireDate));
                if (seniorityYrs >= 5) senioritySurplusLeave = 2 + Math.floor(Math.max(0, seniorityYrs - 5) / 2) * 2;
            } catch(e) { console.error("Could not parse hireDate for leave surplus", profile.hireDate); }
        }

        const totalLeaveDays = accruedLeaveDays + senioritySurplusLeave;
        const estimatedLeavePay = totalLeaveDays * (baseSalary / 24);

        return {
            cycleStart, cycleEnd, 
            baseSalary: proratedBaseSalary,
            transportBonus, housingBonus,
            seniorityBonus, attendanceBonus, performanceBonus,
            overtimeBreakdown,
            grossSalary: totalEarnings,
            cnpsDeduction, cacDeduction, irppDeduction, cacSurIRPP, redevanceCRTV, cotisationSyndicale, taxeCommunale,
            totalDeductions, netPay,
            accruedLeaveDays, senioritySurplusLeave, totalLeaveDays, estimatedLeavePay
        };
    }, [timeEntries, profile, globalSettings, attendanceOverrides, cycleStart, cycleEnd]);
    
    const isLoading = isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings || isLoadingOverrides;

    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    if (!user) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    if (!profile || profile.monthlyBaseSalary === 0 || !profile.hireDate || !profile.leaveStartDate) return <div className="flex flex-col justify-center items-center h-screen gap-4 text-center"><p className="text-xl">{tShared('pleaseCompleteProfile')}</p><p className="text-muted-foreground max-w-sm">Assurez-vous que le salaire de base, la date d'embauche et la date de début du cycle de congé sont définis dans votre profil.</p><Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link></div>;
    if (!payrollData) return <div className="space-y-6 pb-28"><h1 className="text-3xl font-headline font-bold">{t('title')}</h1><p className="text-muted-foreground">{t('noData')}</p></div>;
    
    const formatCurrency = (amount: number) => Math.round(amount).toLocaleString('fr-FR');
    
    return (
        <div className="space-y-6">
             <style jsx global>{`
                @media print {
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    main { padding: 0 !important; margin: 0 !important; }
                    .no-print { display: none !important; }
                    .print-container { width: 100%; border: 1px solid black; padding: 1.5rem; margin: 0; box-shadow: none; }
                    .print-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
                    .print-table th, .print-table td { border: 1px solid black; padding: 4px; }
                    .print-table th { background-color: #f2f2f2 !important; font-weight: bold; text-align: center; }
                    .break-inside-avoid { break-inside: avoid; }
                }
            `}</style>

            <div className="flex flex-wrap items-center justify-between gap-4 no-print">
                <div>
                    <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                    <p className="text-muted-foreground">{t('description', { startDate: format(payrollData.cycleStart, 'd MMMM', { locale: dateFnsLocale }), endDate: format(payrollData.cycleEnd, 'd MMMM yyyy', { locale: dateFnsLocale })})}</p>
                </div>
                <Button onClick={handlePrint} className="h-12">{t('printButton')}</Button>
            </div>
            
            <div className="print-container bg-card md:border md:rounded-lg md:p-6">
                 <header className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <Image src="/logo-om.png" alt="OM Suivi Logo" width={48} height={48} className="rounded-md" />
                        <div>
                            <h2 className="text-lg font-bold">{t('appName')}</h2>
                            <p className="text-xs">BP: 1234, Douala</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-xl font-bold">BULLETIN DE PAIE</h1>
                        <p className="text-sm">{t('periodLabel')}: {format(payrollData.cycleStart, 'dd/MM/yyyy')} au {format(payrollData.cycleEnd, 'dd/MM/yyyy')}</p>
                    </div>
                </header>
                
                <div className="border-y-2 border-black my-4 py-2 px-2 text-sm grid grid-cols-2">
                    <div>
                        <p><strong>{profile.name}</strong></p>
                        <p>{profile.profession ? tProfile(`professions.${profile.profession}`) : ''}</p>
                    </div>
                    <div className="text-right">
                        <p>Matricule: 00123</p>
                        <p>Ancienneté: {differenceInYears(new Date(), parseISO(profile.hireDate || ''))} ans</p>
                    </div>
                </div>

                <table className="print-table w-full text-sm font-sans mb-4">
                    <thead>
                        <tr className="bg-muted">
                            <th className="w-2/5 px-2 py-1 text-left">{t('tableDesignation')}</th>
                            <th className="w-1/5 px-2 py-1 text-center">{t('tableBase')} / Nombre</th>
                            <th className="w-1/5 px-2 py-1 text-right">{t('tableRate')}</th>
                            <th className="w-1/5 px-2 py-1 text-right">{t('tableGain')}</th>
                            <th className="w-1/5 px-2 py-1 text-right">{t('tableDeduction')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {payrollData.baseSalary > 0 && <TableRowItem label={t('baseSalaryLabel')} base="173.33" rate={Math.round(profile.monthlyBaseSalary / 173.33)} gain={formatCurrency(payrollData.baseSalary)} />}
                        {payrollData.seniorityBonus > 0 && <TableRowItem label={t('seniorityBonusLabel')} gain={formatCurrency(payrollData.seniorityBonus)} />}
                        {payrollData.attendanceBonus > 0 && <TableRowItem label={t('attendanceBonusLabel')} gain={formatCurrency(payrollData.attendanceBonus)} />}
                        {payrollData.performanceBonus > 0 && <TableRowItem label={t('performanceBonusLabel')} gain={formatCurrency(payrollData.performanceBonus)} />}
                        {Object.entries(payrollData.overtimeBreakdown).filter(([,tier]) => tier.minutes > 0).map(([key, tier]) => (
                            <TableRowItem key={`gain-${key}`} label={t(`overtime${key.charAt(0).toUpperCase() + key.slice(1)}` as any, {rate: (tier.rate * 100).toFixed(0)})} base={(tier.minutes/60).toFixed(2)} rate={Math.round(tier.rate * (profile.monthlyBaseSalary / 173.33))} gain={formatCurrency(tier.payout)} />
                        ))}
                        {payrollData.transportBonus > 0 && <TableRowItem label={t('transportBonusLabel')} gain={formatCurrency(payrollData.transportBonus)} />}
                        {payrollData.housingBonus > 0 && <TableRowItem label={t('housingBonusLabel')} gain={formatCurrency(payrollData.housingBonus)} />}
                        <tr className="font-bold bg-muted/50">
                            <td colSpan={3} className="px-2 py-1 text-right">{t('grossMonthlySalaryLabel')}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums">{formatCurrency(payrollData.grossSalary)}</td>
                            <td></td>
                        </tr>
                        <TableRowItem label={t('cnpsLabel')} base={formatCurrency(payrollData.grossSalary - payrollData.transportBonus - payrollData.housingBonus)} rate="4.20%" deduction={formatCurrency(payrollData.cnpsDeduction)} />
                        <TableRowItem label={t('cacLabel')} base={formatCurrency(payrollData.grossSalary - payrollData.transportBonus)} rate="1.00%" deduction={formatCurrency(payrollData.cacDeduction)} />
                        <TableRowItem label={t('redevanceCRTVLabel')} deduction={formatCurrency(payrollData.redevanceCRTV)} />
                        {payrollData.cotisationSyndicale > 0 && <TableRowItem label={t('cotisationSyndicaleLabel')} deduction={formatCurrency(payrollData.cotisationSyndicale)} />}
                        <TableRowItem label={t('irppLabel')} deduction={formatCurrency(payrollData.irppDeduction)} />
                        <TableRowItem label={t('cacSurIRPPLabel')} base={formatCurrency(payrollData.irppDeduction)} rate="10.00%" deduction={formatCurrency(payrollData.cacSurIRPP)} />
                        <TableRowItem label={t('communalTaxLabel')} deduction={formatCurrency(payrollData.taxeCommunale)} />
                    </tbody>
                </table>
                
                <div className="flex justify-end break-inside-avoid">
                    <div className="w-full max-w-sm">
                        <table className="print-table w-full text-sm">
                           <tbody>
                                <tr>
                                    <td className="px-2 py-1 font-bold">{t('grossSalaryLabel')}</td>
                                    <td className="px-2 py-1 text-right font-mono tabular-nums">{formatCurrency(payrollData.grossSalary)}</td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-1 font-bold">{t('totalDeductionsLabel')}</td>
                                    <td className="px-2 py-1 text-right font-mono tabular-nums">{formatCurrency(payrollData.totalDeductions)}</td>
                                </tr>
                                <tr className="bg-primary/10 text-primary-foreground">
                                    <td className="p-2 font-bold text-lg">{t('netToPayLabel')}</td>
                                    <td className="p-2 text-right font-bold text-xl font-mono tabular-nums">{formatCurrency(payrollData.netPay)}</td>
                                </tr>
                           </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t break-inside-avoid">
                    <h3 className="font-bold text-sm mb-2">{t('acquiredRightsTitle')}</h3>
                    <table className="print-table w-full max-w-xs text-xs">
                        <thead>
                            <tr className="bg-muted">
                                <th className="px-2 py-1 text-left">Compteur</th>
                                <th className="px-2 py-1 text-right">Acquis</th>
                                <th className="px-2 py-1 text-right">Pris</th>
                                <th className="px-2 py-1 text-right">Solde</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="px-2 py-1">Congés payés (jours)</td>
                                <td className="px-2 py-1 text-right font-mono tabular-nums">{payrollData.totalLeaveDays.toFixed(2)}</td>
                                <td className="px-2 py-1 text-right font-mono tabular-nums">0.00</td>
                                <td className="px-2 py-1 text-right font-mono tabular-nums">{payrollData.totalLeaveDays.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

            </div>
            <p className="text-xs text-center text-muted-foreground pt-4 no-print">{t('footerText')}</p>
        </div>
    );
}

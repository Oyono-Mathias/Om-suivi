'use client';

import React, { useMemo } from 'react';
import { toDate } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { format, parseISO, getDay, getWeek, addDays, set, getHours, startOfDay, addMinutes, differenceInMinutes, max, min, differenceInYears, eachDayOfInterval, parse } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import type { TimeEntry, Profile, GlobalSettings, AttendanceOverride } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection, query, where } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/navigation';
import { shifts } from '@/lib/shifts';
import { calculateCameroonPayrollDeductions, calculatePayrollProration } from '@/lib/payroll-calculations';
import { getPayrollCycle, formatCurrency } from '@/lib/utils';
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

type PayrollTableRowProps = {
    code: string;
    label: string;
    base?: string | number;
    rate?: string | number;
    gain?: string | number;
    deduction?: string | number;
};

const PayrollTableRow = ({
    code, label, base = '', rate = '', gain = '', deduction = '',
}: PayrollTableRowProps) => (
    <tr className="border-b border-gray-400">
        <td className="border border-gray-700 px-2 py-1 text-center">{code}</td>
        <td className="border border-gray-700 px-2 py-1">{label}</td>
        <td className="border border-gray-700 px-2 py-1 text-center tabular-nums">{base}</td>
        <td className="border border-gray-700 px-2 py-1 text-center tabular-nums">{rate}</td>
        <td className="border border-gray-700 px-2 py-1 text-right font-mono tabular-nums">{gain}</td>
        <td className="border border-gray-700 px-2 py-1 text-right font-mono tabular-nums">{deduction}</td>
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
        
        const allowances = profile.payrollAllowances || {};
        let seniorityBonus = 0;
        if (profile.hireDate) {
            try {
                const seniorityYears = differenceInYears(new Date(), toDate(profile.hireDate));
                if (seniorityYears > 0) {
                    seniorityBonus = calculatePayrollProration(baseSalary, new Set(timeEntries.map(e => e.date)).size) * (allowances.seniorityRate ?? 0.017) * seniorityYears;
                }
            } catch (e) { /* empty */ }
        }

        let attendanceBonus = allowances.attendanceMonthly ?? 3000;
        let performanceBonus = allowances.performanceMonthly ?? 4000;
        

        const workedDays = new Set(timeEntries.map(e => e.date));
        const sickLeaveDays = new Set(attendanceOverrides.filter(o => o.status === 'sick_leave' || o.status === 'paid_leave').map(o => o.id));

        let unjustifiedAbsenceCount = 0;
        if (profile.hireDate) {
            const hireDate = toDate(profile.hireDate);
            const cycleWorkDays = eachDayOfInterval({ start: cycleStart, end: min([cycleEnd, new Date()]) }).filter(d => getDay(d) !== 0);
            for (const day of cycleWorkDays) {
                const dayString = format(day, 'yyyy-MM-dd');
                if (day >= startOfDay(hireDate) && !workedDays.has(dayString) && !sickLeaveDays.has(dayString)) {
                    unjustifiedAbsenceCount++;
                }
            }
        }
        
        // Cycle de paie du 26 au 25, avec une base de prorata conventionnelle de 30 jours.
        // Seuls les jours réellement pointés dans Suivi du Temps sont retenus.
        const totalDaysWorked = workedDays.size;
        const prorationRatio = Math.min(totalDaysWorked, 30) / 30;
        const proratedBaseSalary = calculatePayrollProration(baseSalary, totalDaysWorked);
        
        if (unjustifiedAbsenceCount > 0) {
            attendanceBonus = 0;
            performanceBonus = 0;
        }
        
        attendanceBonus = calculatePayrollProration(attendanceBonus, totalDaysWorked);
        performanceBonus = calculatePayrollProration(performanceBonus, totalDaysWorked);
        seniorityBonus = Math.round(seniorityBonus * prorationRatio);

        const basketBonus = Math.round((allowances.basketPerDay || 0) * totalDaysWorked);
        const transportPerDay = allowances.transportPerDay ?? (18325 / 26);
        const transportBonus = Math.round(transportPerDay * totalDaysWorked);
        const housingMonthly = allowances.housingMonthly ?? (baseSalary * 0.1);
        const housingBonus = calculatePayrollProration(housingMonthly, totalDaysWorked);
        const totalOvertimePayout = Object.values(overtimeBreakdown).reduce((sum, tier) => sum + tier.payout, 0);

        const totalEarnings = proratedBaseSalary + seniorityBonus + attendanceBonus + performanceBonus + basketBonus + totalOvertimePayout + transportBonus + housingBonus;
        const deductions = calculateCameroonPayrollDeductions({
            grossSalary: totalEarnings,
            baseSalary: proratedBaseSalary,
            cnpsBase: totalEarnings,
        });
        const cnpsDeduction = deductions.cnps;
        const cacDeduction = deductions.cfc;
        const irppDeduction = deductions.irpp;
        const cacSurIRPP = deductions.cac;
        const redevanceCRTV = deductions.crtv;
        const cotisationSyndicale = profile.payrollDeductions?.unionMonthly ?? 0;
        const assuranceMaladie = profile.payrollDeductions?.healthInsuranceMonthly ?? 0;
        const taxeCommunale = deductions.tdl;
        const totalDeductions = deductions.total + cotisationSyndicale + assuranceMaladie;
        // Même assiette mensuelle que le moteur IRPP, après abattement annuel de 500 000 FCFA.
        const netTaxable = Math.max(0, ((totalEarnings - deductions.cnps) * 0.7) - (500_000 / 12));
        const netPay = totalEarnings - totalDeductions;

        return {
            cycleStart, cycleEnd, 
            baseSalary: proratedBaseSalary,
            transportBonus, housingBonus, basketBonus,
            seniorityBonus, attendanceBonus, performanceBonus,
            overtimeBreakdown,
            grossSalary: totalEarnings,
            cnpsDeduction, cacDeduction, irppDeduction, cacSurIRPP, redevanceCRTV, cotisationSyndicale, assuranceMaladie, taxeCommunale,
            netTaxable, totalDeductions, netPay
        };
    }, [timeEntries, profile, globalSettings, attendanceOverrides, cycleStart, cycleEnd]);
    
    const isLoading = isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings || isLoadingOverrides;

    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    if (!user) return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    if (!profile || profile.monthlyBaseSalary === 0 || !profile.hireDate || !profile.leaveStartDate) return <div className="flex flex-col justify-center items-center h-screen gap-4 text-center"><p className="text-xl">{tShared('pleaseCompleteProfile')}</p><p className="text-muted-foreground max-w-sm">Assurez-vous que le salaire de base, la date d'embauche et la date de début du cycle de congé sont définis dans votre profil.</p><Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link></div>;
    if (!payrollData) return <div className="space-y-6 pb-28"><h1 className="text-3xl font-headline font-bold">{t('title')}</h1><p className="text-muted-foreground">{t('noData')}</p></div>;
    
    return (
        <div className="space-y-6">
             <style jsx global>{`
                @page { size: A4 portrait; margin: 10mm; }
                @media print {
                    html, body {
                        background: white !important;
                        color: black !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    body * { visibility: hidden; }
                    .print-container, .print-container * { visibility: visible; }
                    .print-container {
                        position: absolute;
                        inset: 0;
                        width: 100%;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background: white !important;
                        color: black !important;
                    }
                    .no-print { display: none !important; }
                    .print-table {
                        width: 100%;
                        min-width: 0 !important;
                        border-collapse: collapse !important;
                        font-size: 9px !important;
                    }
                    .print-table th, .print-table td {
                        border: 1px solid black !important;
                        padding: 4px !important;
                    }
                    .print-table th { background: #eee !important; }
                    .overflow-x-auto { overflow: visible !important; }
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
                        <Image src="/logo-omsuivi.png" alt="OM Suivi Logo" width={48} height={48} className="rounded-full" />
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
                        <p>Ancienneté: {differenceInYears(new Date(), toDate(profile.hireDate || ''))} ans</p>
                    </div>
                </div>
                <div className="w-full overflow-x-auto mb-4">
                    <table className="print-table w-full min-w-[900px] border-collapse border border-gray-700 text-xs font-sans">
                        <thead>
                            <tr className="bg-gray-200 text-gray-900">
                                <th className="border border-gray-700 px-2 py-2 text-center">N°</th>
                                <th className="border border-gray-700 px-2 py-2 text-left">Désignation</th>
                                <th className="border border-gray-700 px-2 py-2 text-center">Nombre / Base</th>
                                <th className="border border-gray-700 px-2 py-2 text-center">Taux</th>
                                <th className="border border-gray-700 px-2 py-2 text-right">Gain (Part salariale)</th>
                                <th className="border border-gray-700 px-2 py-2 text-right">Retenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            <PayrollTableRow code="1001" label={t('baseSalaryLabel')} base={`${new Set(timeEntries?.map(e => e.date) ?? []).size}/30 jours`} rate={formatCurrency(profile.monthlyBaseSalary)} gain={formatCurrency(payrollData.baseSalary)} />
                            <PayrollTableRow code="1020" label={t('seniorityBonusLabel')} gain={formatCurrency(payrollData.seniorityBonus)} />
                            <PayrollTableRow code="1111" label={t('overtimeTier1' as any, { rate: (payrollData.overtimeBreakdown.tier1.rate * 100).toFixed(0) })} base={`${(payrollData.overtimeBreakdown.tier1.minutes / 60).toFixed(2)} h`} rate={`${(payrollData.overtimeBreakdown.tier1.rate * 100).toFixed(0)} %`} gain={formatCurrency(payrollData.overtimeBreakdown.tier1.payout)} />
                            <PayrollTableRow code="1112" label={t('overtimeTier2' as any, { rate: (payrollData.overtimeBreakdown.tier2.rate * 100).toFixed(0) })} base={`${(payrollData.overtimeBreakdown.tier2.minutes / 60).toFixed(2)} h`} rate={`${(payrollData.overtimeBreakdown.tier2.rate * 100).toFixed(0)} %`} gain={formatCurrency(payrollData.overtimeBreakdown.tier2.payout)} />
                            <PayrollTableRow code="1113" label={t('overtimeNight' as any, { rate: (payrollData.overtimeBreakdown.night.rate * 100).toFixed(0) })} base={`${(payrollData.overtimeBreakdown.night.minutes / 60).toFixed(2)} h`} rate={`${(payrollData.overtimeBreakdown.night.rate * 100).toFixed(0)} %`} gain={formatCurrency(payrollData.overtimeBreakdown.night.payout)} />
                            <PayrollTableRow code="1114" label={t('overtimeSunday' as any, { rate: (payrollData.overtimeBreakdown.sunday.rate * 100).toFixed(0) })} base={`${(payrollData.overtimeBreakdown.sunday.minutes / 60).toFixed(2)} h`} rate={`${(payrollData.overtimeBreakdown.sunday.rate * 100).toFixed(0)} %`} gain={formatCurrency(payrollData.overtimeBreakdown.sunday.payout)} />
                            <PayrollTableRow code="1115" label={t('overtimeHoliday' as any, { rate: (payrollData.overtimeBreakdown.holiday.rate * 100).toFixed(0) })} base={`${(payrollData.overtimeBreakdown.holiday.minutes / 60).toFixed(2)} h`} rate={`${(payrollData.overtimeBreakdown.holiday.rate * 100).toFixed(0)} %`} gain={formatCurrency(payrollData.overtimeBreakdown.holiday.payout)} />
                            <PayrollTableRow code="1200" label={t('basketBonusLabel')} base={`${new Set(timeEntries?.map(e => e.date) ?? []).size} jours`} rate={formatCurrency(profile.payrollAllowances?.basketPerDay ?? 0)} gain={formatCurrency(payrollData.basketBonus)} />
                            <PayrollTableRow code="1210" label={t('attendanceBonusLabel')} gain={formatCurrency(payrollData.attendanceBonus)} />
                            <PayrollTableRow code="1220" label={t('performanceBonusLabel')} gain={formatCurrency(payrollData.performanceBonus)} />
                            <PayrollTableRow code="1230" label={t('transportBonusLabel')} base={`${new Set(timeEntries?.map(e => e.date) ?? []).size} jours`} rate={formatCurrency(profile.payrollAllowances?.transportPerDay ?? (18325 / 26))} gain={formatCurrency(payrollData.transportBonus)} />
                            <PayrollTableRow code="1240" label={t('housingBonusLabel')} gain={formatCurrency(payrollData.housingBonus)} />

                            <tr className="bg-gray-200 font-bold text-gray-900">
                                <td colSpan={4} className="border border-gray-700 px-2 py-2 text-right">TOTAL BRUT</td>
                                <td className="border border-gray-700 px-2 py-2 text-right font-mono">{formatCurrency(payrollData.grossSalary)}</td>
                                <td className="border border-gray-700 px-2 py-2" />
                            </tr>

                            <PayrollTableRow code="5010" label={t('cnpsLabel')} base={formatCurrency(payrollData.grossSalary)} rate="4,20 %" deduction={formatCurrency(payrollData.cnpsDeduction)} />
                            <PayrollTableRow code="5020" label="Crédit foncier (CFC)" base={formatCurrency(payrollData.grossSalary)} rate="1 %" deduction={formatCurrency(payrollData.cacDeduction)} />
                            <PayrollTableRow code="5030" label={t('redevanceCRTVLabel')} deduction={formatCurrency(payrollData.redevanceCRTV)} />
                            <PayrollTableRow code="5040" label={t('cotisationSyndicaleLabel')} deduction={formatCurrency(payrollData.cotisationSyndicale)} />
                            <PayrollTableRow code="5050" label={t('healthInsuranceLabel')} deduction={formatCurrency(payrollData.assuranceMaladie)} />
                            <PayrollTableRow code="5060" label={t('irppLabel')} deduction={formatCurrency(payrollData.irppDeduction)} />
                            <PayrollTableRow code="5070" label={t('cacSurIRPPLabel')} base={formatCurrency(payrollData.irppDeduction)} rate="10 %" deduction={formatCurrency(payrollData.cacSurIRPP)} />
                            <PayrollTableRow code="5080" label={t('communalTaxLabel')} deduction={formatCurrency(payrollData.taxeCommunale)} />

                            <tr className="bg-gray-200 font-bold text-gray-900">
                                <td colSpan={5} className="border border-gray-700 px-2 py-2 text-right">TOTAL DES RETENUES</td>
                                <td className="border border-gray-700 px-2 py-2 text-right font-mono">{formatCurrency(payrollData.totalDeductions)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 break-inside-avoid">
                    <table className="w-full border-collapse border border-gray-700 text-sm">
                        <tbody>
                            <tr>
                                <th className="border border-gray-700 bg-gray-200 px-3 py-2 text-left text-gray-900">Total brut</th>
                                <td className="border border-gray-700 px-3 py-2 text-right font-mono">{formatCurrency(payrollData.grossSalary)}</td>
                            </tr>
                            <tr>
                                <th className="border border-gray-700 bg-gray-200 px-3 py-2 text-left text-gray-900">Charges salariales</th>
                                <td className="border border-gray-700 px-3 py-2 text-right font-mono">{formatCurrency(payrollData.totalDeductions)}</td>
                            </tr>
                            <tr>
                                <th className="border border-gray-700 bg-gray-200 px-3 py-2 text-left text-gray-900">Net imposable</th>
                                <td className="border border-gray-700 px-3 py-2 text-right font-mono">{formatCurrency(payrollData.netTaxable)}</td>
                            </tr>
                            <tr>
                                <th className="border border-gray-700 bg-gray-200 px-3 py-2 text-left text-gray-900">Charges patronales</th>
                                <td className="border border-gray-700 px-3 py-2 text-right">Non calculées</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="flex items-end justify-end">
                        <div className="w-full border-2 border-black bg-gray-100 p-4 text-gray-950">
                            <p className="text-sm font-bold uppercase">NET À PAYER</p>
                            <p className="mt-2 text-right text-2xl font-black font-mono tabular-nums">{formatCurrency(payrollData.netPay)}</p>
                            <p className="mt-1 text-right text-xs">FCFA</p>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4">
                    <div className="flex justify-end mt-20 print:mt-16 break-inside-avoid">
                        <div className="w-64 text-center">
                            <p className="font-bold mb-16">{t('directorSignature')}</p>
                            <div className="border-t border-black pt-1 text-xs text-muted-foreground">
                                {t('signatureAndStamp')}
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-center text-muted-foreground/80 mt-12 print:mt-8">
                        {t('confidentialityNote')}
                    </p>
                </div>
            </div>
        </div>
    );
}

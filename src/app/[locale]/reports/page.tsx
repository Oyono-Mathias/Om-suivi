
"use client";

import React, { useMemo, useRef } from "react";
import { Link } from '@/navigation';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import {
  eachDayOfInterval,
  format,
  parse,
  parseISO,
  startOfWeek,
  endOfWeek,
  getDay,
  isThisWeek,
  getWeek,
  addDays,
  set,
  getHours,
  startOfDay,
  addMinutes,
  differenceInMinutes,
  max,
  min
} from "date-fns";
import type { TimeEntry, Profile, GlobalSettings } from "@/lib/types";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2, HelpCircle, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { shifts } from "@/lib/shifts";
import { getPayrollCycle } from "@/lib/utils";

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

export default function ReportsPage() {
    const t = useTranslations('ReportsPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
    const tBulletin = useTranslations('BulletinPage');
    const tExport = useTranslations('ExportReportPage');
    const detailsRef = useRef<HTMLDivElement>(null);
    
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return collection(firestore, 'users', user.uid, 'timeEntries');
    }, [firestore, user]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);
    
    const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);

    const scrollToDetails = () => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const absencePenalty = useMemo(() => {
        if (!timeEntries || !profile || !profile.hireDate) {
            return { count: 0, totalPenalty: 0 };
        }

        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

        const absenceCheckStart = max([cycleStart, parseISO(profile.hireDate)]);
        const absenceCheckEnd = min([cycleEnd, new Date()]);

        let absenceCount = 0;

        if (absenceCheckStart < absenceCheckEnd) {
            const daysInCycleToCheck = eachDayOfInterval({ start: absenceCheckStart, end: absenceCheckEnd });
            const workDays = daysInCycleToCheck.filter(day => getDay(day) !== 0); // Mon-Sat
            const workedDays = new Set(timeEntries.map(e => e.date));
            absenceCount = workDays.filter(day => !workedDays.has(format(day, 'yyyy-MM-dd'))).length;
        }
        
        if (absenceCount === 0) {
            return { count: 0, totalPenalty: 0 };
        }

        const salaryDeduction = absenceCount * 3360;
        const transportDeduction = absenceCount * 705;
        const primesLost = 7000; // Assiduité (3000) + Rendement (4000) are lost if absenceCount > 0
        const totalPenalty = salaryDeduction + transportDeduction + primesLost;
        
        return { count: absenceCount, totalPenalty };

    }, [timeEntries, profile]);

    const reportSummary = useMemo(() => {
        if (!timeEntries || !profile) {
            return {
                regularHours: '0.00',
                totalOvertimeHours: '0.00',
                estimatedPayout: 0,
                cnpsDeduction: 0,
                netPayout: 0,
                hourlyRate: 0,
                overtimeBreakdown: {
                    tier1: { minutes: 0, rate: DEFAULT_OVERTIME_RATES.tier1, payout: 0 },
                    tier2: { minutes: 0, rate: DEFAULT_OVERTIME_RATES.tier2, payout: 0 },
                    night: { minutes: 0, rate: DEFAULT_OVERTIME_RATES.night, payout: 0 },
                    sunday: { minutes: 0, rate: DEFAULT_OVERTIME_RATES.sunday, payout: 0 },
                    holiday: { minutes: 0, rate: DEFAULT_OVERTIME_RATES.holiday, payout: 0 },
                },
                rates: DEFAULT_OVERTIME_RATES
            };
        }

        const rates = globalSettings?.overtimeRates || DEFAULT_OVERTIME_RATES;
        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= cycleStart && entryDate <= cycleEnd;
        });

        let totalDurationMinutes = 0;
        monthEntries.forEach(entry => totalDurationMinutes += entry.duration);
        
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

        let totalOvertimeMinutes = 0;

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyDaytimeOvertimeMinutes = 0;
            weekEntries.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;

                totalOvertimeMinutes += entry.overtimeDuration;
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
                
                // Night Overtime Calculation
                const shift = shifts.find(s => s.id === entry.shiftId);
                if (shift) {
                    const shiftStartDateTime = parse(`${entry.date} ${shift.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    let shiftEndDateTime = parse(`${entry.date} ${shift.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    if (shiftEndDateTime <= shiftStartDateTime) shiftEndDateTime = addDays(shiftEndDateTime, 1);
                    
                    const overtimeStartDateTime = shiftEndDateTime;
                    const overtimeEndDateTime = addMinutes(overtimeStartDateTime, entry.overtimeDuration);
                    
                    const dayOfOvertime = startOfDay(overtimeStartDateTime);
                    let nightWindowStart, nightWindowEnd;
                    
                    if (getHours(overtimeStartDateTime) < 6) { // Part of previous day's night window
                        nightWindowStart = set(addDays(dayOfOvertime, -1), { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 });
                        nightWindowEnd = set(dayOfOvertime, { hours: 6, minutes: 0, seconds: 0, milliseconds: 0 });
                    } else { // Part of current day's night window
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
        const cnpsDeduction = totalPayout * 0.042;
        const netPayout = totalPayout - cnpsDeduction;

        return {
            regularHours: ((totalDurationMinutes - totalOvertimeMinutes) / 60).toFixed(2),
            totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(2),
            estimatedPayout: totalPayout,
            cnpsDeduction: cnpsDeduction,
            netPayout: netPayout,
            hourlyRate,
            overtimeBreakdown: breakdown,
            rates,
        };
    }, [timeEntries, profile, globalSettings]);


  const weeklyChartData = useMemo(() => {
    if (!timeEntries) return [];

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEntries = timeEntries.filter((entry) => isThisWeek(parseISO(entry.date), { weekStartsOn: 1 }));
    
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    return weekDays.map(day => {
      const dayEntries = weekEntries.filter(e => format(parseISO(e.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'));
      const totalDuration = dayEntries.reduce((sum, e) => sum + e.duration, 0);
      const overtimeDuration = dayEntries.reduce((sum, e) => sum + e.overtimeDuration, 0);
      
      return {
        date: format(day, 'EEE'),
        regular: parseFloat(((totalDuration - overtimeDuration) / 60).toFixed(2)),
        overtime: parseFloat((overtimeDuration / 60).toFixed(2)),
      };
    });
  }, [timeEntries]);


  const chartConfig = {
    regular: {
      label: t('chartRegular'),
      color: "hsl(var(--chart-1))",
    },
    overtime: {
      label: t('chartOvertime'),
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  if (isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings) {
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

  if (!profile || profile.monthlyBaseSalary === 0 || !profile.profession) {
    return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p>
            <Link href="/profile">
                <Button>{tShared('goToProfileButton')}</Button>
            </Link>
        </div>
    )
  }

  const professionLabel = profile.profession ? tProfile(`professions.${profile.profession}`) : 'N/A';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
                {t('description')} - <span className="font-semibold">{t('jobTitleLabel')}: {professionLabel}</span>
            </p>
        </div>
        <Link href="/reports/export">
          <Button>{t('exportButton')}</Button>
        </Link>
      </div>

      {absencePenalty.count > 0 && (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('absenceAlertTitle')}</AlertTitle>
            <AlertDescription>
                {t('absenceAlertDescription', {
                    count: absencePenalty.count,
                    penalty: absencePenalty.totalPenalty.toLocaleString('fr-FR')
                })}
            </AlertDescription>
        </Alert>
      )}
      
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>{t('financialSummaryTitle')}</CardTitle>
                        <CardDescription>{t('financialSummaryDescription')}</CardDescription>
                    </div>
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button onClick={scrollToDetails} variant="ghost" size="icon" className="cursor-pointer" aria-label={t('seeCalculationDetailsTooltip')}>
                                    <HelpCircle className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('seeCalculationDetailsTooltip')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <Card className="p-4 text-center">
                    <CardDescription>{t('regularHours')}</CardDescription>
                    <CardTitle className="text-4xl font-mono tabular-nums">{reportSummary.regularHours}<span className="text-2xl font-medium"> {t('hourUnit')}</span></CardTitle>
                </Card>
                <Card className="p-4 text-center">
                    <CardDescription>{tBulletin('overtimeLabel')}</CardDescription>
                    <CardTitle className="text-4xl text-destructive font-mono tabular-nums">{reportSummary.totalOvertimeHours}<span className="text-2xl font-medium"> {t('hourUnit')}</span></CardTitle>
                </Card>
                <Card className="p-4 text-center bg-primary/5">
                    <CardDescription className="text-primary">{tExport('estimatedPayout')}</CardDescription>
                    <CardTitle className="text-4xl text-primary font-mono tabular-nums">
                      {reportSummary.estimatedPayout.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} 
                      <span className="text-2xl font-medium"> {profile.currency}</span>
                    </CardTitle>
                </Card>
            </CardContent>
        </Card>

        <Card ref={detailsRef} className="bg-muted/30 scroll-mt-20">
            <CardHeader>
                <CardTitle>{t('calculationDetailsTitle')}</CardTitle>
                <CardDescription>{t('calculationDetailsDescription')}</CardDescription>
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
                        <p>{t('cnpsDeductionLabel')}: -{reportSummary.cnpsDeduction.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {profile.currency}</p>
                        <Separator className="my-2"/>
                        <p className="font-bold text-right pt-2">{t('estimatedNetPayout')}: {reportSummary.netPayout.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {profile.currency}</p>
                    </div>
                </div>
            </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('weeklyBreakdownTitle')}</CardTitle>
          <CardDescription>
            {t('weeklyBreakdownDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <ChartContainer config={chartConfig} className="h-64 min-w-[300px]">
              <BarChart data={weeklyChartData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  unit={t('hourUnit')}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="regular" fill="var(--color-regular)" radius={4} stackId="a" />
                <Bar dataKey="overtime" fill="var(--color-overtime)" radius={4} stackId="a" />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
    

    




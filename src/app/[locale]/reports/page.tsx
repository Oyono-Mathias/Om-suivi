
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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import {
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  getDay,
  isThisWeek,
  getWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import type { TimeEntry, Profile } from "@/lib/types";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";


const OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  sunday: 1.4,
  holiday: 1.5,
};

export default function ReportsPage() {
    const t = useTranslations('ReportsPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
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

    const scrollToDetails = () => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const reportSummary = useMemo(() => {
        if (!timeEntries || !profile) {
            return {
                regularHours: '0.00',
                overtimeHours: '0.00',
                estimatedPayout: '0.00',
                hourlyRate: 0,
                overtimeBreakdown: {
                    tier1: { minutes: 0, rate: OVERTIME_RATES.tier1, payout: 0 },
                    tier2: { minutes: 0, rate: OVERTIME_RATES.tier2, payout: 0 },
                    sunday: { minutes: 0, rate: OVERTIME_RATES.sunday, payout: 0 },
                    holiday: { minutes: 0, rate: OVERTIME_RATES.holiday, payout: 0 },
                },
            };
        }

        const currentMonthStart = startOfMonth(new Date());
        const currentMonthEnd = endOfMonth(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= currentMonthStart && entryDate <= currentMonthEnd;
        });

        let totalMinutes = 0;
        let totalOvertimeMinutes = 0;

        monthEntries.forEach(entry => {
            totalMinutes += entry.duration;
            totalOvertimeMinutes += entry.overtimeDuration;
        });

        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;

        const breakdown = {
            tier1: { minutes: 0, rate: OVERTIME_RATES.tier1, payout: 0 },
            tier2: { minutes: 0, rate: OVERTIME_RATES.tier2, payout: 0 },
            sunday: { minutes: 0, rate: OVERTIME_RATES.sunday, payout: 0 },
            holiday: { minutes: 0, rate: OVERTIME_RATES.holiday, payout: 0 },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        monthEntries.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) entriesByWeek[week] = [];
            entriesByWeek[week].push(entry);
        });

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyTotalOvertimeMinutes = 0;
            weekEntries.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;

                const dayOfWeek = getDay(parseISO(entry.date)); // Sunday is 0

                if (entry.isPublicHoliday) {
                    breakdown.holiday.minutes += entry.overtimeDuration;
                    continue; 
                }

                if (dayOfWeek === 0) {
                    breakdown.sunday.minutes += entry.overtimeDuration;
                    continue; 
                }
                
                const weeklyTier1CapInMinutes = 8 * 60;
                const overtimeAlreadyProcessedThisWeek = weeklyTotalOvertimeMinutes;
                const tier1Applicable = Math.max(0, weeklyTier1CapInMinutes - overtimeAlreadyProcessedThisWeek);
                const tier1MinutesForThisEntry = Math.min(entry.overtimeDuration, tier1Applicable);

                if (tier1MinutesForThisEntry > 0) {
                    breakdown.tier1.minutes += tier1MinutesForThisEntry;
                }

                const tier2MinutesForThisEntry = entry.overtimeDuration - tier1MinutesForThisEntry;
                if (tier2MinutesForThisEntry > 0) {
                    breakdown.tier2.minutes += tier2MinutesForThisEntry;
                }
                
                weeklyTotalOvertimeMinutes += entry.overtimeDuration;
            }
        }

        breakdown.tier1.payout = (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
        breakdown.tier2.payout = (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
        breakdown.sunday.payout = (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
        breakdown.holiday.payout = (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;

        const totalPayout = breakdown.tier1.payout + breakdown.tier2.payout + breakdown.sunday.payout + breakdown.holiday.payout;

        return {
            regularHours: ((totalMinutes - totalOvertimeMinutes) / 60).toFixed(2),
            overtimeHours: (totalOvertimeMinutes / 60).toFixed(2),
            estimatedPayout: totalPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            hourlyRate,
            overtimeBreakdown: breakdown,
        };
    }, [timeEntries, profile]);


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

  if (isUserLoading || isLoadingProfile || isLoadingEntries) {
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
      
      <Card>
        <CardHeader>
          <CardTitle>{t('financialSummaryTitle')}</CardTitle>
          <CardDescription>
            {t('financialSummaryDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-lg border bg-background/50 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('regularHours')}</p>
            <p className="text-3xl font-bold">{reportSummary.regularHours} {t('hourUnit')}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-background/50 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('overtimeHours')}</p>
            <p className="text-3xl font-bold text-destructive">{reportSummary.overtimeHours} {t('hourUnit')}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-primary/10 p-4">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
                <span>{t('estimatedPayout')}</span>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button onClick={scrollToDetails} className="cursor-pointer" aria-label={t('seeCalculationDetailsTooltip')}>
                                <HelpCircle className="h-4 w-4" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('seeCalculationDetailsTooltip')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <p className="text-3xl font-bold text-primary">{reportSummary.estimatedPayout} {profile.currency}</p>
          </div>
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
                        {t('hourlyRateFormula', {
                            salary: profile.monthlyBaseSalary.toLocaleString('fr-FR'),
                            rate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                            currency: profile.currency,
                        })}
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">{t('overtimePayoutFormulaTitle')}</h4>
                    <div className="space-y-2 p-3 bg-background/50 rounded-md">
                        {reportSummary.overtimeBreakdown.tier1.minutes > 0 && (
                            <p>
                                {t('overtimeTierLabel', { rate: (reportSummary.overtimeBreakdown.tier1.rate - 1) * 100 })}: {t('overtimeTierFormula', {
                                    hours: (reportSummary.overtimeBreakdown.tier1.minutes / 60).toFixed(2),
                                    hourlyRate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                                    multiplier: reportSummary.overtimeBreakdown.tier1.rate,
                                    payout: reportSummary.overtimeBreakdown.tier1.payout.toLocaleString('fr-FR', { minimumFractionDigits: 2 }),
                                    currency: profile.currency
                                })}
                            </p>
                        )}
                         {reportSummary.overtimeBreakdown.tier2.minutes > 0 && (
                            <p>
                                {t('overtimeTierLabel', { rate: (reportSummary.overtimeBreakdown.tier2.rate - 1) * 100 })}: {t('overtimeTierFormula', {
                                    hours: (reportSummary.overtimeBreakdown.tier2.minutes / 60).toFixed(2),
                                    hourlyRate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                                    multiplier: reportSummary.overtimeBreakdown.tier2.rate,
                                    payout: reportSummary.overtimeBreakdown.tier2.payout.toLocaleString('fr-FR', { minimumFractionDigits: 2 }),
                                    currency: profile.currency
                                })}
                            </p>
                        )}
                        {reportSummary.overtimeBreakdown.sunday.minutes > 0 && (
                            <p>
                                {t('overtimeTierLabel', { rate: (reportSummary.overtimeBreakdown.sunday.rate - 1) * 100 })}: {t('overtimeTierFormula', {
                                    hours: (reportSummary.overtimeBreakdown.sunday.minutes / 60).toFixed(2),
                                    hourlyRate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                                    multiplier: reportSummary.overtimeBreakdown.sunday.rate,
                                    payout: reportSummary.overtimeBreakdown.sunday.payout.toLocaleString('fr-FR', { minimumFractionDigits: 2 }),
                                    currency: profile.currency
                                })}
                            </p>
                        )}
                        {reportSummary.overtimeBreakdown.holiday.minutes > 0 && (
                             <p>
                                {t('overtimeTierLabel', { rate: (reportSummary.overtimeBreakdown.holiday.rate - 1) * 100 })}: {t('overtimeTierFormula', {
                                    hours: (reportSummary.overtimeBreakdown.holiday.minutes / 60).toFixed(2),
                                    hourlyRate: reportSummary.hourlyRate.toLocaleString('fr-FR'),
                                    multiplier: reportSummary.overtimeBreakdown.holiday.rate,
                                    payout: reportSummary.overtimeBreakdown.holiday.payout.toLocaleString('fr-FR', { minimumFractionDigits: 2 }),
                                    currency: profile.currency
                                })}
                            </p>
                        )}
                        <Separator className="my-2"/>
                        <p className="font-bold text-right pt-2">{t('totalEstimatedPayout')}: {reportSummary.estimatedPayout} {profile.currency}</p>
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
    

    
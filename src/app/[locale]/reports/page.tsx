
"use client";

import React, { useMemo } from "react";
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
import { Loader2 } from "lucide-react";
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
    
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid, 'userProfiles', user.uid);
    }, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return collection(firestore, 'users', user.uid, 'timeEntries');
    }, [firestore, user]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

  const monthTotals = useMemo(() => {
    if (!timeEntries || !profile) {
        return { regularHours: '0.00', overtimeHours: '0.00', estimatedPayout: '0.00' };
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
        tier1: { minutes: 0, rate: OVERTIME_RATES.tier1 },
        tier2: { minutes: 0, rate: OVERTIME_RATES.tier2 },
        sunday: { minutes: 0, rate: OVERTIME_RATES.sunday },
        holiday: { minutes: 0, rate: OVERTIME_RATES.holiday },
    };

    const entriesByWeek: { [week: number]: TimeEntry[] } = {};
    monthEntries.forEach(entry => {
        const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
        if (!entriesByWeek[week]) entriesByWeek[week] = [];
        entriesByWeek[week].push(entry);
    });

    for (const weekEntries of Object.values(entriesByWeek)) {
        let weeklyOvertimeMinutes = 0;
        weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

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

            const remainingWeeklyTier1Cap = (8 * 60) - weeklyOvertimeMinutes;
            if (remainingWeeklyTier1Cap > 0) {
                const toTier1 = Math.min(entry.overtimeDuration, remainingWeeklyTier1Cap);
                breakdown.tier1.minutes += toTier1;
                weeklyOvertimeMinutes += toTier1;
                
                const toTier2 = entry.overtimeDuration - toTier1;
                if (toTier2 > 0) {
                    breakdown.tier2.minutes += toTier2;
                    weeklyOvertimeMinutes += toTier2;
                }
            } else {
                breakdown.tier2.minutes += entry.overtimeDuration;
                weeklyOvertimeMinutes += entry.overtimeDuration;
            }
        }
    }
    
    let estimatedPayout = 0;
    estimatedPayout += (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
    estimatedPayout += (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
    estimatedPayout += (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
    estimatedPayout += (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;

    return {
      regularHours: ((totalMinutes - totalOvertimeMinutes) / 60).toFixed(2),
      overtimeHours: (totalOvertimeMinutes / 60).toFixed(2),
      estimatedPayout: estimatedPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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

  if (!profile) {
    return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p>
            <Link href="/profile">
                <Button>{tShared('goToProfileButton')}</Button>
            </Link>
        </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
                {t('description')}
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
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('regularHours')}</p>
            <p className="text-3xl font-bold">{monthTotals.regularHours} {t('hourUnit')}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('overtimeHours')}</p>
            <p className="text-3xl font-bold text-destructive">{monthTotals.overtimeHours} {t('hourUnit')}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-primary/10 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t('estimatedPayout')}</p>
            <p className="text-3xl font-bold text-primary">{monthTotals.estimatedPayout} {profile.currency}</p>
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
          <ChartContainer config={chartConfig} className="h-64">
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
        </CardContent>
      </Card>
    </div>
  );
}

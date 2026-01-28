
"use client";

import React, { useContext, useMemo } from "react";
import Link from 'next/link';
import { AppContext } from "@/context/AppContext";
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
  isThisMonth,
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
import type { TimeEntry } from "@/lib/types";

const OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  sunday: 1.4,
  holiday: 1.5,
};

export default function ReportsPage() {
  const { timeEntries, profile } = useContext(AppContext);

  const monthTotals = useMemo(() => {
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
      label: "Regular",
      color: "hsl(var(--chart-1))",
    },
    overtime: {
      label: "Overtime",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-headline font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
                A summary of your earnings and work hours.
            </p>
        </div>
        <Link href="/reports/export" passHref>
          <Button>Export Report</Button>
        </Link>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>This Month's Financial Summary</CardTitle>
          <CardDescription>
            An overview of your regular hours, overtime, and estimated earnings for the current month.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 text-center md:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">Regular Hours</p>
            <p className="text-3xl font-bold">{monthTotals.regularHours} hrs</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">Overtime Hours</p>
            <p className="text-3xl font-bold text-destructive">{monthTotals.overtimeHours} hrs</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border bg-primary/10 p-4">
            <p className="text-sm font-medium text-muted-foreground">Estimated Overtime Payout</p>
            <p className="text-3xl font-bold text-primary">{monthTotals.estimatedPayout} {profile.currency}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Hours Breakdown</CardTitle>
          <CardDescription>
            Regular vs. overtime hours logged each day of the current week.
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
                unit="h"
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

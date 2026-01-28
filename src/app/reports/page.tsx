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
} from "date-fns";
import type { TimeEntry } from "@/lib/types";

export default function ReportsPage() {
  const { timeEntries, profile } = useContext(AppContext);

  const monthEntries = timeEntries.filter((entry) => isThisMonth(parseISO(entry.date)));
  const weekEntries = timeEntries.filter((entry) => isThisWeek(parseISO(entry.date), { weekStartsOn: 1 }));

  const calculateMonthlyTotals = (entries: TimeEntry[]) => {
    let totalMinutes = 0;
    let totalOvertimeMinutes = 0;
    let estimatedPayout = 0;

    entries.forEach(entry => {
        totalMinutes += entry.duration;
        totalOvertimeMinutes += entry.overtimeDuration;

        if (entry.overtimeDuration > 0) {
            const dayOfWeek = getDay(parseISO(entry.date)); // Sunday - 0, ...
            let multiplier = profile.overtimeRates.weekday;
            if (dayOfWeek === 0) { // Sunday
                multiplier = profile.overtimeRates.sunday;
            } else if (dayOfWeek === 6) { // Saturday
                multiplier = profile.overtimeRates.saturday;
            }
            estimatedPayout += (entry.overtimeDuration / 60) * profile.hourlyRate * multiplier;
        }
    });

    return {
      regularHours: ((totalMinutes - totalOvertimeMinutes) / 60).toFixed(2),
      overtimeHours: (totalOvertimeMinutes / 60).toFixed(2),
      estimatedPayout: estimatedPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
  };

  const monthTotals = calculateMonthlyTotals(monthEntries);

  const weeklyChartData = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    
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
  }, [weekEntries]);


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

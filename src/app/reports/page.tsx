"use client";

import React, { useContext, useMemo } from "react";
import { AppContext } from "@/context/AppContext";
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
  isThisWeek,
  isThisMonth,
  isToday,
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import type { TimeEntry } from "@/lib/types";

export default function ReportsPage() {
  const { timeEntries } = useContext(AppContext);

  const todayEntries = timeEntries.filter((entry) => isToday(parseISO(entry.date)));
  const weekEntries = timeEntries.filter((entry) => isThisWeek(parseISO(entry.date), { weekStartsOn: 1 }));
  const monthEntries = timeEntries.filter((entry) => isThisMonth(parseISO(entry.date)));

  const calculateTotals = (entries: TimeEntry[]) => {
    const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
    const totalOvertimeMinutes = entries.reduce((sum, entry) => sum + entry.overtimeDuration, 0);

    return {
      totalHours: (totalMinutes / 60).toFixed(2),
      overtimeHours: (totalOvertimeMinutes / 60).toFixed(2),
    };
  };

  const todayTotals = calculateTotals(todayEntries);
  const weekTotals = calculateTotals(weekEntries);
  const monthTotals = calculateTotals(monthEntries);

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
      <h1 className="text-3xl font-headline font-bold">Reports</h1>
      <p className="text-muted-foreground">
        Here's a summary of your worked hours and overtime.
      </p>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold">{todayTotals.totalHours} hrs</p>
            <p className="text-sm text-muted-foreground">{todayTotals.overtimeHours} hrs overtime</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold">{weekTotals.totalHours} hrs</p>
            <p className="text-sm text-muted-foreground">{weekTotals.overtimeHours} hrs overtime</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>This Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold">{monthTotals.totalHours} hrs</p>
            <p className="text-sm text-muted-foreground">{monthTotals.overtimeHours} hrs overtime</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Hours</CardTitle>
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

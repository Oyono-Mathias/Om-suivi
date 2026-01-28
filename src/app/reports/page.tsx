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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  isThisWeek,
  isThisMonth,
  isToday,
  eachDayOfInterval,
  format,
  parseISO,
} from "date-fns";

export default function ReportsPage() {
  const { timeEntries, profile } = useContext(AppContext);

  const processEntries = (
    filterFn: (date: Date) => boolean,
    groupBy: "day" | "week"
  ) => {
    const dailyHours: { [key: string]: number } = {};

    timeEntries
      .filter((entry) => filterFn(parseISO(entry.date)))
      .forEach((entry) => {
        const dateKey =
          groupBy === "day"
            ? format(parseISO(entry.date), "EEE")
            : format(parseISO(entry.date), "MMM d");
        dailyHours[dateKey] = (dailyHours[dateKey] || 0) + entry.duration / 60;
      });

    return Object.entries(dailyHours).map(([date, hours]) => ({
      date,
      hours: parseFloat(hours.toFixed(2)),
    }));
  };

  const todayEntries = timeEntries.filter((entry) => isToday(parseISO(entry.date)));
  const weekEntries = timeEntries.filter((entry) => isThisWeek(parseISO(entry.date), { weekStartsOn: 1 }));
  const monthEntries = timeEntries.filter((entry) => isThisMonth(parseISO(entry.date)));

  const calculateTotals = (entries: typeof timeEntries) => {
    const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
    const totalHours = totalMinutes / 60;
    const baseHoursPerDay = profile.baseHours / 5;
    const overtimeHours = Math.max(0, totalHours - baseHoursPerDay * new Set(entries.map(e => e.date)).size);

    return {
      totalHours: totalHours.toFixed(2),
      overtimeHours: overtimeHours.toFixed(2),
    };
  };

  const todayTotals = calculateTotals(todayEntries);
  const weekTotals = calculateTotals(weekEntries);
  const monthTotals = calculateTotals(monthEntries);

  const weeklyChartData = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    const weekDays = eachDayOfInterval({ start: startOfWeek, end: endOfWeek });
    
    const hoursByDay = weekEntries.reduce((acc, entry) => {
      const day = format(parseISO(entry.date), 'yyyy-MM-dd');
      acc[day] = (acc[day] || 0) + entry.duration / 60;
      return acc;
    }, {} as Record<string, number>);

    return weekDays.map(day => ({
      date: format(day, 'EEE'),
      hours: parseFloat((hoursByDay[format(day, 'yyyy-MM-dd')] || 0).toFixed(2)),
    }));
  }, [weekEntries]);


  const chartConfig = {
    hours: {
      label: "Hours",
      color: "hsl(var(--chart-1))",
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
            Hours logged each day of the current week.
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
              <Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { useTranslations } from "next-intl";

type ChartData = {
  date: string;
  regular: number;
  overtime: number;
};

interface WeeklyHoursChartProps {
  chartData: ChartData[];
  chartConfig: ChartConfig;
}

export default function WeeklyHoursChart({ chartData, chartConfig }: WeeklyHoursChartProps) {
  const t = useTranslations('ReportsPage');

  return (
    <div className="w-full overflow-x-hidden">
      <ChartContainer config={chartConfig} className="h-64 min-w-[300px]">
        <BarChart data={chartData} accessibilityLayer>
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
  );
}


"use client";

import React, { useContext, useMemo } from 'react';
import { AppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { format, parseISO, getDay, startOfMonth, endOfMonth, getWeek } from "date-fns";
import { shifts } from '@/lib/shifts';
import type { TimeEntry } from '@/lib/types';

const OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  sunday: 1.4,
  holiday: 1.5,
};

export default function ExportReportPage() {
    const { timeEntries, profile } = useContext(AppContext);

    const handlePrint = () => {
        window.print();
    };

    const { sortedEntries, totalOvertime, totalPayout, reportMonth, overtimeBreakdown } = useMemo(() => {
        const currentMonthStart = startOfMonth(new Date());
        const currentMonthEnd = endOfMonth(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= currentMonthStart && entryDate <= currentMonthEnd;
        });

        const sorted = [...monthEntries].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;

        const breakdown = {
            tier1: { minutes: 0, rate: OVERTIME_RATES.tier1 },
            tier2: { minutes: 0, rate: OVERTIME_RATES.tier2 },
            sunday: { minutes: 0, rate: OVERTIME_RATES.sunday },
            holiday: { minutes: 0, rate: OVERTIME_RATES.holiday },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        sorted.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) {
                entriesByWeek[week] = [];
            }
            entriesByWeek[week].push(entry);
        });

        let totalOvertimeMinutes = 0;

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyOvertimeMinutes = 0;
            weekEntries.sort((a,b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;
                totalOvertimeMinutes += entry.overtimeDuration;

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
        
        let payout = 0;
        payout += (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
        payout += (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
        payout += (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
        payout += (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;

        const month = sorted.length > 0 ? format(parseISO(sorted[0].date), 'MMMM yyyy') : format(new Date(), 'MMMM yyyy');

        return {
            sortedEntries: sorted,
            totalOvertime: totalOvertimeMinutes,
            totalPayout: payout,
            reportMonth: month,
            overtimeBreakdown: breakdown,
        };

    }, [timeEntries, profile]);

    const formatMinutes = (minutes: number) => (minutes / 60).toFixed(2);

    return (
        <div className="bg-background text-foreground min-h-screen p-4 font-body sm:p-8 print:p-0">
            <style jsx global>{`
                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-container {
                        padding: 0;
                        border: none;
                        box-shadow: none;
                    }
                }
            `}</style>

            <div className="max-w-4xl mx-auto print-container">
                <header className="flex flex-wrap justify-between items-center gap-4 mb-8 no-print">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Export Report</h1>
                        <p className="text-muted-foreground">Proof of work for {reportMonth}.</p>
                    </div>
                    <Button onClick={handlePrint}>Print to PDF</Button>
                </header>

                <div className="border rounded-lg p-6 sm:p-8 print:border-none print:shadow-none print:rounded-none">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-primary font-headline">OM Suivi</h2>
                            <h3 className="text-lg font-semibold">Time Sheet Report</h3>
                            <p className="text-muted-foreground">{profile.name}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold">{reportMonth}</p>
                            <p className="text-sm text-muted-foreground">Hourly Rate: {Math.round(profile.monthlyBaseSalary / 173.33).toLocaleString('fr-FR')} {profile.currency}</p>
                        </div>
                    </div>
                    
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Shift</TableHead>
                                <TableHead>Time In</TableHead>
                                <TableHead>Time Out</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right">Overtime (mins)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedEntries.length > 0 ? (
                                sortedEntries.map(entry => (
                                    <TableRow key={entry.id}>
                                        <TableCell>{format(parseISO(entry.date), 'EEE, MMM d')} {entry.isPublicHoliday ? '(Holiday)' : ''}</TableCell>
                                        <TableCell>{shifts.find(s => s.id === entry.shiftId)?.name || 'N/A'}</TableCell>
                                        <TableCell>{entry.startTime}</TableCell>
                                        <TableCell>{entry.endTime}</TableCell>
                                        <TableCell>{entry.location || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-medium">{entry.overtimeDuration > 0 ? entry.overtimeDuration : '-'}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No entries for this month.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Overtime at {overtimeBreakdown.tier1.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.tier1.minutes)} hrs</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Overtime at {overtimeBreakdown.tier2.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.tier2.minutes)} hrs</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Overtime (Sunday) at {overtimeBreakdown.sunday.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.sunday.minutes)} hrs</TableCell>
                            </TableRow>
                             <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Overtime (Holiday) at {overtimeBreakdown.holiday.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.holiday.minutes)} hrs</TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                                <TableCell colSpan={5} className="text-right font-bold">Total Overtime</TableCell>
                                <TableCell className="text-right font-bold">{formatMinutes(totalOvertime)} hrs</TableCell>
                            </TableRow>
                            <TableRow className="bg-primary/10">
                                <TableCell colSpan={5} className="text-right font-bold text-primary">Estimated Overtime Payout</TableCell>
                                <TableCell className="text-right font-bold text-primary">{totalPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {profile.currency}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>

                    <footer className="mt-12 text-center text-xs text-muted-foreground">
                        <p>Generated on {format(new Date(), 'PPP p')}</p>
                        <p>This document is an automatically generated proof of work for services rendered.</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}

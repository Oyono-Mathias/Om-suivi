"use client";

import React, { useContext, useMemo } from 'react';
import { AppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { format, parseISO, getDay, isThisMonth, startOfMonth, endOfMonth } from "date-fns";
import { shifts } from '@/lib/shifts';

export default function ExportReportPage() {
    const { timeEntries, profile } = useContext(AppContext);

    const handlePrint = () => {
        window.print();
    };

    const { sortedEntries, totalOvertime, totalPayout, reportMonth } = useMemo(() => {
        const currentMonthStart = startOfMonth(new Date());
        const currentMonthEnd = endOfMonth(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= currentMonthStart && entryDate <= currentMonthEnd;
        });

        const sorted = [...monthEntries].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        let overtime = 0;
        let payout = 0;

        sorted.forEach(entry => {
            overtime += entry.overtimeDuration;
            if (entry.overtimeDuration > 0) {
                const dayOfWeek = getDay(parseISO(entry.date));
                let multiplier = profile.overtimeRates.weekday;
                if (dayOfWeek === 0) multiplier = profile.overtimeRates.sunday;
                if (dayOfWeek === 6) multiplier = profile.overtimeRates.saturday;
                payout += (entry.overtimeDuration / 60) * profile.hourlyRate * multiplier;
            }
        });

        const month = sorted.length > 0 ? format(parseISO(sorted[0].date), 'MMMM yyyy') : format(new Date(), 'MMMM yyyy');

        return {
            sortedEntries: sorted,
            totalOvertime: overtime,
            totalPayout: payout,
            reportMonth: month,
        };

    }, [timeEntries, profile]);


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
                                        <TableCell>{format(parseISO(entry.date), 'EEE, MMM d')}</TableCell>
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
                            <TableRow className="bg-muted/50">
                                <TableCell colSpan={5} className="text-right font-bold">Total Overtime</TableCell>
                                <TableCell className="text-right font-bold">{(totalOvertime / 60).toFixed(2)} hrs</TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                                <TableCell colSpan={5} className="text-right font-bold">Estimated Overtime Payout</TableCell>
                                <TableCell className="text-right font-bold">{totalPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {profile.currency}</TableCell>
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

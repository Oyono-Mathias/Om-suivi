
"use client";

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { format, parseISO, getDay, startOfMonth, endOfMonth, getWeek } from "date-fns";
import { shifts } from '@/lib/shifts';
import type { TimeEntry, Profile } from '@/lib/types';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2 } from 'lucide-react';
import Link from 'next/link';


const OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  sunday: 1.4,
  holiday: 1.5,
};

export default function ExportReportPage() {
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


    const handlePrint = () => {
        window.print();
    };

    const { sortedEntries, totalOvertime, totalPayout, reportMonth, overtimeBreakdown } = useMemo(() => {
        if (!timeEntries || !profile) {
            return {
                sortedEntries: [],
                totalOvertime: 0,
                totalPayout: 0,
                reportMonth: format(new Date(), 'MMMM yyyy'),
                overtimeBreakdown: { tier1: { minutes: 0 }, tier2: { minutes: 0 }, sunday: { minutes: 0 }, holiday: { minutes: 0 } },
            };
        }

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
            <p className="text-xl">Veuillez vous connecter pour continuer.</p>
            <Link href="/login">
                <Button>Se connecter</Button>
            </Link>
            </div>
        );
    }
    
    if (!profile) {
        return (
            <div className="flex flex-col justify-center items-center h-screen gap-4">
                <p className="text-xl text-center">Veuillez compléter votre profil avant de consulter les rapports.</p>
                <Link href="/profile">
                    <Button>Aller au Profil</Button>
                </Link>
            </div>
        )
    }

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
                        <h1 className="text-3xl font-bold font-headline">Exporter le Rapport</h1>
                        <p className="text-muted-foreground">Preuve de travail pour {reportMonth}.</p>
                    </div>
                    <Button onClick={handlePrint}>Imprimer en PDF</Button>
                </header>

                <div className="border rounded-lg p-6 sm:p-8 print:border-none print:shadow-none print:rounded-none">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-primary font-headline">OM Suivi</h2>
                            <h3 className="text-lg font-semibold">Rapport de Feuille de Temps</h3>
                            <p className="text-muted-foreground">{profile.name}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold">{reportMonth}</p>
                            <p className="text-sm text-muted-foreground">Taux Horaire: {Math.round(profile.monthlyBaseSalary / 173.33).toLocaleString('fr-FR')} {profile.currency}</p>
                        </div>
                    </div>
                    
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Poste</TableHead>
                                <TableHead>Heure d'arrivée</TableHead>
                                <TableHead>Heure de départ</TableHead>
                                <TableHead>Lieu</TableHead>
                                <TableHead className="text-right">Heures sup. (min)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedEntries.length > 0 ? (
                                sortedEntries.map(entry => (
                                    <TableRow key={entry.id}>
                                        <TableCell>{format(parseISO(entry.date), 'EEE, d MMM')} {entry.isPublicHoliday ? '(Férié)' : ''}</TableCell>
                                        <TableCell>{shifts.find(s => s.id === entry.shiftId)?.name || 'N/A'}</TableCell>
                                        <TableCell>{entry.startTime}</TableCell>
                                        <TableCell>{entry.endTime}</TableCell>
                                        <TableCell>{entry.location || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-medium">{entry.overtimeDuration > 0 ? entry.overtimeDuration : '-'}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Aucune entrée pour ce mois.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Heures sup. à {overtimeBreakdown.tier1.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.tier1.minutes)} h</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Heures sup. à {overtimeBreakdown.tier2.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.tier2.minutes)} h</TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Heures sup. (Dimanche) à {overtimeBreakdown.sunday.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.sunday.minutes)} h</TableCell>
                            </TableRow>
                             <TableRow>
                                <TableCell colSpan={5} className="text-right font-semibold">Heures sup. (Férié) à {overtimeBreakdown.holiday.rate * 100}%</TableCell>
                                <TableCell className="text-right font-medium">{formatMinutes(overtimeBreakdown.holiday.minutes)} h</TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                                <TableCell colSpan={5} className="text-right font-bold">Total Heures Sup.</TableCell>
                                <TableCell className="text-right font-bold">{formatMinutes(totalOvertime)} h</TableCell>
                            </TableRow>
                            <TableRow className="bg-primary/10">
                                <TableCell colSpan={5} className="text-right font-bold text-primary">Paiement Estimé des Heures Sup.</TableCell>
                                <TableCell className="text-right font-bold text-primary">{totalPayout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {profile.currency}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>

                    <footer className="mt-12 text-center text-xs text-muted-foreground">
                        <p>Généré le {format(new Date(), 'PPP p')}</p>
                        <p>Ce document est une preuve de travail générée automatiquement pour les services rendus.</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}

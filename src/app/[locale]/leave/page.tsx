
'use client';

import React, { useState, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTranslations, useLocale } from 'next-intl';
import { differenceInYears, format, parseISO, getDay, parse } from 'date-fns';
import { fr, enUS } from "date-fns/locale";
import type { Profile } from '@/lib/types';
import { Link } from '@/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';

const addWorkingDays = (startDate: Date, daysToAdd: number): Date => {
    let currentDate = new Date(startDate);
    let daysAdded = 0;
    while (daysAdded < daysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        // getDay() returns 0 for Sunday
        if (getDay(currentDate) !== 0) {
            daysAdded++;
        }
    }
    return currentDate;
};


export default function LeaveRequestPage() {
    const t = useTranslations('LeaveRequestPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const [startDate, setStartDate] = useState<string | undefined>();

    const leaveData = useMemo(() => {
        if (!profile?.leaveStartDate || !profile?.hireDate) return { baseDays: 18, senioritySurplus: 0, totalDays: 18, seniorityYears: 0 };
        try {
            const hireDate = parseISO(profile.hireDate);
            const now = new Date();

            const seniorityYears = differenceInYears(now, hireDate);
            let senioritySurplus = 0;
            if (seniorityYears >= 5) {
                senioritySurplus = 2 + Math.floor(Math.max(0, seniorityYears - 5) / 2) * 2;
            }

            const totalDays = 18 + senioritySurplus;

            return {
                baseDays: 18,
                senioritySurplus,
                totalDays,
                seniorityYears
            };
        } catch (e) {
            console.error("Could not parse date for leave calculation", e);
            return { baseDays: 18, senioritySurplus: 0, totalDays: 18, seniorityYears: 0 };
        }
    }, [profile?.leaveStartDate, profile?.hireDate]);

    const resumeDate = useMemo(() => {
        if (!startDate || !leaveData) return null;
        try {
            const parsedDate = parse(startDate, 'yyyy-MM-dd', new Date());
            if (isNaN(parsedDate.getTime())) return null;
            return addWorkingDays(parsedDate, leaveData.totalDays);
        } catch (e) {
            return null;
        }
    }, [startDate, leaveData]);
    
    const handlePrint = () => {
        window.print();
    };

    const isLoading = isUserLoading || isLoadingProfile;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    }
    
    if (!user) {
        return (<div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl">{tShared('pleaseLogin')}</p>
            <Link href="/login"><Button>{tShared('loginButton')}</Button></Link>
        </div>);
    }

    if (!profile || !profile.hireDate || !profile.leaveStartDate) {
        return (<div className="flex flex-col justify-center items-center h-screen gap-4 text-center">
            <p className="text-xl">{tShared('pleaseCompleteProfile')}</p>
            <p className="text-muted-foreground max-w-sm">Assurez-vous que la date d'embauche et la date de début du cycle de congé sont définis dans votre profil.</p>
            <Link href="/profile"><Button>{tShared('goToProfileButton')}</Button></Link>
        </div>);
    }
    
    const professionLabel = profile.profession ? tProfile(`professions.${profile.profession}`) : 'N/A';

    return (
        <div className="bg-background text-foreground font-body">
            <style jsx global>{`
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: 'Times New Roman', serif; color: black;}
                    .no-print { display: none !important; }
                    main { padding: 0 !important; margin: 0 !important; }
                    .print-container {
                        padding: 2rem !important;
                        border: none !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                    }
                    html, body {
                        width: 210mm;
                        height: 297mm;
                    }
                }
            `}</style>
            
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 no-print">
                <div>
                    <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                </div>
                <Button onClick={handlePrint} className="h-12 w-full md:w-auto">{t('printButton')}</Button>
            </div>

            <div className="max-w-4xl mx-auto print-container border rounded-lg p-4 sm:p-8">
                <header className="text-center mb-10">
                    <h2 className="text-xl font-bold uppercase">{t('documentTitle')}</h2>
                    <h1 className="text-2xl font-bold uppercase underline">{t('documentSubtitle')}</h1>
                </header>

                <section className="mb-8">
                    <h3 className="font-bold text-lg mb-4 border-b pb-2">{t('employeeInfo')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div><strong className="block">{t('nameLabel')}:</strong> {profile.name}</div>
                        <div><strong className="block">{t('jobTitleLabel')}:</strong> {professionLabel}</div>
                        <div><strong className="block">{t('seniorityLabel')}:</strong> {leaveData.seniorityYears} ans</div>
                    </div>
                </section>
                
                <section className="mb-8">
                    <h3 className="font-bold text-lg mb-4 border-b pb-2">{t('leaveDetails')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
                        <div className="no-print">
                            <label className="text-sm font-medium">{t('leaveStartDateLabel')}</label>
                            <Input
                                type="date"
                                value={startDate ?? ''}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="mt-1 w-full"
                            />
                        </div>
                        <div className="print-only-date text-sm">
                             <strong>{t('leaveStartDateLabel')}:</strong> {startDate ? format(parse(startDate, 'yyyy-MM-dd', new Date()), "PPP", { locale: dateFnsLocale }) : '____ / ____ / ________'}
                        </div>
                        <div>
                             <p className="text-sm font-medium">{t('leaveResumeDateLabel')}</p>
                             <p className="font-bold text-lg">{resumeDate ? format(resumeDate, "EEEE, d MMMM yyyy", { locale: dateFnsLocale }) : '...'}</p>
                        </div>
                    </div>
                </section>

                <p className="mb-8 leading-relaxed">{t('requestText')}</p>

                <section className="mb-10">
                     <h3 className="font-bold text-lg mb-4 text-center">{t('leaveTableTitle')}</h3>
                     <Table className="border">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-center">{t('baseLeave')}</TableHead>
                                <TableHead className="text-center">{t('senioritySurplus')}</TableHead>
                                <TableHead className="text-center font-bold">{t('totalLeave')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell className="text-center">{leaveData.baseDays} {t('daysUnit')}</TableCell>
                                <TableCell className="text-center">{leaveData.senioritySurplus} {t('daysUnit')}</TableCell>
                                <TableCell className="text-center font-bold">{leaveData.totalDays} {t('daysUnit')}</TableCell>
                            </TableRow>
                        </TableBody>
                     </Table>
                </section>
                
                <footer className="mt-20">
                    <h3 className="font-bold text-lg mb-10 text-center">{t('signatures')}</h3>
                    <div className="grid grid-cols-3 gap-8 text-center">
                        <div>
                            <div className="border-b border-black w-full mb-2 h-16"></div>
                            <p className="text-sm font-semibold">{t('employeeSignature')}</p>
                        </div>
                         <div>
                            <div className="border-b border-black w-full mb-2 h-16"></div>
                            <p className="text-sm font-semibold">{t('managerSignature')}</p>
                        </div>
                         <div>
                            <div className="border-b border-black w-full mb-2 h-16"></div>
                            <p className="text-sm font-semibold">{t('directorSignature')}</p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}

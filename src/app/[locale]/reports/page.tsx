"use client";

import React, { useMemo, useRef, useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import {
  eachDayOfInterval,
  format,
  parse,
  parseISO,
  startOfWeek,
  endOfWeek,
  getDay,
  isThisWeek,
  getWeek,
  addDays,
  set,
  getHours,
  startOfDay,
  addMinutes,
  differenceInMinutes,
  max,
  min,
  differenceInMonths,
  differenceInYears,
} from "date-fns";
import type { TimeEntry, Profile, GlobalSettings, AttendanceOverride } from "@/lib/types";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase, useStorage } from "@/firebase";
import { doc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Loader2, ShieldAlert, HeartPulse, Paperclip, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from "next-intl";
import { shifts } from "@/lib/shifts";
import { getPayrollCycle } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_OVERTIME_RATES = {
  tier1: 1.2,
  tier2: 1.3,
  night: 1.4,
  sunday: 1.5,
  holiday: 1.5,
};

export default function ReportsPage() {
    const t = useTranslations('ReportsPage');
    const tShared = useTranslations('Shared');
    const tProfile = useTranslations('ProfilePage');
    const tBulletin = useTranslations('BulletinPage');
    
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();

    const [isJustifying, setIsJustifying] = useState(false);
    const [dateToJustify, setDateToJustify] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const userProfileRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

    const timeEntriesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return collection(firestore, 'users', user.uid, 'timeEntries');
    }, [firestore, user]);
    const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);
    
    const settingsRef = useMemoFirebase(() => user ? doc(firestore, 'settings', 'global') : null, [firestore, user]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const overridesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return collection(firestore, 'users', user.uid, 'attendanceOverrides');
    }, [firestore, user]);
    const { data: attendanceOverrides, isLoading: isLoadingOverrides } = useCollection<AttendanceOverride>(overridesQuery);

    const handleJustifyClick = (date: string) => {
      setDateToJustify(date);
      fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0 || !dateToJustify || !user || !profile) return;
      
      const file = event.target.files[0];
      setIsJustifying(true);
    
      try {
        const storageRef = ref(storage, `justifications/${user.uid}/${dateToJustify}/${file.name}`);
        const uploadTask = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadTask.ref);
    
        const justificationsRef = collection(firestore, 'absenceJustifications');
        await addDoc(justificationsRef, {
          userId: user.uid,
          userName: profile.name,
          absenceDate: dateToJustify,
          imageUrl: downloadURL,
          status: 'pending',
          submittedAt: serverTimestamp(),
        });
    
        toast({ title: "Justificatif envoyé", description: "Votre document a été soumis pour approbation." });
    
      } catch (error) {
        console.error("Upload failed", error);
        toast({ variant: 'destructive', title: "Échec de l'envoi" });
      } finally {
        setIsJustifying(false);
        setDateToJustify(null);
        if(fileInputRef.current) fileInputRef.current.value = '';
      }
    };


    const absencePenalty = useMemo(() => {
        if (!timeEntries || !profile || !profile.hireDate || !attendanceOverrides) {
            return { unjustifiedCount: 0, totalPenalty: 0, sickLeaveCount: 0, unjustifiedDates: [] };
        }

        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());
        let unjustifiedAbsenceCount = 0;
        let sickLeaveCount = 0;
        let preRegistrationAbsenceCount = 0;
        let unjustifiedDates: string[] = [];
        
        const hireDate = parseISO(profile.hireDate);
        const cycleWorkDays = eachDayOfInterval({ start: cycleStart, end: min([cycleEnd, new Date()]) })
          .filter(d => getDay(d) !== 0); // Mon-Sat
        
        const workedDays = new Set(timeEntries.map(e => e.date));
        const overridesMap = new Map(attendanceOverrides.map(o => [o.id, o.status]));

        for (const day of cycleWorkDays) {
            const dayString = format(day, 'yyyy-MM-dd');
            
            if (day < startOfDay(hireDate)) {
                preRegistrationAbsenceCount++;
            } else {
                if (!workedDays.has(dayString)) {
                    const status = overridesMap.get(dayString);
                    if (status === 'sick_leave') {
                        sickLeaveCount++;
                    } else {
                        unjustifiedAbsenceCount++;
                        unjustifiedDates.push(dayString);
                    }
                }
            }
        }
        
        const totalAbsencesForPenalty = unjustifiedAbsenceCount + preRegistrationAbsenceCount;
        const penaltyPerDay = globalSettings?.absencePenaltyAmount ?? 2426;
        const totalPenalty = totalAbsencesForPenalty * penaltyPerDay;

        return { unjustifiedCount: unjustifiedAbsenceCount, totalPenalty, sickLeaveCount, unjustifiedDates };

    }, [timeEntries, profile, attendanceOverrides, globalSettings]);

    const reportSummary = useMemo(() => {
        if (!timeEntries || !profile || !attendanceOverrides) {
            return {
                regularHours: '0.00',
                totalOvertimeHours: '0.00',
                estimatedPayout: 0,
                cnpsDeduction: 0,
                netPayout: 0,
            };
        }

        const rates = globalSettings?.overtimeRates || DEFAULT_OVERTIME_RATES;
        const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

        const monthEntries = timeEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= cycleStart && entryDate <= cycleEnd;
        });

        let totalDurationMinutes = 0;
        monthEntries.forEach(entry => totalDurationMinutes += entry.duration);
        
        const hourlyRate = profile.monthlyBaseSalary > 0 ? Math.round(profile.monthlyBaseSalary / 173.33) : 0;

        const breakdown = {
            tier1: { minutes: 0, rate: rates.tier1, payout: 0 },
            tier2: { minutes: 0, rate: rates.tier2, payout: 0 },
            night: { minutes: 0, rate: rates.night, payout: 0 },
            sunday: { minutes: 0, rate: rates.sunday, payout: 0 },
            holiday: { minutes: 0, rate: rates.holiday, payout: 0 },
        };

        const entriesByWeek: { [week: number]: TimeEntry[] } = {};
        monthEntries.forEach(entry => {
            const week = getWeek(parseISO(entry.date), { weekStartsOn: 1 });
            if (!entriesByWeek[week]) entriesByWeek[week] = [];
            entriesByWeek[week].push(entry);
        });

        let totalOvertimeMinutes = 0;

        for (const weekEntries of Object.values(entriesByWeek)) {
            let weeklyDaytimeOvertimeMinutes = 0;
            weekEntries.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

            for (const entry of weekEntries) {
                if (entry.overtimeDuration <= 0) continue;

                totalOvertimeMinutes += entry.overtimeDuration;
                let overtimeToProcess = entry.overtimeDuration;
                const entryDate = parseISO(entry.date);
                
                if (entry.isPublicHoliday) {
                    breakdown.holiday.minutes += overtimeToProcess;
                    continue;
                }
                if (getDay(entryDate) === 0) { // Sunday
                    breakdown.sunday.minutes += overtimeToProcess;
                    continue;
                }
                
                const shift = shifts.find(s => s.id === entry.shiftId);
                if (shift) {
                    const shiftStartDateTime = parse(`${entry.date} ${shift.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    let shiftEndDateTime = parse(`${entry.date} ${shift.endTime}`, 'yyyy-MM-dd HH:mm', new Date());
                    if (shiftEndDateTime <= shiftStartDateTime) shiftEndDateTime = addDays(shiftEndDateTime, 1);
                    
                    const overtimeStartDateTime = shiftEndDateTime;
                    const overtimeEndDateTime = addMinutes(overtimeStartDateTime, entry.overtimeDuration);
                    
                    const dayOfOvertime = startOfDay(overtimeStartDateTime);
                    let nightWindowStart, nightWindowEnd;
                    
                    if (getHours(overtimeStartDateTime) < 6) { 
                        nightWindowStart = set(addDays(dayOfOvertime, -1), { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 });
                        nightWindowEnd = set(dayOfOvertime, { hours: 6, minutes: 0, seconds: 0, milliseconds: 0 });
                    } else {
                        nightWindowStart = set(dayOfOvertime, { hours: 22, minutes: 0, seconds: 0, milliseconds: 0 });
                        nightWindowEnd = set(addDays(dayOfOvertime, 1), { hours: 6, minutes: 0, seconds: 0, milliseconds: 0 });
                    }

                    const overlapStart = max([overtimeStartDateTime, nightWindowStart]);
                    const overlapEnd = min([overtimeEndDateTime, nightWindowEnd]);
                    const nightOverlapMinutes = differenceInMinutes(overlapEnd, overlapStart);

                    if (nightOverlapMinutes > 0) {
                        breakdown.night.minutes += nightOverlapMinutes;
                        overtimeToProcess -= nightOverlapMinutes;
                    }
                }
                
                if (overtimeToProcess > 0) {
                    const weeklyTier1CapInMinutes = 8 * 60;
                    const remainingTier1Capacity = weeklyDaytimeOvertimeMinutes - weeklyDaytimeOvertimeMinutes;
                    const minutesForTier1 = Math.min(overtimeToProcess, remainingTier1Capacity);
                    
                    if (minutesForTier1 > 0) {
                        breakdown.tier1.minutes += minutesForTier1;
                    }
                    
                    const minutesForTier2 = overtimeToProcess - minutesForTier1;
                    if (minutesForTier2 > 0) {
                        breakdown.tier2.minutes += minutesForTier2;
                    }
                    
                    weeklyDaytimeOvertimeMinutes += overtimeToProcess;
                }
            }
        }

        breakdown.tier1.payout = (breakdown.tier1.minutes / 60) * hourlyRate * breakdown.tier1.rate;
        breakdown.tier2.payout = (breakdown.tier2.minutes / 60) * hourlyRate * breakdown.tier2.rate;
        breakdown.night.payout = (breakdown.night.minutes / 60) * hourlyRate * breakdown.night.rate;
        breakdown.sunday.payout = (breakdown.sunday.minutes / 60) * hourlyRate * breakdown.sunday.rate;
        breakdown.holiday.payout = (breakdown.holiday.minutes / 60) * hourlyRate * breakdown.holiday.rate;

        const totalPayout = breakdown.tier1.payout + breakdown.tier2.payout + breakdown.night.payout + breakdown.sunday.payout + breakdown.holiday.payout;
        const cnpsDeduction = totalPayout * 0.042;
        const netPayout = totalPayout - cnpsDeduction;

        return {
            regularHours: ((totalDurationMinutes - totalOvertimeMinutes) / 60).toFixed(2),
            totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(2),
            estimatedPayout: totalPayout,
            cnpsDeduction: cnpsDeduction,
            netPayout: netPayout,
        };
    }, [timeEntries, profile, globalSettings, attendanceOverrides]);


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

  const leaveData = useMemo(() => {
    if (!profile?.hireDate) return { baseDays: 0, senioritySurplus: 0, totalDays: 0 };
    
    try {
        const now = new Date();
        const hireDate = parseISO(profile.hireDate);

        // Seniority bonus calculation
        const seniorityYears = differenceInYears(now, hireDate);
        let senioritySurplus = 0;
        if (seniorityYears >= 5) {
            // 2 days bonus after 5 years, plus 1 day for every 2 additional years.
            senioritySurplus = 2 + Math.floor((seniorityYears - 5) / 2);
        }

        // Base days calculation for the current cycle
        let cycleStartDate;
        const parsedLeaveStartDate = profile.leaveStartDate ? parseISO(profile.leaveStartDate) : null;

        // A cycle resets on the leave start date.
        // If not set, or in the future, we look at the hire date anniversary.
        if (parsedLeaveStartDate && parsedLeaveStartDate < now) {
            cycleStartDate = parsedLeaveStartDate;
        } else {
            // Default to the last hire date anniversary.
            cycleStartDate = new Date(now.getFullYear(), hireDate.getMonth(), hireDate.getDate());
            if (cycleStartDate > now) {
                cycleStartDate.setFullYear(cycleStartDate.getFullYear() - 1);
            }
        }

        // The number of full months passed since the cycle started.
        const monthsWorkedInCycle = differenceInMonths(now, cycleStartDate);
        const baseDays = monthsWorkedInCycle > 0 ? (monthsWorkedInCycle * 1.5) : 0;

        const totalDays = baseDays + senioritySurplus;

        return {
            baseDays,
            senioritySurplus,
            totalDays
        };
    } catch (e) {
        console.error("Could not parse date for leave calculation", e);
        return { baseDays: 0, senioritySurplus: 0, totalDays: 0 };
    }
  }, [profile?.leaveStartDate, profile?.hireDate]);


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

  const isLoading = isUserLoading || isLoadingProfile || isLoadingEntries || isLoadingSettings || isLoadingOverrides;

  if (isLoading) {
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

  if (!profile || profile.monthlyBaseSalary === 0 || !profile.profession) {
    return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p className="text-xl text-center">{tShared('pleaseCompleteProfile')}</p>
            <Link href="/profile">
                <Button>{tShared('goToProfileButton')}</Button>
            </Link>
        </div>
    )
  }

  const professionLabel = profile.profession ? tProfile(`professions.${profile.profession}`) : 'N/A';

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">
                {t('description')} - <span className="font-semibold">{t('jobTitleLabel')}: {professionLabel}</span>
            </p>
        </div>
        <Link href="/reports/export">
          <Button>{t('exportButton')}</Button>
        </Link>
      </div>

      {absencePenalty.unjustifiedCount > 0 && (
        <Link href="/reports/historique-absences">
            <Alert variant="destructive" className="cursor-pointer hover:bg-destructive/10">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>{t('absenceAlertTitle')}</AlertTitle>
                <AlertDescription>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <p>
                        {t('absenceAlertDescription', {
                            count: absencePenalty.unjustifiedCount,
                            penalty: absencePenalty.totalPenalty.toLocaleString('fr-FR')
                        })}
                        </p>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="mt-2 sm:mt-0" 
                            onClick={(e) => { e.preventDefault(); handleJustifyClick(absencePenalty.unjustifiedDates[0]); }} 
                            disabled={isJustifying}
                        >
                            {isJustifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Justifier une absence
                        </Button>
                    </div>
                </AlertDescription>
            </Alert>
        </Link>
      )}
       <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      {absencePenalty.sickLeaveCount > 0 && (
        <Alert variant="default" className="bg-blue-950/50 border-blue-500/50 text-blue-300">
            <HeartPulse className="h-4 w-4 text-blue-500" />
            <AlertTitle>{t('sickLeaveAlertTitle')}</AlertTitle>
            <AlertDescription>
                {t('sickLeaveAlertDescription', {
                    count: absencePenalty.sickLeaveCount
                })}
            </AlertDescription>
        </Alert>
      )}
      
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>{t('financialSummaryTitle')}</CardTitle>
                        <CardDescription>{t('financialSummaryDescription')}</CardDescription>
                    </div>
                    <Link href="/reports/details-calcul" className="shrink-0 ml-2">
                         <Button variant="link" className="text-sm px-0">
                            {t('seeCalculationDetailsTooltip')}
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <Card className="p-4 text-center">
                    <CardDescription>{t('regularHours')}</CardDescription>
                    <CardTitle className="text-4xl font-mono tabular-nums">{reportSummary.regularHours}<span className="text-2xl font-medium"> {t('hourUnit')}</span></CardTitle>
                </Card>
                <Card className="p-4 text-center">
                    <CardDescription>{tBulletin('overtimeLabel')}</CardDescription>
                    <CardTitle className="text-4xl text-destructive font-mono tabular-nums">{reportSummary.totalOvertimeHours}<span className="text-2xl font-medium"> {t('hourUnit')}</span></CardTitle>
                </Card>
                <Card className="p-4 text-center bg-primary/5">
                    <CardDescription className="text-primary">{t('estimatedPayout')}</CardDescription>
                    <CardTitle className="text-4xl text-primary font-mono tabular-nums">
                      {reportSummary.estimatedPayout.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} 
                      <span className="text-2xl font-medium"> {profile.currency}</span>
                    </CardTitle>
                </Card>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2">
                            <CardTitle>{tBulletin('acquiredRightsTitle')}</CardTitle>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger>
                                    <TooltipContent><p>{t('leaveAccrualTooltip')}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <CardDescription>{tProfile('leaveBalanceDescription')}</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-4xl font-bold">{leaveData.totalDays.toFixed(1)} <span className="text-xl font-medium text-muted-foreground">{tProfile('leaveBalanceDays')}</span></p>
                <p className="text-sm text-muted-foreground mt-2">
                    {t('leaveTableBase')} ({leaveData.baseDays.toFixed(1)}j) + {t('leaveTableSeniority')} ({leaveData.senioritySurplus}j)
                </p>
                <div className="flex flex-wrap gap-4 mt-4">
                    <Link href="/reports/details-conges">
                        <Button variant="link" className="p-0 h-auto">Voir le détail du calcul</Button>
                    </Link>
                    <Link href="/leave">
                        <Button><Paperclip className="mr-2 h-4 w-4" />{t('leaveRequestButton', {defaultValue: 'Generate Leave Request'})}</Button>
                    </Link>
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
          <div className="w-full overflow-x-auto">
            <ChartContainer config={chartConfig} className="h-64 min-w-[300px]">
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

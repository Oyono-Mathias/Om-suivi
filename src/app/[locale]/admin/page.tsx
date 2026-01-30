
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, setDoc, deleteDoc, addDoc, where, getDocs } from 'firebase/firestore';
import { Loader2, ShieldX, User, ShieldCheck, Search, AlertTriangle, CalendarIcon, HeartPulse, History } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Profile, TimeEntry, GlobalSettings, AttendanceOverride } from '@/lib/types';
import { useTranslations, useLocale } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { shifts } from '@/lib/shifts';
import { format, parse, differenceInMinutes, parseISO, addDays, eachDayOfInterval, getDay, startOfDay } from 'date-fns';
import type { DateRange } from "react-day-picker"
import { fr, enUS } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, getPayrollCycle } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function BackfillDialog({ user, isOpen, onOpenChange }: { user: Profile, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
    const t = useTranslations('AdminPage');
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const backfillSchema = z.object({
        dateRange: z.object({
            from: z.date(),
            to: z.date(),
        }),
        status: z.enum(['present', 'paid_leave']),
    });

    const form = useForm<z.infer<typeof backfillSchema>>({
        resolver: zodResolver(backfillSchema),
        defaultValues: {
            status: 'present',
        },
    });

    const handleBackfillSubmit = async (values: z.infer<typeof backfillSchema>) => {
        setIsSaving(true);
        const { dateRange, status } = values;
        const daysToProcess = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });

        const timeEntriesRef = collection(firestore, 'users', user.id, 'timeEntries');
        const overridesRef = collection(firestore, 'users', user.id, 'attendanceOverrides');

        try {
            for (const day of daysToProcess) {
                const isWorkDay = getDay(day) !== 0; // 0 = Sunday
                if (!isWorkDay) continue;

                const dayString = format(day, 'yyyy-MM-dd');

                // Check if an entry already exists for this day
                const entryQuery = query(timeEntriesRef, where('date', '==', dayString));
                const entrySnapshot = await getDocs(entryQuery);

                if (!entrySnapshot.empty) {
                    continue; // Skip if user already has a time entry for this day
                }

                if (status === 'present') {
                    const standardShift = shifts.find(s => s.id === 'morningB')!; // 8:00 - 16:15
                    const newEntry: Omit<TimeEntry, 'id'> = {
                        date: dayString,
                        startTime: standardShift.startTime,
                        endTime: standardShift.endTime,
                        duration: 495, // 8h 15m
                        overtimeDuration: 0,
                        location: 'Régularisation Admin',
                        shiftId: standardShift.id,
                        userProfileId: user.id,
                        profession: user.profession,
                        modified_manually: true,
                    };
                    await addDoc(timeEntriesRef, newEntry);
                } else if (status === 'paid_leave') {
                    const overrideRef = doc(overridesRef, dayString);
                    await setDoc(overrideRef, { status: 'sick_leave' });
                }
            }
            toast({ title: t('backfillSuccess') });
            onOpenChange(false);
            form.reset();
        } catch (error) {
            console.error("Backfill failed:", error);
            toast({ variant: 'destructive', title: t('backfillError') });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('backfillDialogTitle')}</DialogTitle>
                    <DialogDescription>{t('backfillDialogDescription')}</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleBackfillSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="dateRange"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>{t('backfillDateRangeLabel')}</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn("justify-start text-left font-normal", !field.value?.from && "text-muted-foreground")}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {field.value?.from ? (
                                                    field.value.to ? (
                                                        <>
                                                            {format(field.value.from, "LLL dd, y")} -{" "}
                                                            {format(field.value.to, "LLL dd, y")}
                                                        </>
                                                    ) : (
                                                        format(field.value.from, "LLL dd, y")
                                                    )
                                                ) : (
                                                    <span>Choisir une période</span>
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                initialFocus
                                                mode="range"
                                                defaultMonth={field.value?.from}
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                numberOfMonths={2}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('backfillStatusLabel')}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="present">{t('backfillStatusPresent')}</SelectItem>
                                            <SelectItem value="paid_leave">{t('backfillStatusPaidLeave')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">{t('deleteEntryCancel')}</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('deleteEntryConfirm')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}


function AccessDenied() {
  const t = useTranslations('Shared');
  return (
    <div className="flex flex-col justify-center items-center h-screen text-center gap-4">
      <ShieldX className="w-16 h-16 text-destructive" />
      <h1 className="text-3xl font-bold">{t('accessDenied')}</h1>
      <p className="text-muted-foreground">{t('accessDeniedDescription')}</p>
      <Link href="/">
        <Button variant="outline">Retour à l'accueil</Button>
      </Link>
    </div>
  );
}

function UserTimeEntriesSheet({ user, onOpenChange }: { user: Profile | null, onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('AdminPage');
  const locale = useLocale();
  const dateFnsLocale = locale === 'fr' ? fr : enUS;
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);
  const [isBackfillOpen, setIsBackfillOpen] = useState(false);


  const { start: cycleStart, end: cycleEnd } = getPayrollCycle(new Date());

  const timeEntriesQuery = useMemoFirebase(
    () => user ? query(collection(firestore, 'users', user.id, 'timeEntries'), orderBy('date', 'desc')) : null,
    [firestore, user]
  );
  const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

  const attendanceOverridesQuery = useMemoFirebase(
    () => user ? collection(firestore, 'users', user.id, 'attendanceOverrides') : null,
    [firestore, user]
  );
  const { data: attendanceOverrides, isLoading: isLoadingOverrides } = useCollection<AttendanceOverride>(attendanceOverridesQuery);

  const daysInCycle = useMemo(() => {
    if (!user) return [];
    return eachDayOfInterval({ start: cycleStart, end: cycleEnd });
  }, [user, cycleStart, cycleEnd]);

  const editFormSchema = z.object({
      date: z.date(),
      startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    }).refine(data => {
      const start = parse(data.startTime, 'HH:mm', new Date());
      const end = parse(data.endTime, 'HH:mm', new Date());
      if (start.getTime() >= end.getTime()) {
          const associatedShift = editingEntry ? shifts.find(s => s.id === editingEntry.shiftId) : null;
          return associatedShift?.id === 'night';
      }
      return true;
    }, {
      message: "L'heure de fin doit être après l'heure de début (sauf pour le poste de nuit).",
      path: ['endTime'],
    });

  const form = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
      defaultValues: {
      date: new Date(),
      startTime: '00:00',
      endTime: '00:00',
    }
  });

  React.useEffect(() => {
    if (editingEntry) {
      form.reset({
        date: parseISO(editingEntry.date),
        startTime: editingEntry.startTime,
        endTime: editingEntry.endTime,
      });
    }
  }, [editingEntry, form]);

  async function onEditSubmit(values: z.infer<typeof editFormSchema>) {
    if (!editingEntry || !user) return;

    const shift = shifts.find(s => s.id === editingEntry.shiftId);
    if (!shift) {
        toast({ variant: 'destructive', title: "Erreur", description: "Le poste de travail est introuvable." });
        return;
    }

    const dateStr = format(values.date, 'yyyy-MM-dd');
    const startDateTime = parse(`${dateStr} ${values.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${dateStr} ${values.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (endDateTime <= startDateTime) {
        endDateTime = addDays(endDateTime, 1);
    }

    const totalDuration = differenceInMinutes(endDateTime, startDateTime);

    const shiftStartTimeOnDate = parse(`${dateStr} ${shift.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let shiftEndDateTime = parse(`${dateStr} ${shift.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (shift.id === 'night') {
        shiftEndDateTime = addDays(shiftEndDateTime, 1);
    }
    
    let overtimeDuration = 0;
    if (endDateTime > shiftEndDateTime) {
        overtimeDuration = differenceInMinutes(endDateTime, shiftEndDateTime);
    }
    
    const entryRef = doc(firestore, 'users', user.id, 'timeEntries', editingEntry.id);
    await setDoc(entryRef, {
      date: dateStr,
      startTime: values.startTime,
      endTime: values.endTime,
      duration: totalDuration > 0 ? totalDuration : 0,
      overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
      modified_manually: true,
      modification_reason: 'admin_edit',
    }, { merge: true });

    toast({ title: "Pointage mis à jour", description: "L'entrée de temps a été modifiée avec succès." });
    setEditingEntry(null);
  }

  const handleDeleteEntry = async () => {
    if (!deletingEntry || !user) return;
    const entryRef = doc(firestore, 'users', user.id, 'timeEntries', deletingEntry.id);
    await deleteDoc(entryRef);
    toast({ title: t('deleteSuccessTitle'), description: t('deleteSuccessDescription') });
    setDeletingEntry(null);
  };
  
  const handleStatusChange = async (date: Date, status: 'unjustified_absence' | 'sick_leave') => {
    if (!user) return;
    const dateStr = format(date, 'yyyy-MM-dd');
    const overrideRef = doc(firestore, 'users', user.id, 'attendanceOverrides', dateStr);
    await setDoc(overrideRef, { status });
    toast({ title: t('statusUpdated') });
  };

  const isLoading = isLoadingEntries || isLoadingOverrides;

  return (
    <>
      <Sheet open={!!user} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-3xl p-0">
            {user && (
                <SheetHeader className="p-6 border-b flex-row items-center justify-between">
                    <div>
                        <SheetTitle>{t('attendanceStatusTitle')} - {user.name}</SheetTitle>
                        <SheetDescription>{user.email}</SheetDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsBackfillOpen(true)}>
                        <History className="mr-2 h-4 w-4" />
                        {t('backfillButton')}
                    </Button>
                </SheetHeader>
            )}
            <div className="p-6 overflow-y-auto h-[calc(100vh-80px)]">
                {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('dayHeader')}</TableHead>
                                <TableHead>{t('statusHeader')}</TableHead>
                                <TableHead className="text-right">{t('actionHeader')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {daysInCycle.map(day => {
                                const dayString = format(day, 'yyyy-MM-dd');
                                const entryForDay = timeEntries?.find(e => e.date === dayString);
                                const isWorkDay = getDay(day) !== 0; // 0 is Sunday
                                const override = attendanceOverrides?.find(o => o.id === dayString);
                                const hireDate = user?.hireDate ? parseISO(user.hireDate) : null;
                                
                                if (hireDate && day < startOfDay(hireDate)) {
                                    return (
                                        <TableRow key={dayString} className="bg-muted/20">
                                            <TableCell>
                                                <div className="font-medium">{format(day, 'PPP', { locale: dateFnsLocale })}</div>
                                            </TableCell>
                                            <TableCell>
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Badge variant="outline" className="border-dashed">{t('preHireAbsenceLabel')}</Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <p>{t('preHireAbsenceTooltip')}</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    );
                                }


                                if (entryForDay) {
                                    return (
                                        <TableRow key={dayString}>
                                            <TableCell>
                                                <div className="font-medium">{format(day, 'PPP', { locale: dateFnsLocale })}</div>
                                                <div className="text-xs text-muted-foreground">{shifts.find(s => s.id === entryForDay.shiftId)?.name}</div>
                                            </TableCell>
                                            <TableCell>
                                                {entryForDay.startTime} - {entryForDay.endTime}
                                                {entryForDay.modified_manually && (
                                                    <Badge variant="destructive" className="ml-2 gap-1 rounded-full">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {t('manualModificationLabel')}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => setEditingEntry(entryForDay)}>Modifier</Button>
                                                <Button variant="destructive" size="sm" onClick={() => setDeletingEntry(entryForDay)}>Supprimer</Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                } else if (isWorkDay) {
                                    return (
                                        <TableRow key={dayString} className="bg-muted/30">
                                            <TableCell>
                                                <div className="font-medium">{format(day, 'PPP', { locale: dateFnsLocale })}</div>
                                            </TableCell>
                                            <TableCell>
                                                 <Badge variant={override?.status === 'sick_leave' ? 'default' : 'destructive'} className={override?.status === 'sick_leave' ? "bg-blue-500 hover:bg-blue-600" : ""}>
                                                    {override?.status === 'sick_leave' ? (
                                                        <>
                                                            <HeartPulse className="h-3 w-3 mr-1" />
                                                            {t('sickLeaveStatus')}
                                                        </>
                                                    ) : (
                                                         t('absentLabel')
                                                    )}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                 <Select onValueChange={(value: 'unjustified_absence' | 'sick_leave') => handleStatusChange(day, value)} defaultValue={override?.status || 'unjustified_absence'}>
                                                    <SelectTrigger className="w-[200px] ml-auto">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="unjustified_absence">{t('unjustifiedAbsenceStatus')}</SelectItem>
                                                        <SelectItem value="sick_leave">{t('sickLeaveStatus')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    )
                                }
                                return null;
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </SheetContent>
      </Sheet>

      {user && <BackfillDialog user={user} isOpen={isBackfillOpen} onOpenChange={setIsBackfillOpen} />}

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le pointage</DialogTitle>
            {editingEntry && <DialogDescription>Pour {user?.name} le {format(parseISO(editingEntry.date), 'PPP', { locale: dateFnsLocale })}.</DialogDescription>}
          </DialogHeader>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PPP", { locale: dateFnsLocale }) : <span>Choisir une date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Heure de début</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Heure de fin</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Annuler</Button>
                </DialogClose>
                <Button type="submit">Enregistrer</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingEntry} onOpenChange={(open) => !open && setDeletingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteEntryTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteEntryDescription', { date: deletingEntry ? format(parseISO(deletingEntry.date), 'PPP', { locale: dateFnsLocale }) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingEntry(null)}>{t('deleteEntryCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry}>{t('deleteEntryConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function GlobalSettingsForm() {
    const t = useTranslations('AdminPage');
    const firestore = useFirestore();
    const { toast } = useToast();

    const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const settingsSchema = z.object({
        autoClockInEnabled: z.boolean(),
        breakDuration: z.coerce.number().min(0),
        overtimeRates: z.object({
            tier1: z.coerce.number().min(1, { message: t('rateMustBePositive') }),
            tier2: z.coerce.number().min(1, { message: t('rateMustBePositive') }),
            night: z.coerce.number().min(1, { message: t('rateMustBePositive') }),
            sunday: z.coerce.number().min(1, { message: t('rateMustBePositive') }),
            holiday: z.coerce.number().min(1, { message: t('rateMustBePositive') }),
        })
    });

    const form = useForm<z.infer<typeof settingsSchema>>({
        resolver: zodResolver(settingsSchema),
        defaultValues: {
            autoClockInEnabled: true,
            breakDuration: 40,
            overtimeRates: {
                tier1: 1.2,
                tier2: 1.3,
                night: 1.4,
                sunday: 1.5,
                holiday: 1.5,
            }
        }
    });
    
    useEffect(() => {
        if (globalSettings) {
            form.reset({
                autoClockInEnabled: globalSettings.autoClockInEnabled,
                breakDuration: globalSettings.breakDuration || 40,
                overtimeRates: globalSettings.overtimeRates || { tier1: 1.2, tier2: 1.3, night: 1.4, sunday: 1.5, holiday: 1.5 }
            });
        }
    }, [globalSettings, form]);
    
    const onSubmit = async (values: z.infer<typeof settingsSchema>) => {
        if(!settingsRef) return;
        await setDoc(settingsRef, values, { merge: true });
        toast({ title: t('configUpdatedTitle'), description: t('configUpdatedDescription') });
    };

    if (isLoadingSettings) {
      return <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('rulesTitle')}</CardTitle>
                        <CardDescription>{t('rulesDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="autoClockInEnabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">{t('autoClockInLabel')}</FormLabel>
                                        <FormDescription>{t('autoClockInDescription')}</FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="breakDuration"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('breakDurationLabel')}</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} />
                                    </FormControl>
                                    <FormDescription>{t('breakDurationDescription')}</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('overtimeRulesTitle')}</CardTitle>
                        <CardDescription>{t('overtimeRulesDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <FormField
                            control={form.control}
                            name="overtimeRates.tier1"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('tier1RateLabel')}</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="overtimeRates.tier2"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('tier2RateLabel')}</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="overtimeRates.night"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('nightRateLabel')}</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="overtimeRates.sunday"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('sundayRateLabel')}</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="overtimeRates.holiday"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('holidayRateLabel')}</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('saveConfigButton')}
                </Button>
            </form>
        </Form>
    );
}

export default function AdminPage() {
  const t = useTranslations('AdminPage');
  const tShared = useTranslations('Shared');
  const tProfile = useTranslations('ProfilePage');
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingUser, setViewingUser] = useState<Profile | null>(null);

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const allProfilesQuery = useMemoFirebase(() => {
    if (!firestore || profile?.role !== 'admin') return null;
    return collection(firestore, 'users');
  }, [firestore, profile?.role]);

  const { data: allProfiles, isLoading: isLoadingAllProfiles } = useCollection<Profile>(allProfilesQuery);

  const filteredProfiles = allProfiles?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isLoading = isUserLoading || isLoadingProfile;

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

  if (profile?.role !== 'admin') {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      
      <Tabs defaultValue="users">
          <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="users">{t('usersTab')}</TabsTrigger>
              <TabsTrigger value="config">{t('configTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-6">
            <Card>
                <CardHeader>
                <CardTitle>{t('usersTitle')}</CardTitle>
                <CardDescription>{t('usersDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                <div className="sticky top-14 md:top-0 z-10 bg-background/95 backdrop-blur-sm py-2 mb-4">
                    <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                        placeholder="Rechercher par nom ou email..."
                        className="pl-10 h-12"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    </div>
                </div>
                {isLoadingAllProfiles ? (
                    <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-4">
                    {filteredProfiles && filteredProfiles.length > 0 ? (
                        filteredProfiles.map((p) => (
                        <Card key={p.id} onClick={() => setViewingUser(p)} className="flex flex-col sm:flex-row items-start p-4 gap-4 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-4 flex-1">
                                <Avatar className="h-12 w-12">
                                    <AvatarFallback>{p.name?.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <p className="font-medium">{p.name}</p>
                                    <p className="text-sm text-muted-foreground">{p.email}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-1 text-sm w-full sm:w-auto pt-1">
                                <div className="font-semibold font-mono tabular-nums">
                                    <span>{p.monthlyBaseSalary ? `${p.monthlyBaseSalary.toLocaleString('fr-FR')}` : 'N/A'}</span>
                                    <span className="text-muted-foreground"> {p.currency}</span>
                                </div>
                                <div className="text-muted-foreground">{p.profession ? tProfile(`professions.${p.profession}`) : ''}</div>
                                <Badge variant={p.role === 'admin' ? 'default' : 'secondary'} className="gap-1 text-xs mt-1 rounded-full">
                                    {p.role === 'admin' ? <ShieldCheck className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                                    {p.role}
                                </Badge>
                            </div>
                        </Card>
                        ))
                    ) : (
                        <div className="text-center h-24 flex items-center justify-center">
                        {t('noUsers')}
                        </div>
                    )}
                    </div>
                )}
                </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="config" className="mt-6">
            <GlobalSettingsForm />
          </TabsContent>
      </Tabs>

      <UserTimeEntriesSheet user={viewingUser} onOpenChange={(open) => !open && setViewingUser(null)} />
    </div>
  );
}

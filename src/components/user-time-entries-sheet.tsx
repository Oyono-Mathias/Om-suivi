
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy, setDoc, deleteDoc, addDoc, where, getDocs } from 'firebase/firestore';
import { Loader2, ShieldX, User, ShieldCheck, Search, AlertTriangle, CalendarIcon, HeartPulse, History } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { fr, enUS } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, getPayrollCycle } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function BackfillDialog({ user, isOpen, onOpenChange }: { user: Profile, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
    const t = useTranslations('AdminPage');
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const backfillSchema = z.object({
        dateFrom: z.string().min(1, "Date de début requise"),
        dateTo: z.string().min(1, "Date de fin requise"),
        status: z.enum(['present', 'paid_leave']),
    });

    const form = useForm<z.infer<typeof backfillSchema>>({
        resolver: zodResolver(backfillSchema),
        defaultValues: {
            dateFrom: '',
            dateTo: '',
            status: 'present',
        },
    });

    const handleBackfillSubmit = async (values: z.infer<typeof backfillSchema>) => {
        setIsSaving(true);
        const { dateFrom, dateTo, status } = values;
        const daysToProcess = eachDayOfInterval({ start: parse(dateFrom, 'yyyy-MM-dd', new Date()), end: parse(dateTo, 'yyyy-MM-dd', new Date()) });

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
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="dateFrom"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Du</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="dateTo"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Au</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
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

export function UserTimeEntriesSheet({ user, onOpenChange }: { user: Profile | null, onOpenChange: (open: boolean) => void }) {
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
      date: z.string().min(1),
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
      date: '',
      startTime: '00:00',
      endTime: '00:00',
    }
  });

  React.useEffect(() => {
    if (editingEntry) {
      form.reset({
        date: editingEntry.date,
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

    const dateStr = values.date;
    const startDateTime = parse(`${dateStr} ${values.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    let endDateTime = parse(`${dateStr} ${values.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (endDateTime <= startDateTime) {
        endDateTime = addDays(endDateTime, 1);
    }

    const totalDuration = differenceInMinutes(endDateTime, startDateTime);

    let shiftEndDateTime = parse(`${dateStr} ${shift.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (shift.id === 'night' && shiftEndDateTime <= startDateTime) {
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
      stopContext: 'admin_edit',
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
        <SheetContent className="w-full sm:max-w-4xl p-0">
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
                                <TableHead>Remarques</TableHead>
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
                                            <TableCell className="text-xs text-muted-foreground">
                                                {entryForDay.stopContext ? t(`stopContexts.${entryForDay.stopContext}`) : '-'}
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
                                            <TableCell></TableCell>
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
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
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

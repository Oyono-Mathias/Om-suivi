
'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import { shifts } from '@/lib/shifts';
import type { TimeEntry, Profile, GlobalSettings } from '@/lib/types';
import { format, parse, differenceInMinutes, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';

interface ManualEntryDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  profile: Profile | null;
  globalSettings: GlobalSettings | null;
}

export default function ManualEntryDialog({ isOpen, onOpenChange, profile, globalSettings }: ManualEntryDialogProps) {
  const t = useTranslations('ManualEntryDialog');
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const formSchema = z.object({
    shiftId: z.string().min(1, { message: t('shiftRequiredAlert') }),
    date: z.string().min(1, 'Date is required'),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    isPublicHoliday: z.boolean(),
  }).refine(data => {
    const start = parse(data.startTime, 'HH:mm', new Date());
    const end = parse(data.endTime, 'HH:mm', new Date());
    return end > start;
  }, {
    message: t('endTimeErrorAlert'),
    path: ['endTime'],
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: '08:00',
      endTime: '16:15',
      isPublicHoliday: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !firestore || !profile) return;

    const shift = shifts.find(s => s.id === values.shiftId);
    if (!shift) return;

    const dateStr = values.date;
    const startDateTime = parse(`${dateStr} ${values.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const endDateTime = parse(`${dateStr} ${values.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    const totalDuration = differenceInMinutes(endDateTime, startDateTime);
    
    const breakDuration = globalSettings?.breakDuration ?? 0;
    let payableDuration = totalDuration;
    if (totalDuration > 6 * 60 && breakDuration > 0) {
      payableDuration -= breakDuration;
    }


    const shiftEndDateTime = parseISO(`${dateStr}T${shift.endTime}:00`);
    let overtimeDuration = 0;
    if (endDateTime > shiftEndDateTime) {
        overtimeDuration = differenceInMinutes(endDateTime, shiftEndDateTime);
    }
    
    const newEntry: Omit<TimeEntry, 'id'> = {
        date: dateStr,
        startTime: values.startTime,
        endTime: values.endTime,
        duration: payableDuration,
        overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
        location: 'Manual',
        shiftId: values.shiftId,
        isPublicHoliday: values.isPublicHoliday,
        userProfileId: user.uid,
        profession: profile.profession,
    };
    
    await addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'timeEntries'), newEntry);
    
    toast({ title: "Entrée enregistrée", description: "Votre entrée manuelle a été ajoutée avec succès." });
    onOpenChange(false);
    form.reset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="shiftId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('shiftLabel')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('shiftPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {shifts.map(shift => (
                        <SelectItem key={shift.id} value={shift.id}>
                          {shift.name} ({shift.startTime} - {shift.endTime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('dateLabel')}</FormLabel>
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
                    <FormLabel>{t('startTimeLabel')}</FormLabel>
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
                    <FormLabel>{t('endTimeLabel')}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
                control={form.control}
                name="isPublicHoliday"
                render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                            <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>{t('isHolidayLabel')}</FormLabel>
                        </div>
                    </FormItem>
                )}
                />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">{t('cancelButton')}</Button>
              </DialogClose>
              <Button type="submit">{t('saveButton')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    

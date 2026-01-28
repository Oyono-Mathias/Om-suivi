
'use client';

import React, { useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import { shifts } from '@/lib/shifts';
import type { TimeEntry } from '@/lib/types';
import { format, parse, differenceInMinutes, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface ManualEntryDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export default function ManualEntryDialog({ isOpen, onOpenChange }: ManualEntryDialogProps) {
  const t = useTranslations('ManualEntryDialog');
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const formSchema = z.object({
    shiftId: z.string().min(1, { message: t('shiftRequiredAlert') }),
    date: z.date(),
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
      date: new Date(),
      startTime: '08:00',
      endTime: '16:15',
      isPublicHoliday: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !firestore) return;

    const shift = shifts.find(s => s.id === values.shiftId);
    if (!shift) return;

    const dateStr = format(values.date, 'yyyy-MM-dd');
    const startDateTime = parse(`${dateStr} ${values.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const endDateTime = parse(`${dateStr} ${values.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    const totalDuration = differenceInMinutes(endDateTime, startDateTime);

    const shiftEndDateTime = parseISO(`${dateStr}T${shift.endTime}:00`);
    let overtimeDuration = 0;
    if (endDateTime > shiftEndDateTime) {
        overtimeDuration = differenceInMinutes(endDateTime, shiftEndDateTime);
    }
    
    const newEntry: Omit<TimeEntry, 'id'> = {
        date: dateStr,
        startTime: values.startTime,
        endTime: values.endTime,
        duration: totalDuration,
        overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
        location: 'Manual',
        shiftId: values.shiftId,
        isPublicHoliday: values.isPublicHoliday,
        userProfileId: user.uid,
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
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
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

    
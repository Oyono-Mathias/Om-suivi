"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import type { Profile, Profession } from "@/lib/types";
import { Link } from "@/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { useAd } from "@/context/AdContext";

export default function ProfilePage() {
  const t = useTranslations('ProfilePage');
  const tShared = useTranslations('Shared');
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { tryShowAd } = useAd();

  const [isSaving, setIsSaving] = useState(false);
  
  const profileSchema = z.object({
    name: z.string().min(2, { message: t('nameMinLengthError') }),
    profession: z.enum(['machinist', 'storekeeper', 'deliveryDriver', 'chauffeur', 'securityAgent', 'other']),
    monthlyBaseSalary: z.coerce.number().min(0, { message: t('salaryMinError') }),
    currency: z.string().min(1, { message: t('currencyRequiredError')}),
    reminders: z.object({
      enabled: z.boolean(),
      time: z.string(),
    }),
  });

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      profession: 'other',
      monthlyBaseSalary: 0,
      currency: 'FCFA',
      reminders: { enabled: false, time: '17:00' }
    }
  });
  
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || user?.displayName || '',
        profession: profile.profession || 'other',
        monthlyBaseSalary: profile.monthlyBaseSalary || 0,
        currency: profile.currency || 'FCFA',
        reminders: profile.reminders || { enabled: false, time: '17:00' },
      });
    } else if (user) {
      form.reset({
        ...form.getValues(),
        name: user.displayName || '',
      });
    }
  }, [profile, user, form]);

  // Effect for user-configurable reminders
  useEffect(() => {
    if (!profile?.reminders?.enabled || !profile.reminders.time) {
      return;
    }

    let intervalId: NodeJS.Timeout;

    const checkTimeAndNotify = () => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');

      if (currentTime === profile.reminders.time && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(t('reminders.notificationTitle'), {
                body: t('reminders.notificationBody'),
                icon: '/icons/icon-192x192.png',
            });
        });
      }
    };

    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        intervalId = setInterval(checkTimeAndNotify, 60000);
      }
    });

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [profile?.reminders, t]);

  // Effect for fixed shift-start reminders
  useEffect(() => {
    const checkFixedTimeAndNotify = () => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      const reminderTimes = ['06:00', '14:00', '22:00'];

      if (reminderTimes.includes(currentTime) && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(t('reminders.shiftStartDetected'), {
                body: t('reminders.shiftStartBody'),
                icon: '/icons/icon-192x192.png',
            });
        });
      }
    };
    
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
    
    const intervalId = setInterval(checkFixedTimeAndNotify, 60000); 
    
    return () => clearInterval(intervalId);
  }, [t]);


  async function onSubmit(values: z.infer<typeof profileSchema>) {
    if (!userProfileRef || !user) return;
    
    setIsSaving(true);
    try {
      await setDoc(userProfileRef, values, { merge: true });
      toast({
        title: t('settingsUpdatedTitle'),
        description: t('settingsUpdatedDescription'),
      });
      tryShowAd();
    } catch (error) {
      console.error("Profile update failed:", error);
      toast({
        variant: "destructive",
        title: "Erreur de sauvegarde",
        description: "Impossible d'enregistrer les modifications. Veuillez réessayer.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isUserLoading || isLoadingProfile) {
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

  const professions: { value: Profession, label: string }[] = [
    { value: 'machinist', label: t('professions.machinist') },
    { value: 'storekeeper', label: t('professions.storekeeper') },
    { value: 'deliveryDriver', label: t('professions.deliveryDriver') },
    { value: 'chauffeur', label: t('professions.chauffeur') },
    { value: 'securityAgent', label: t('professions.securityAgent') },
    { value: 'other', label: t('professions.other') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>{t('personalInfoTitle')}</CardTitle>
              <CardDescription>
                {t('personalInfoDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('nameLabel')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="profession"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('professionLabel')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('professionPlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {professions.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="monthlyBaseSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('salaryLabel')}</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder={t('salaryPlaceholder')} {...field} />
                      </FormControl>
                      <FormDescription>
                        {t('salaryDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('currencyLabel')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('currencyPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('remindersTitle')}</CardTitle>
              <CardDescription>
                {t('remindersDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="reminders.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t('enableRemindersLabel')}</FormLabel>
                      <FormDescription>
                        {t('enableRemindersDescription')}
                      </FormDescription>
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
                name="reminders.time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('reminderTimeLabel')}</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="w-auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('saveButton')}
          </Button>
        </form>
      </Form>
    </div>
  );
}

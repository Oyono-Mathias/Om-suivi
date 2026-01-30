"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import { Loader2, MapPin, Paperclip, Home } from "lucide-react";
import type { Profile, Profession, GlobalSettings } from "@/lib/types";
import { Link } from "@/navigation";
import { useTranslations, useLocale } from "next-intl";
import { format, parseISO, differenceInMonths, differenceInYears } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useAd } from "@/context/AdContext";


export default function ProfilePage() {
  const t = useTranslations('ProfilePage');
  const tShared = useTranslations('Shared');
  const tGeo = useTranslations('TimeTrackingPage');
  const tLeave = useTranslations('LeaveRequestPage');
  const locale = useLocale();
  
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
    hireDate: z.string().optional(),
    leaveStartDate: z.string().optional(),
    reminders: z.object({
      enabled: z.boolean(),
      time: z.string(),
    }),
    workLatitude: z.number().optional(),
    workLongitude: z.number().optional(),
    homeLatitude: z.number().optional(),
    homeLongitude: z.number().optional(),
  });

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);
  
  const settingsRef = useMemoFirebase(() => user ? doc(firestore, 'settings', 'global') : null, [firestore, user]);
  const { data: globalSettings } = useDoc<GlobalSettings>(settingsRef);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      profession: 'other',
      monthlyBaseSalary: 0,
      currency: 'FCFA',
      hireDate: '',
      leaveStartDate: '',
      reminders: { enabled: false, time: '17:00' },
    }
  });
  
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || user?.displayName || '',
        profession: profile.profession || 'other',
        monthlyBaseSalary: profile.monthlyBaseSalary || 0,
        currency: profile.currency || 'FCFA',
        hireDate: profile.hireDate || format(new Date(), 'yyyy-MM-dd'),
        leaveStartDate: profile.leaveStartDate || profile.hireDate || format(new Date(), 'yyyy-MM-dd'),
        reminders: profile.reminders || { enabled: false, time: '17:00' },
        workLatitude: profile.workLatitude,
        workLongitude: profile.workLongitude,
        homeLatitude: profile.homeLatitude,
        homeLongitude: profile.homeLongitude,
      });
    } else if (user) {
      form.reset({
        ...form.getValues(),
        name: user.displayName || '',
      });
    }
  }, [profile, user, form]);

  const handleSetLocation = (type: 'work' | 'home') => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if (type === 'work') {
            form.setValue('workLatitude', latitude);
            form.setValue('workLongitude', longitude);
            toast({ title: t('workplaceSetSuccess'), description: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}` });
          } else {
            form.setValue('homeLatitude', latitude);
            form.setValue('homeLongitude', longitude);
            toast({ title: "Domicile défini", description: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}` });
          }
        },
        (error) => {
          toast({ variant: 'destructive', title: tGeo('geoFailedTitle'), description: tGeo('geoFailedDescription') });
        }
      );
    } else {
      toast({ variant: 'destructive', title: tGeo('geoNotSupportedTitle'), description: tGeo('geoNotSupportedDescription') });
    }
  };


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
               <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="hireDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t('hireDateLabel')}</FormLabel>
                        <FormControl>
                           <Input type="date" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="leaveStartDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t('leaveStartDateLabel')}</FormLabel>
                        <FormControl>
                            <Input type="date" {...field} value={field.value ?? ''} />
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
              <CardTitle>{t('leaveBalanceTitle')}</CardTitle>
              <CardDescription>{t('leaveBalanceDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-4xl font-bold">{leaveData.totalDays.toFixed(1)} <span className="text-xl font-medium text-muted-foreground">{t('leaveBalanceDays')}</span></p>
                <p className="text-sm text-muted-foreground mt-2">
                    Congé de base ({leaveData.baseDays.toFixed(1)}j) + Surplus Ancienneté ({leaveData.senioritySurplus}j)
                </p>
                <Link href="/leave" className="mt-4 inline-block">
                    <Button><Paperclip className="mr-2 h-4 w-4" />{tLeave('goToLeaveRequest')}</Button>
                </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>{t('workplaceSettingsTitle')}</CardTitle>
              <CardDescription>{t('workplaceSettingsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <Button type="button" variant="outline" className="w-full" onClick={() => handleSetLocation('work')}>
                  <MapPin className="mr-2 h-4 w-4" />
                  {t('setWorkplaceButton')}
                </Button>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                    control={form.control}
                    name="workLatitude"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('latitudeLabel')}</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder={t('undefinedPlaceholder')} {...field} value={field.value ?? ''} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="workLongitude"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('longitudeLabel')}</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder={t('undefinedPlaceholder')} {...field} value={field.value ?? ''} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                 <FormItem>
                    <FormLabel>{t('radiusLabel')}</FormLabel>
                    <Input value={globalSettings?.geofenceRadius || 50} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                    <FormDescription>Le rayon est défini par un administrateur.</FormDescription>
                </FormItem>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Configuration du Domicile</CardTitle>
              <CardDescription>Définissez votre zone de domicile pour l'arrêt automatique du service.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <Button type="button" variant="outline" className="w-full" onClick={() => handleSetLocation('home')}>
                  <Home className="mr-2 h-4 w-4" />
                  Définir ma position actuelle comme domicile
                </Button>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                    control={form.control}
                    name="homeLatitude"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('latitudeLabel')}</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder={t('undefinedPlaceholder')} {...field} value={field.value ?? ''} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="homeLongitude"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>{t('longitudeLabel')}</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder={t('undefinedPlaceholder')} {...field} value={field.value ?? ''} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
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

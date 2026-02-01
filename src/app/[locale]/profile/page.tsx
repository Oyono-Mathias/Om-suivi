
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
import { Loader2, MapPin, Paperclip, Home, CheckCircle } from "lucide-react";
import type { Profile, Profession, GlobalSettings } from "@/lib/types";
import { Link } from "@/navigation";
import { useTranslations, useLocale } from "next-intl";
import { format, parseISO, differenceInMonths, differenceInYears } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useAd } from "@/context/AdContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { salaryGrid } from "@/lib/salary-grid";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';


export default function ProfilePage() {
  const t = useTranslations('ProfilePage');
  const tShared = useTranslations('Shared');
  const tGeo = useTranslations('TimeTrackingPage');
  const locale = useLocale();
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { tryShowAd } = useAd();

  const [isSaving, setIsSaving] = useState(false);
  const [isCustomSalary, setIsCustomSalary] = useState(false);
  const [salaryInfo, setSalaryInfo] = useState<string | null>(null);
  
  const profileSchema = z.object({
    name: z.string().min(2, { message: t('nameMinLengthError') }),
    profession: z.enum(['machinist', 'storekeeper', 'deliveryDriver', 'chauffeur', 'securityAgent', 'other']),
    monthlyBaseSalary: z.coerce.number().min(0, { message: t('salaryMinError') }),
    category: z.string().optional(),
    echelon: z.string().optional(),
    currency: z.string().min(1, { message: t('currencyRequiredError')}),
    hireDate: z.string().optional(),
    leaveStartDate: z.string().optional(),
    reminders: z.object({
      enabled: z.boolean(),
      time: z.string(),
    }),
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

  const category = form.watch('category');
  const echelon = form.watch('echelon');
  
  useEffect(() => {
    if (profile) {
      const salaryInGrid = salaryGrid.find(s => s.sm === profile.monthlyBaseSalary);
      if (!salaryInGrid && profile.monthlyBaseSalary > 0) {
        setIsCustomSalary(true);
      } else if (salaryInGrid) {
        setIsCustomSalary(false);
        setSalaryInfo(`Correspond à la Catégorie ${salaryInGrid.category}, Échelon ${salaryInGrid.echelon}`);
      }

      form.reset({
        name: profile.name || user?.displayName || '',
        profession: profile.profession || 'other',
        monthlyBaseSalary: profile.monthlyBaseSalary || 0,
        category: profile.category,
        echelon: profile.echelon,
        currency: profile.currency || 'FCFA',
        hireDate: profile.hireDate || format(new Date(), 'yyyy-MM-dd'),
        leaveStartDate: profile.leaveStartDate || profile.hireDate || format(new Date(), 'yyyy-MM-dd'),
        reminders: profile.reminders || { enabled: false, time: '17:00' },
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

  const handleSetLocation = (type: 'home') => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if (type === 'home') {
            form.setValue('homeLatitude', latitude);
            form.setValue('homeLongitude', longitude);
            toast({ title: t('homeLocationSetSuccessTitle'), description: `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}` });
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
      const dataToSave: Partial<z.infer<typeof profileSchema>> = { ...values };
      Object.keys(dataToSave).forEach(keyStr => {
        const key = keyStr as keyof typeof dataToSave;
        if (dataToSave[key] === undefined) {
          delete dataToSave[key];
        }
      });
      
      await setDoc(userProfileRef, dataToSave, { merge: true });
      toast({
        title: t('settingsUpdatedTitle'),
        description: t('settingsUpdatedDescription'),
      });
      tryShowAd();
    } catch (error) {
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
        if (seniorityYears >= 3) {
            senioritySurplus = 2;
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
        return { baseDays: 0, senioritySurplus: 0, totalDays: 0 };
    }
  }, [profile?.leaveStartDate, profile?.hireDate]);

  const handleConnectGoogle = async () => {
    if (!user) {
        toast({
            variant: "destructive",
            title: "Non connecté",
            description: "Vous devez être connecté pour lier votre compte Google.",
        });
        return;
    }
    try {
        const app = getApp();
        const functions = getFunctions(app);
        const authGoogleCallable = httpsCallable(functions, 'authGoogle');
        // The callable function now gets the UID from the authenticated context on the backend.
        const result = await authGoogleCallable();
        const data = result.data as { authorizationUrl?: string };
        if (data.authorizationUrl) {
            window.location.href = data.authorizationUrl;
        } else {
            throw new Error("Authorization URL not returned from function.");
        }
    } catch (error) {
        console.error("Error getting Google Auth URL:", error);
        toast({
            variant: "destructive",
            title: "Erreur d'intégration",
            description: "Impossible de lancer la connexion à Google. Veuillez réessayer.",
        });
    }
  };


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
                 <FormItem>
                    <FormLabel>{t('salaryLabel')}</FormLabel>
                    {isCustomSalary ? (
                    <FormControl>
                        <Input 
                            type="number" 
                            placeholder={t('salaryPlaceholder')} 
                            value={form.getValues('monthlyBaseSalary')}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                form.setValue('monthlyBaseSalary', isNaN(value) ? 0 : value);
                                form.setValue('category', undefined);
                                form.setValue('echelon', undefined);
                                setSalaryInfo('Catégorie et échelon non déterminés pour ce salaire.');
                            }}
                        />
                    </FormControl>
                    ) : (
                        <Select
                            value={category && echelon ? `${category}-${echelon}` : ""}
                            onValueChange={(value) => {
                                if (value === 'custom') {
                                    setIsCustomSalary(true);
                                    form.setValue('monthlyBaseSalary', 0);
                                    form.setValue('category', undefined);
                                    form.setValue('echelon', undefined);
                                    setSalaryInfo(null);
                                } else {
                                    const [cat, ech] = value.split('-');
                                    const selectedSalary = salaryGrid.find(s => s.category === cat && s.echelon === ech);
                                    if (selectedSalary) {
                                        form.setValue('monthlyBaseSalary', selectedSalary.sm);
                                        form.setValue('category', selectedSalary.category);
                                        form.setValue('echelon', selectedSalary.echelon);
                                        setSalaryInfo(`Correspond à la Catégorie ${selectedSalary.category}, Échelon ${selectedSalary.echelon}`);
                                    }
                                }
                            }}
                        >
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Sélectionnez un salaire de base" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <ScrollArea className="h-72">
                                {[...salaryGrid].sort((a, b) => a.sm - b.sm).map(s => (
                                    <SelectItem key={`${s.category}-${s.echelon}`} value={`${s.category}-${s.echelon}`}>
                                    {s.sm.toLocaleString('fr-FR')} FCFA (Cat: {s.category}, Ech: {s.echelon})
                                    </SelectItem>
                                ))}
                                <SelectItem value="custom">Autre (montant manuel)</SelectItem>
                            </ScrollArea>
                            </SelectContent>
                        </Select>
                    )}
                    {salaryInfo && <FormDescription className="text-primary flex items-center gap-1"><CheckCircle className="h-4 w-4" /> {salaryInfo}</FormDescription>}
                    <FormMessage>{form.formState.errors.monthlyBaseSalary?.message}</FormMessage>
                </FormItem>
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
              <CardTitle>Intégrations</CardTitle>
              <CardDescription>Connectez OM-Suivi à d'autres services pour automatiser vos tâches.</CardDescription>
            </CardHeader>
            <CardContent>
              {profile?.googleCalendarConnected ? (
                <div className="flex items-center justify-between rounded-lg border p-4 bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 24 24" className="h-8 w-8"><path fill="#34a853" d="M12 22a1 1 0 0 1-1-1v-8H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h9v8a1 1 0 0 1-1 1H4.5l7.5 7.5V21a1 1 0 0 1-1 1z"></path><path fill="#4285f4" d="M22 12a1 1 0 0 1-1 1h-8V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8z"></path><path fill="#fbbc04" d="M12 12a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h9v9a1 1 0 0 1-1 1h-8z"></path><path fill="#ea4335" d="M12 22a1 1 0 0 1-.71-.29l-9-9A1 1 0 0 1 2 12V3a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-.5l-7.21 7.21a1 1 0 0 1-.79.29z"></path></svg>
                    <p className="font-medium">Google Calendar Connecté</p>
                  </div>
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full h-12" onClick={handleConnectGoogle}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6 mr-2"><path fill="#34a853" d="M12 22a1 1 0 0 1-1-1v-8H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h9v8a1 1 0 0 1-1 1H4.5l7.5 7.5V21a1 1 0 0 1-1 1z"></path><path fill="#4285f4" d="M22 12a1 1 0 0 1-1 1h-8V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8z"></path><path fill="#fbbc04" d="M12 12a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h9v9a1 1 0 0 1-1 1h-8z"></path><path fill="#ea4335" d="M12 22a1 1 0 0 1-.71-.29l-9-9A1 1 0 0 1 2 12V3a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-.5l-7.21 7.21a1 1 0 0 1-.79.29z"></path></svg>
                  Connecter Google Calendar
                </Button>
              )}
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
                    <Button><Paperclip className="mr-2 h-4 w-4" />{t('goToLeaveRequest')}</Button>
                </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>{t('workplaceSettingsTitle')}</CardTitle>
              <CardDescription>{"Votre zone de travail est définie par l'administrateur."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {globalSettings?.workLatitude && globalSettings?.workLongitude ? (
                <>
                  <p className="font-semibold">{globalSettings.workplaceName || 'Lieu de travail principal'}</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem>
                      <FormLabel>{t('latitudeLabel')}</FormLabel>
                      <Input value={globalSettings.workLatitude.toFixed(6)} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                    </FormItem>
                    <FormItem>
                      <FormLabel>{t('longitudeLabel')}</FormLabel>
                      <Input value={globalSettings.workLongitude.toFixed(6)} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                    </FormItem>
                  </div>
                   <FormItem>
                      <FormLabel>{t('radiusLabel')}</FormLabel>
                      <Input value={globalSettings?.geofenceRadius || ''} readOnly className="text-muted-foreground focus:ring-0 focus:ring-offset-0 cursor-default" />
                  </FormItem>
                </>
              ) : (
                <p className="text-muted-foreground">Le lieu de travail n'a pas encore été défini par un administrateur.</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>{t('homeConfigTitle')}</CardTitle>
              <CardDescription>{t('homeConfigDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <Button type="button" variant="outline" className="w-full" onClick={() => handleSetLocation('home')}>
                  <Home className="mr-2 h-4 w-4" />
                  {t('setHomeLocationButton')}
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

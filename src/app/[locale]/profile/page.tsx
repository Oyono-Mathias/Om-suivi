
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking, addDocumentNonBlocking } from "@/firebase";
import { doc, collection, serverTimestamp } from "firebase/firestore";
import { Loader2, MapPin } from "lucide-react";
import type { Profile } from "@/lib/types";
import { Link } from "@/navigation";
import { useTranslations } from "next-intl";
import { useShift } from "@/context/ShiftContext";

export default function ProfilePage() {
  const t = useTranslations('ProfilePage');
  const tShared = useTranslations('Shared');
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isShiftActive } = useShift();

  const [location, setLocation] = useState<{latitude: number, longitude: number, address?: string} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  const profileSchema = z.object({
    name: z.string().min(2, { message: t('nameMinLengthError') }),
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
      monthlyBaseSalary: 0,
      currency: 'FCFA',
      reminders: { enabled: false, time: '17:00' }
    }
  });
  
  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || user?.displayName || '',
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

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        setPermissionState(status.state);
        status.onchange = () => {
          setPermissionState(status.state);
        };
      });
    }
  }, []);

  function onSubmit(values: z.infer<typeof profileSchema>) {
    if (!userProfileRef || !user) return;
    
    setDocumentNonBlocking(userProfileRef, values, { merge: true });
    
    toast({
      title: t('settingsUpdatedTitle'),
      description: t('settingsUpdatedDescription'),
    });
  }

  const handleSetWorkplace = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
          if (!response.ok) throw new Error('Failed to fetch address');
          const data = await response.json();
          
          setLocation({
            latitude: latitude,
            longitude: longitude,
            address: data.display_name
          });
        } catch (error) {
            console.error("Reverse geocoding failed:", error);
            setLocation({
                latitude: latitude,
                longitude: longitude,
            });
        } finally {
            setIsLocating(false);
            setShowLocationConfirm(true);
        }
      },
      () => {
        toast({
          variant: 'destructive',
          title: t('locationErrorTitle'),
          description: t('locationErrorDescription'),
        });
        setIsLocating(false);
      }
    );
  };

  const handleConfirmWorkplace = () => {
    if (!location || !userProfileRef || !user || !firestore) return;

    const newWorkplace = {
      latitude: location.latitude,
      longitude: location.longitude,
      radius: 200, // 200m radius
      address: location.address,
    };
    
    const workplaceUpdateLogCollectionRef = collection(firestore, 'users', user.uid, 'workplaceUpdateLogs');
    addDocumentNonBlocking(workplaceUpdateLogCollectionRef, {
      userProfileId: user.uid,
      timestamp: serverTimestamp(),
      previousWorkplace: profile?.workplace || null,
      newWorkplace: newWorkplace,
    });
    
    setDocumentNonBlocking(userProfileRef, { workplace: newWorkplace }, { merge: true });
    
    toast({
      title: t('workplaceSetTitle'),
      description: t('workplaceSetDescription'),
    });
    
    setShowLocationConfirm(false);
    setLocation(null);
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
  
  const locationDetails = location?.address
    ? location.address
    : `Lat: ${location?.latitude.toFixed(4)}, Lon: ${location?.longitude.toFixed(4)}`;

  const workZoneButton = (
    <Button 
        className="w-full"
        onClick={handleSetWorkplace} 
        disabled={isShiftActive || isLocating || permissionState === 'denied'}
    >
        {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2" />}
        {profile?.workplace ? t('updateWorkZoneButton') : t('setWorkZoneButton')}
    </Button>
  );

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
              <CardTitle>{t('workplaceTitle')}</CardTitle>
              <CardDescription>
                {t('workplaceDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile?.workplace && (
                <div className="rounded-lg border bg-muted p-4 text-center">
                    <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 font-semibold">{profile.workplace.address || t('workplaceSet')}</p>
                    <p className="text-xs text-muted-foreground">
                        {t('workplaceLat')}: {profile.workplace.latitude.toFixed(4)}, {t('workplaceLon')}: {profile.workplace.longitude.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {t('workplaceRadius')}: {profile.workplace.radius}m
                    </p>
                </div>
              )}
              
              {isShiftActive ? (
                  <TooltipProvider>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <span tabIndex={0} className="inline-block w-full">{workZoneButton}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                              <p>{t('updateDisabledTooltip')}</p>
                          </TooltipContent>
                      </Tooltip>
                  </TooltipProvider>
              ) : (
                  workZoneButton
              )}

              {permissionState === 'denied' && (
                  <p className="mt-2 text-center text-sm text-destructive">
                      {t('locationDeniedError')}
                  </p>
              )}
              {permissionState === 'prompt' && !profile?.workplace && (
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                      {t('locationPrompt')}
                  </p>
              )}
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
          
          <Button type="submit">{t('saveButton')}</Button>
        </form>
      </Form>

      <AlertDialog open={showLocationConfirm} onOpenChange={setShowLocationConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmWorkplaceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmWorkplaceDescription', {locationDetails})}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmWorkplace}>{t('confirmButton')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

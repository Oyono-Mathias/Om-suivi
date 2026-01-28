
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
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { Loader2, MapPin } from "lucide-react";
import type { Profile } from "@/lib/types";
import Link from "next/link";

const profileSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  monthlyBaseSalary: z.coerce.number().min(1, { message: "Base salary must be positive." }),
  currency: z.string().min(1, { message: "Currency symbol is required."}),
  reminders: z.object({
    enabled: z.boolean(),
    time: z.string(),
  }),
  workplace: z.object({
    latitude: z.number(),
    longitude: z.number(),
    radius: z.number(),
  }).optional(),
});

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');


  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'userProfiles', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      reminders: { enabled: false, time: '17:00' }
    }
  });
  
  useEffect(() => {
    if (profile) {
      form.reset(profile);
    } else if (user) {
      form.reset({
        name: user.displayName || '',
        ...form.getValues()
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
    
    const updatedProfile = {
      ...profile,
      ...values,
      id: user.uid,
      email: user.email || '',
    };
    
    setDocumentNonBlocking(userProfileRef, updatedProfile, { merge: true });
    
    toast({
      title: "Settings Updated",
      description: "Your information has been saved successfully.",
    });
  }

  const handleSetWorkplace = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setIsLocating(false);
        setShowLocationConfirm(true);
      },
      () => {
        toast({
          variant: 'destructive',
          title: 'Location Error',
          description: 'Could not get your location. Please check browser permissions.',
        });
        setIsLocating(false);
      }
    );
  };

  const handleConfirmWorkplace = () => {
    if (!location || !userProfileRef) return;

    const newWorkplace = {
      latitude: location.latitude,
      longitude: location.longitude,
      radius: 200, // 200m radius
    };
    
    setDocumentNonBlocking(userProfileRef, { workplace: newWorkplace }, { merge: true });
    
    toast({
      title: "Workplace Set!",
      description: "Your work zone has been saved successfully.",
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
        <p className="text-xl">Please sign in to continue.</p>
        <Link href="/login">
            <Button>Sign In</Button>
        </Link>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">Settings</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Personal & Financial Information</CardTitle>
              <CardDescription>
                Manage your personal and contractual details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Mathias Oyono" {...field} />
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
                      <FormLabel>Monthly Base Salary</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 72799" {...field} />
                      </FormControl>
                      <FormDescription>
                        Your hourly rate is automatically calculated (Salary / 173.33) and rounded.
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
                      <FormLabel>Currency Symbol</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., FCFA" {...field} />
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
              <CardTitle>Reminders</CardTitle>
              <CardDescription>
                Set up alerts to prevent missed time entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="reminders.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Reminders</FormLabel>
                      <FormDescription>
                        Receive a notification to log your hours.
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
                    <FormLabel>Reminder Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} className="w-auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workplace Setup</CardTitle>
              <CardDescription>
                Set your primary work location for geofence-based features.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile?.workplace ? (
                <div>
                  <div className="rounded-lg border bg-muted p-4 text-center">
                      <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-sm font-semibold">Workplace Location Set</p>
                      <p className="text-xs text-muted-foreground">
                          Lat: {profile.workplace.latitude.toFixed(4)}, Lon: {profile.workplace.longitude.toFixed(4)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                          Radius: {profile.workplace.radius}m
                      </p>
                      <div className="mt-2 h-32 w-full rounded bg-background flex items-center justify-center text-muted-foreground text-sm">
                          [Visual map placeholder]
                      </div>
                  </div>
                  <Button variant="outline" className="mt-4 w-full" onClick={handleSetWorkplace} disabled={isLocating || permissionState === 'denied'}>
                      {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2" />}
                      Update Work Zone
                  </Button>
                </div>
              ) : (
                <div>
                  <Button className="w-full" onClick={handleSetWorkplace} disabled={isLocating || permissionState === 'denied'}>
                      {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2" />}
                      Set Current Location as Work Zone
                  </Button>
                  {permissionState === 'denied' && (
                      <p className="mt-2 text-center text-sm text-destructive">
                          Location access denied. Please enable it in your browser settings.
                      </p>
                  )}
                  {permissionState === 'prompt' && (
                      <p className="mt-2 text-center text-sm text-muted-foreground">
                          You will be asked for location permission.
                      </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Button type="submit">Save Changes</Button>
        </form>
      </Form>

      <AlertDialog open={showLocationConfirm} onOpenChange={setShowLocationConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you currently at your workplace?</AlertDialogTitle>
            <AlertDialogDescription>
              This location (Lat: {location?.latitude.toFixed(4)}, Lon: {location?.longitude.toFixed(4)}) will be used to track your shifts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmWorkplace}>Confirm Location</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

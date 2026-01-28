
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
  name: z.string().min(2, { message: "Le nom doit contenir au moins 2 caractères." }),
  monthlyBaseSalary: z.coerce.number().min(1, { message: "Le salaire de base doit être positif." }),
  currency: z.string().min(1, { message: "Le symbole de la devise est requis."}),
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
      title: "Paramètres mis à jour",
      description: "Vos informations ont été enregistrées avec succès.",
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
          title: 'Erreur de localisation',
          description: 'Impossible d\'obtenir votre position. Veuillez vérifier les autorisations du navigateur.',
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
      title: "Lieu de travail défini !",
      description: "Votre zone de travail a été enregistrée avec succès.",
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
        <p className="text-xl">Veuillez vous connecter pour continuer.</p>
        <Link href="/login">
            <Button>Se connecter</Button>
        </Link>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-headline font-bold">Paramètres</h1>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Informations Personnelles et Financières</CardTitle>
              <CardDescription>
                Gérez vos informations personnelles et contractuelles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom complet</FormLabel>
                    <FormControl>
                      <Input placeholder="ex: Mathias Oyono" {...field} />
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
                      <FormLabel>Salaire de Base Mensuel</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="ex: 72799" {...field} />
                      </FormControl>
                      <FormDescription>
                        Votre taux horaire est calculé automatiquement (Salaire / 173.33) et arrondi.
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
                      <FormLabel>Symbole de la devise</FormLabel>
                      <FormControl>
                        <Input placeholder="ex: FCFA" {...field} />
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
              <CardTitle>Rappels</CardTitle>
              <CardDescription>
                Configurez des alertes pour éviter d'oublier de pointer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="reminders.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activer les rappels</FormLabel>
                      <FormDescription>
                        Recevez une notification pour enregistrer vos heures.
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
                    <FormLabel>Heure du rappel</FormLabel>
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
              <CardTitle>Configuration du lieu de travail</CardTitle>
              <CardDescription>
                Définissez votre lieu de travail principal pour les fonctionnalités basées sur la géolocalisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile?.workplace ? (
                <div>
                  <div className="rounded-lg border bg-muted p-4 text-center">
                      <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-sm font-semibold">Lieu de travail défini</p>
                      <p className="text-xs text-muted-foreground">
                          Lat: {profile.workplace.latitude.toFixed(4)}, Lon: {profile.workplace.longitude.toFixed(4)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                          Rayon: {profile.workplace.radius}m
                      </p>
                      <div className="mt-2 h-32 w-full rounded bg-background flex items-center justify-center text-muted-foreground text-sm">
                          [Espace réservé pour la carte visuelle]
                      </div>
                  </div>
                  <Button variant="outline" className="mt-4 w-full" onClick={handleSetWorkplace} disabled={isLocating || permissionState === 'denied'}>
                      {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2" />}
                      Mettre à jour la zone de travail
                  </Button>
                </div>
              ) : (
                <div>
                  <Button className="w-full" onClick={handleSetWorkplace} disabled={isLocating || permissionState === 'denied'}>
                      {isLocating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2" />}
                      Définir l'emplacement actuel comme zone de travail
                  </Button>
                  {permissionState === 'denied' && (
                      <p className="mt-2 text-center text-sm text-destructive">
                          Accès à la localisation refusé. Veuillez l'activer dans les paramètres de votre navigateur.
                      </p>
                  )}
                  {permissionState === 'prompt' && (
                      <p className="mt-2 text-center text-sm text-muted-foreground">
                          L'autorisation de localisation vous sera demandée.
                      </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Button type="submit">Enregistrer les modifications</Button>
        </form>
      </Form>

      <AlertDialog open={showLocationConfirm} onOpenChange={setShowLocationConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous actuellement sur votre lieu de travail ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cet emplacement (Lat: {location?.latitude.toFixed(4)}, Lon: {location?.longitude.toFixed(4)}) sera utilisé pour suivre vos quarts de travail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmWorkplace}>Confirmer l'emplacement</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

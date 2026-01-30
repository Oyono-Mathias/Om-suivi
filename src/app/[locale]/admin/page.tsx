
'use client';

import React, { useState, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, setDoc } from 'firebase/firestore';
import { Loader2, ShieldX, User, ShieldCheck, Search } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Profile, GlobalSettings } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { UserTimeEntriesSheet } from '@/components/user-time-entries-sheet';

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

function GlobalSettingsForm() {
    const t = useTranslations('AdminPage');
    const firestore = useFirestore();
    const { toast } = useToast();
    const { user } = useUser();

    const settingsRef = useMemoFirebase(() => user ? doc(firestore, 'settings', 'global') : null, [firestore, user]);
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
    
    React.useEffect(() => {
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

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Link } from '@/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Activity, FileText, Wallet, Settings, Bell, LogOut, Building, MapPin, TrendingUp } from 'lucide-react';
import type { Profile, GlobalSettings, Announcement } from '@/lib/types';
import { salaryGrid as staticSalaryGrid } from '@/lib/salary-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';


function SalaryGridModal({ isOpen, onOpenChange }: { isOpen: boolean, onOpenChange: (open: boolean) => void }) {
    const t = useTranslations('AdminDashboardPage');
    const firestore = useFirestore();
    const { toast } = useToast();

    const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);

    const [grid, setGrid] = useState(staticSalaryGrid);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (globalSettings?.salaryGrid && globalSettings.salaryGrid.length > 0) {
            setGrid(globalSettings.salaryGrid);
        }
    }, [globalSettings]);

    const handleSalaryChange = (category: string, echelon: string, newSalary: string) => {
        const value = parseFloat(newSalary);
        if (isNaN(value)) return;

        setGrid(currentGrid =>
            currentGrid.map(entry =>
                entry.category === category && entry.echelon === echelon
                    ? { ...entry, sm: value }
                    : entry
            )
        );
    };
    
    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            await setDoc(settingsRef, { salaryGrid: grid }, { merge: true });
            toast({ title: t('gridUpdateSuccess') });
            onOpenChange(false);
        } catch (error) {
            toast({ variant: "destructive", title: t('gridUpdateError') });
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('editSalaryGridTitle')}</DialogTitle>
                    <DialogDescription>{t('editSalaryGridDescription')}</DialogDescription>
                </DialogHeader>
                {isLoadingSettings ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <ScrollArea className="flex-1">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background">
                                <TableRow>
                                    <TableHead>{t('categoryLabel')}</TableHead>
                                    <TableHead>{t('echelonLabel')}</TableHead>
                                    <TableHead className="text-right">{t('salaryLabel')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {grid.map((entry) => (
                                    <TableRow key={`${entry.category}-${entry.echelon}`}>
                                        <TableCell className="font-medium">{entry.category}</TableCell>
                                        <TableCell>{entry.echelon}</TableCell>
                                        <TableCell className="text-right">
                                            <Input
                                                type="number"
                                                value={entry.sm}
                                                onChange={(e) => handleSalaryChange(entry.category, entry.echelon, e.target.value)}
                                                className="w-40 ml-auto h-8 text-right"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
                 <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancelButton')}</Button>
                    <Button onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('saveButton')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AlertCenterDialog({ isOpen, onOpenChange, profile }: { isOpen: boolean, onOpenChange: (open: boolean) => void, profile: Profile | null }) {
    const tTeam = useTranslations('TeamPage');
    const tAdmin = useTranslations('AdminPage');
    const firestore = useFirestore();
    const { toast } = useToast();

    const announcementSchema = z.object({
        message: z.string().min(1, { message: "Le message ne peut pas être vide." }),
    });

    const form = useForm<z.infer<typeof announcementSchema>>({
        resolver: zodResolver(announcementSchema),
        defaultValues: { message: '' },
    });

    useEffect(() => {
        if (!isOpen) {
            form.reset();
        }
    }, [isOpen, form]);

    const handleSendAnnouncement = async (values: z.infer<typeof announcementSchema>) => {
        if (!profile) return;

        const newAnnouncement: Omit<Announcement, 'id'> = {
            message: values.message,
            authorName: profile.name,
            createdAt: serverTimestamp(),
        };
        await addDocumentNonBlocking(collection(firestore, 'announcements'), newAnnouncement);
        toast({ title: tTeam('announcementSentSuccess') });
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{tTeam('announcementDialogTitle')}</DialogTitle>
                    <DialogDescription>{tTeam('announcementDialogDescription')}</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSendAnnouncement)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="message"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{tTeam('messageLabel')}</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Votre message ici..." {...field} rows={5} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">{tAdmin('deleteEntryCancel')}</Button>
                            </DialogClose>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {tTeam('sendButton')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function ConfigurationModal({ isOpen, onOpenChange }: { isOpen: boolean, onOpenChange: (open: boolean) => void }) {
    const t = useTranslations('AdminPage');
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const configSchema = z.object({
        workplaceName: z.string().optional(),
        workLatitude: z.number().optional(),
        workLongitude: z.number().optional(),
        geofenceRadius: z.coerce.number().min(10),
        autoClockInEnabled: z.boolean(),
        breakDuration: z.coerce.number().min(0),
        tier1Rate: z.coerce.number().min(1),
        tier2Rate: z.coerce.number().min(1),
        nightRate: z.coerce.number().min(1),
        sundayRate: z.coerce.number().min(1),
        holidayRate: z.coerce.number().min(1),
        absencePenaltyAmount: z.coerce.number().min(0),
        defaultHourlyRate: z.coerce.number().min(0),
    });

    const settingsRef = useMemoFirebase(() => doc(firestore, 'settings', 'global'), [firestore]);
    const { data: globalSettings, isLoading: isLoadingSettings } = useDoc<GlobalSettings>(settingsRef);
    
    const form = useForm<z.infer<typeof configSchema>>({
        resolver: zodResolver(configSchema),
    });
    
    useEffect(() => {
        if(globalSettings) {
            form.reset({
                workplaceName: globalSettings.workplaceName || '',
                workLatitude: globalSettings.workLatitude,
                workLongitude: globalSettings.workLongitude,
                geofenceRadius: globalSettings.geofenceRadius || 100,
                autoClockInEnabled: globalSettings.autoClockInEnabled || false,
                breakDuration: globalSettings.breakDuration || 0,
                tier1Rate: globalSettings.overtimeRates?.tier1 || 1.2,
                tier2Rate: globalSettings.overtimeRates?.tier2 || 1.3,
                nightRate: globalSettings.overtimeRates?.night || 1.4,
                sundayRate: globalSettings.overtimeRates?.sunday || 1.5,
                holidayRate: globalSettings.overtimeRates?.holiday || 1.5,
                absencePenaltyAmount: globalSettings.absencePenaltyAmount || 2426,
                defaultHourlyRate: globalSettings.defaultHourlyRate || 0,
            });
        }
    }, [globalSettings, form]);

    const handleSetLocation = () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              form.setValue('workLatitude', latitude);
              form.setValue('workLongitude', longitude);
              toast({ title: t('workplaceSetSuccess') });
            },
            () => toast({ variant: 'destructive', title: "Erreur de géolocalisation" })
          );
        }
    };
    
    const handleSaveChanges = async (values: z.infer<typeof configSchema>) => {
        const { tier1Rate, tier2Rate, nightRate, sundayRate, holidayRate, ...otherValues } = values;
        const dataToSave = {
            ...otherValues,
            overtimeRates: {
                tier1: tier1Rate,
                tier2: tier2Rate,
                night: nightRate,
                sunday: sundayRate,
                holiday: holidayRate,
            }
        };
        await setDoc(settingsRef, dataToSave, { merge: true });
        toast({ title: t('configUpdatedTitle'), description: t('configUpdatedDescription') });
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('configTab')}</DialogTitle>
                    <DialogDescription>{t('configDescription')}</DialogDescription>
                </DialogHeader>
                {isLoadingSettings ? <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSaveChanges)} className="space-y-6 flex-1 overflow-y-auto pr-6 pl-1">
                            <Card>
                                <CardHeader><CardTitle>{t('workplaceSettingsTitle')}</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                     <FormField control={form.control} name="workplaceName" render={({ field }) => (<FormItem><FormLabel>{t('workplaceNameLabel')}</FormLabel><FormControl><Input {...field} placeholder={t('workplaceNamePlaceholder')} /></FormControl><FormMessage /></FormItem>)} />
                                     <Button type="button" variant="outline" className="w-full" onClick={handleSetLocation}><MapPin className="mr-2 h-4 w-4" />{t('setWorkplaceButton')}</Button>
                                     <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="workLatitude" render={({ field }) => (<FormItem><FormLabel>{t('latitudeLabel')}</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} readOnly /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name="workLongitude" render={({ field }) => (<FormItem><FormLabel>{t('longitudeLabel')}</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} readOnly/></FormControl><FormMessage /></FormItem>)} />
                                     </div>
                                     <FormField control={form.control} name="geofenceRadius" render={({ field }) => (<FormItem><FormLabel>{t('radiusLabel')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>{t('radiusDescription')}</FormDescription><FormMessage /></FormItem>)} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>{t('rulesTitle')}</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <FormField control={form.control} name="autoClockInEnabled" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4"><div className="space-y-0.5"><FormLabel>{t('autoClockInLabel')}</FormLabel><FormDescription>{t('autoClockInDescription')}</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                                    <FormField control={form.control} name="breakDuration" render={({ field }) => (<FormItem><FormLabel>{t('breakDurationLabel')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>{t('breakDurationDescription')}</FormDescription><FormMessage /></FormItem>)} />
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>{t('overtimeRulesTitle')}</CardTitle><CardDescription>{t('overtimeRulesDescription')}</CardDescription></CardHeader>
                                <CardContent className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="tier1Rate" render={({ field }) => (<FormItem><FormLabel>{t('tier1RateLabel')}</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="tier2Rate" render={({ field }) => (<FormItem><FormLabel>{t('tier2RateLabel')}</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="nightRate" render={({ field }) => (<FormItem><FormLabel>{t('nightRateLabel')}</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="sundayRate" render={({ field }) => (<FormItem><FormLabel>{t('sundayRateLabel')}</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="holidayRate" render={({ field }) => (<FormItem><FormLabel>{t('holidayRateLabel')}</FormLabel><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader><CardTitle>{t('payrollSettingsTitle')}</CardTitle><CardDescription>{t('payrollSettingsDescription')}</CardDescription></CardHeader>
                                <CardContent className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="absencePenaltyAmount" render={({ field }) => (<FormItem><FormLabel>{t('absencePenaltyAmountLabel')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>{t('absencePenaltyAmountDescription')}</FormDescription><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="defaultHourlyRate" render={({ field }) => (<FormItem><FormLabel>{t('defaultHourlyRateLabel')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>{t('defaultHourlyRateDescription')}</FormDescription><FormMessage /></FormItem>)} />
                                </CardContent>
                            </Card>
                            <DialogFooter className="sticky bottom-0 bg-background py-4">
                                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>{t('cancelButton')}</Button>
                                <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('saveConfigButton')}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default function AdminDashboardPage() {
    const t = useTranslations('AdminDashboardPage');
    const { user, isUserLoading } = useUser();
    const auth = useAuth();
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: profile, isLoading: isLoadingProfile } = useDoc<Profile>(userProfileRef);
    
    const [isSalaryGridOpen, setIsSalaryGridOpen] = useState(false);
    const [isAlertCenterOpen, setIsAlertCenterOpen] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    
    const activeEmployees = 0; 
    
    const adminCards = [
        { title: t('personnelManagementTitle'), description: t('personnelManagementDescription'), href: '/admin/users', icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-950' },
        { title: t('careerManagement.title'), description: t('careerManagement.description'), href: '/admin/career', icon: TrendingUp, color: 'text-indigo-400', bgColor: 'bg-indigo-950' },
        { title: t('liveTrackingTitle'), description: t('liveTrackingDescription'), href: '/admin/live', icon: Activity, color: 'text-green-500', bgColor: 'bg-green-950' },
        { title: t('reportsPdfTitle'), description: t('reportsPdfDescription'), href: '/admin/reports', icon: FileText, color: 'text-purple-500', bgColor: 'bg-purple-950' },
        { title: t('payrollCalculationTitle'), description: t('payrollCalculationDescription'), href: '/admin/payroll', icon: Wallet, color: 'text-yellow-500', bgColor: 'bg-yellow-950' },
        { title: t('salaryGridTitle'), description: t('salaryGridDescription'), action: () => setIsSalaryGridOpen(true), icon: Settings, color: 'text-gray-500', bgColor: 'bg-gray-950' },
        { title: t('alertCenterTitle'), description: t('alertCenterDescription'), action: () => setIsAlertCenterOpen(true), icon: Bell, color: 'text-orange-500', bgColor: 'bg-orange-950' },
        { title: t('configTab'), description: t('configDescription'), action: () => setIsConfigOpen(true), icon: Building, color: 'text-pink-500', bgColor: 'bg-pink-950' },
    ];
    
    const isLoading = isUserLoading || isLoadingProfile;
    if (isLoading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
    }
    
    if (!user) {
        return <div className="flex h-screen w-full items-center justify-center"><p>Please log in.</p></div>;
    }
    
    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
                    <p className="text-muted-foreground">{t('activeEmployees', {count: activeEmployees})}</p>
                </div>
                <Button variant="ghost" onClick={() => signOut(auth)}>
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('logout')}
                </Button>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {adminCards.map((card) => {
                    const CardComponent = (
                        <Card className={cn('group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1 h-full', card.href ? 'cursor-pointer' : 'cursor-pointer')}
                            onClick={card.action ? card.action : undefined}>
                            <CardHeader className={cn("p-4", card.bgColor)}>
                                <card.icon className={cn("h-8 w-8 mb-2", card.color)} />
                            </CardHeader>
                            <CardContent className="p-4">
                                <h3 className="font-semibold text-base mb-1">{card.title}</h3>
                                <p className="text-xs text-muted-foreground">{card.description}</p>
                            </CardContent>
                        </Card>
                    );
                    
                    return card.href ? (
                        <Link href={card.href} key={card.title} className="block h-full">
                           {CardComponent}
                        </Link>
                    ) : (
                        <div key={card.title}>{CardComponent}</div>
                    );
                })}
            </div>
            
            <SalaryGridModal isOpen={isSalaryGridOpen} onOpenChange={setIsSalaryGridOpen} />
            <AlertCenterDialog isOpen={isAlertCenterOpen} onOpenChange={setIsAlertCenterOpen} profile={profile} />
            <ConfigurationModal isOpen={isConfigOpen} onOpenChange={setIsConfigOpen} />
        </div>
    );
}

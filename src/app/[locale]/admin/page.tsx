
'use client';

import React, { useState } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Loader2, ShieldX, User, ShieldCheck, Search, AlertTriangle } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Profile, TimeEntry } from '@/lib/types';
import { useTranslations, useLocale } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { shifts } from '@/lib/shifts';
import { format, parse, differenceInMinutes, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

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

function UserTimeEntriesSheet({ user, onOpenChange }: { user: Profile | null, onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('AdminPage');
  const locale = useLocale();
  const dateFnsLocale = locale === 'fr' ? fr : enUS;
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

  const timeEntriesQuery = useMemoFirebase(
    () => user ? query(collection(firestore, 'users', user.id, 'timeEntries'), orderBy('date', 'desc')) : null,
    [firestore, user]
  );
  const { data: timeEntries, isLoading: isLoadingEntries } = useCollection<TimeEntry>(timeEntriesQuery);

  const editFormSchema = z.object({
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  });

  const form = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
  });

  React.useEffect(() => {
    if (editingEntry) {
      form.reset({ endTime: editingEntry.endTime });
    }
  }, [editingEntry, form]);

  function onEditSubmit(values: z.infer<typeof editFormSchema>) {
    if (!editingEntry || !user) return;

    const shift = shifts.find(s => s.id === editingEntry.shiftId);
    if (!shift) {
        toast({ variant: 'destructive', title: "Erreur", description: "Le poste de travail est introuvable." });
        return;
    }

    const startDateTime = parse(`${editingEntry.date} ${editingEntry.startTime}`, 'yyyy-MM-dd HH:mm', new Date());
    const endDateTime = parse(`${editingEntry.date} ${values.endTime}`, 'yyyy-MM-dd HH:mm', new Date());

    if (endDateTime <= startDateTime) {
        form.setError('endTime', { message: "L'heure de fin doit être après l'heure de début." });
        return;
    }

    const totalDuration = differenceInMinutes(endDateTime, startDateTime);

    const shiftEndDateTime = parseISO(`${editingEntry.date}T${shift.endTime}:00`);
    let overtimeDuration = 0;
    if (endDateTime > shiftEndDateTime) {
        overtimeDuration = differenceInMinutes(endDateTime, shiftEndDateTime);
    }

    const entryRef = doc(firestore, 'users', user.id, 'timeEntries', editingEntry.id);
    updateDocumentNonBlocking(entryRef, {
      endTime: values.endTime,
      duration: totalDuration,
      overtimeDuration: overtimeDuration > 0 ? overtimeDuration : 0,
    });

    toast({ title: "Pointage mis à jour", description: "L'entrée de temps a été modifiée avec succès." });
    setEditingEntry(null);
  }

  return (
    <>
      <Sheet open={!!user} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl p-0">
            {user && (
                 <SheetHeader className="p-6 border-b">
                    <SheetTitle>Pointages de {user.name}</SheetTitle>
                    <SheetDescription>{user.email}</SheetDescription>
                </SheetHeader>
            )}
            <div className="p-6">
                {isLoadingEntries ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Heures</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {timeEntries && timeEntries.length > 0 ? (
                                timeEntries.map(entry => (
                                    <TableRow key={entry.id}>
                                        <TableCell>
                                            <div className="font-medium">{format(parseISO(entry.date), 'PPP', { locale: dateFnsLocale })}</div>
                                            <div className="text-xs text-muted-foreground">{shifts.find(s => s.id === entry.shiftId)?.name}</div>
                                        </TableCell>
                                        <TableCell>
                                            {entry.startTime} - {entry.endTime}
                                            {entry.modified_manually && (
                                                <Badge variant="destructive" className="ml-2 gap-1">
                                                  <AlertTriangle className="h-3 w-3" />
                                                  {t('manualModificationLabel')}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => setEditingEntry(entry)}>Modifier</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">Aucune entrée de temps.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'heure de fin</DialogTitle>
            {editingEntry && <DialogDescription>Pour {user?.name} le {format(parseISO(editingEntry.date), 'PPP', { locale: dateFnsLocale })}.</DialogDescription>}
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heure de fin de service</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Annuler</Button>
                </DialogClose>
                <Button type="submit">Enregistrer</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
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
                        <div className="font-semibold">
                            <span>{p.monthlyBaseSalary ? `${p.monthlyBaseSalary.toLocaleString('fr-FR')}` : 'N/A'}</span>
                            <span className="text-muted-foreground"> {p.currency}</span>
                        </div>
                        <div className="text-muted-foreground">{p.profession ? tProfile(`professions.${p.profession}`) : ''}</div>
                        <Badge variant={p.role === 'admin' ? 'default' : 'secondary'} className="gap-1 text-xs mt-1">
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

      <UserTimeEntriesSheet user={viewingUser} onOpenChange={(open) => !open && setViewingUser(null)} />
    </div>
  );
}

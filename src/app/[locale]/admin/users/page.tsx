'use client';

import React, { useState, useMemo } from 'react';
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, setDoc, query, where, orderBy } from 'firebase/firestore';
import { Loader2, ShieldX, User, ShieldCheck, Search } from 'lucide-react';
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Profile } from '@/lib/types';
import { useTranslations } from 'next-intl';
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


export default function AdminUsersPage() {
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
    return query(collection(firestore, 'users'), orderBy('name', 'asc'));
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

      <UserTimeEntriesSheet user={viewingUser} onOpenChange={(open) => !open && setViewingUser(null)} />
    </div>
  );
}

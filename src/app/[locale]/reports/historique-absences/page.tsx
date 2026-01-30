
'use client';

import React from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { AbsenceJustification } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { format, parseISO } from 'date-fns';
import { fr, enUS } from "date-fns/locale";
import { Link } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

export default function HistoriqueAbsencesPage() {
    const t = useTranslations('HistoriqueAbsencesPage');
    const tShared = useTranslations('Shared');
    const locale = useLocale();
    const dateFnsLocale = locale === 'fr' ? fr : enUS;

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const justificationsQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'absenceJustifications'), where('userId', '==', user.uid), orderBy('absenceDate', 'desc'));
    }, [firestore, user]);

    const { data: justifications, isLoading: isLoadingJustifications } = useCollection<AbsenceJustification>(justificationsQuery);
    
    const getStatusVariant = (status: AbsenceJustification['status']) => {
        switch (status) {
            case 'approved': return 'default';
            case 'rejected': return 'destructive';
            case 'pending': return 'secondary';
            default: return 'outline';
        }
    }
    
    const getStatusLabel = (status: AbsenceJustification['status']) => {
        switch (status) {
            case 'approved': return t('statusApproved');
            case 'rejected': return t('statusRejected');
            case 'pending': return t('statusPending');
            default: return status;
        }
    }

    const isLoading = isUserLoading || isLoadingJustifications;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
    }

    if (!user) {
        return <div className="flex flex-col justify-center items-center h-screen gap-4"><p className="text-xl">{tShared('pleaseLogin')}</p><Link href="/login"><Button>{tShared('loginButton')}</Button></Link></div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-headline font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('description')}</p>

            <Card>
                <CardHeader>
                    <CardTitle>{t('title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {justifications && justifications.length > 0 ? (
                        justifications.map(justif => (
                            <Card key={justif.id} className="p-4 flex flex-col md:flex-row gap-4 items-start">
                                <div className="w-full md:w-32 h-32 relative border rounded-md overflow-hidden">
                                     <a href={justif.imageUrl} target="_blank" rel="noopener noreferrer">
                                        <Image src={justif.imageUrl} alt={`${t('document')} pour ${justif.absenceDate}`} layout="fill" className="object-cover"/>
                                    </a>
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <p className="font-bold">{format(parseISO(justif.absenceDate), 'PPP', {locale: dateFnsLocale})}</p>
                                        <Badge variant={getStatusVariant(justif.status)}>{getStatusLabel(justif.status)}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">Soumis le: {format(justif.submittedAt.toDate(), 'PPP p', {locale: dateFnsLocale})}</p>
                                    <a href={justif.imageUrl} target="_blank" rel="noopener noreferrer">
                                        <Button variant="link" className="p-0 h-auto mt-2">{t('viewDocument')}</Button>
                                    </a>
                                </div>
                            </Card>
                        ))
                    ) : (
                        <p className="text-center text-muted-foreground py-8">{t('noJustifications')}</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

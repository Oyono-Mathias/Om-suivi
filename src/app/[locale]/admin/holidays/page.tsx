'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query,
  serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { CalendarDays, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useFirestore, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc as firestoreDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { getCameroonHolidaySeeds, type PublicHolidayRecord } from '@/lib/public-holidays';

type HolidayCategory = 'civil' | 'religious' | 'exceptional';

export default function AdminHolidaysPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const profileRef = useMemoFirebase(() => user ? firestoreDoc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: profile, isLoading: isProfileLoading } = useDoc<{ role?: string }>(profileRef);
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<PublicHolidayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<HolidayCategory>('civil');
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const holidaysQuery = useMemo(
    () => query(collection(firestore, 'public_holidays'), where('year', '==', year), orderBy('date', 'asc')),
    [firestore, year]
  );

  useEffect(() => {
    setLoading(true);
    return onSnapshot(holidaysQuery, (snapshot) => {
      setHolidays(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PublicHolidayRecord)));
      setLoading(false);
    }, (error) => {
      console.error('Public holidays subscription failed:', error);
      setLoading(false);
      toast({ variant: 'destructive', title: 'Impossible de charger le calendrier des jours fériés.' });
    });
  }, [holidaysQuery, toast]);

  const isAdmin = profile?.role === 'admin';
  const resetForm = () => { setDate(''); setLabel(''); setCategory('civil'); setEditingDate(null); };

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !date || !label.trim()) return;
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
      toast({ variant: 'destructive', title: 'Date invalide.' });
      return;
    }
    const [y, m, d] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
      toast({ variant: 'destructive', title: 'Date invalide.' });
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(firestore);
      if (editingDate && editingDate !== date) batch.delete(doc(firestore, 'public_holidays', editingDate));
      batch.set(doc(firestore, 'public_holidays', date), {
        date, year: y, label: label.trim(), category,
        source: category === 'exceptional' ? 'Arrêté / décision administrative saisi par un administrateur' : 'Calendrier légal du Cameroun',
        seeded: false,
        ...(editingDate ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await batch.commit();
      toast({ title: editingDate ? 'Jour férié modifié.' : 'Jour férié ajouté.' });
      resetForm();
      setYear(y);
    } catch (error) {
      console.error('Holiday save failed:', error);
      toast({ variant: 'destructive', title: 'Enregistrement refusé. Vérifiez les droits administrateur.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: PublicHolidayRecord) {
    if (!isAdmin || !window.confirm(`Supprimer « ${item.label} » du ${item.date} ?`)) return;
    try {
      await deleteDoc(doc(firestore, 'public_holidays', item.id));
      if (editingDate === item.date) resetForm();
      toast({ title: 'Jour férié supprimé.' });
    } catch (error) {
      console.error('Holiday delete failed:', error);
      toast({ variant: 'destructive', title: 'Suppression impossible.' });
    }
  }

  async function handleSeedYear() {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const snapshot = await getDocs(query(collection(firestore, 'public_holidays'), where('year', '==', year)));
      const existingDates = new Set(snapshot.docs.map((item) => item.id));
      const seeds = getCameroonHolidaySeeds(year).filter((item) => !existingDates.has(item.date));
      if (seeds.length === 0) {
        toast({ title: 'Le calendrier légal de cette année est déjà préchargé.' });
        return;
      }
      const batch = writeBatch(firestore);
      for (const item of seeds) {
        batch.set(doc(firestore, 'public_holidays', item.date), {
          ...item, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      toast({ title: `${seeds.length} jours fériés préchargés pour ${year}.` });
    } catch (error) {
      console.error('Holiday seed failed:', error);
      toast({ variant: 'destructive', title: 'Préchargement impossible.' });
    } finally {
      setSaving(false);
    }
  }

  if (isUserLoading || isProfileLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user || !isAdmin) return <div className="p-6"><h1 className="text-xl font-semibold">Accès réservé à l’administration</h1></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><CalendarDays className="h-4 w-4" /> Paramètres de paie</div>
          <h1 className="text-2xl font-bold sm:text-3xl">Calendrier des jours fériés</h1>
          <p className="text-sm text-muted-foreground">Les jours fériés enregistrés sont rémunérés à 150 %, même s’ils tombent un dimanche.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input aria-label="Année du calendrier" type="number" min="2020" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
          <Button type="button" variant="outline" onClick={handleSeedYear} disabled={saving}><RefreshCw className="mr-2 h-4 w-4" /> Précharger l’année</Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{editingDate ? 'Modifier un jour férié' : 'Ajouter un jour férié'}</CardTitle>
          <CardDescription>Les dates fixes et les fêtes mobiles calculables sont préchargées. Les fêtes de fin de Ramadan et du Mouton doivent être saisies selon l’annonce officielle annuelle.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <Input aria-label="Date du jour férié" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <Input aria-label="Libellé" placeholder="Ex. Fête nationale" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required />
            <Select value={category} onValueChange={(value) => setCategory(value as HolidayCategory)}>
              <SelectTrigger><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="civil">Fête civile</SelectItem>
                <SelectItem value="religious">Fête religieuse</SelectItem>
                <SelectItem value="exceptional">Jour exceptionnel (arrêté)</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !date || !label.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Enregistrer</Button>
              {editingDate && <Button type="button" variant="outline" onClick={resetForm}>Annuler</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Jours fériés enregistrés — {year}</CardTitle><CardDescription>{holidays.length} date(s) dans le calendrier actif.</CardDescription></CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : holidays.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucune date. Cliquez sur « Précharger l’année » pour créer le calendrier de base.</p>
          ) : (
            <div className="divide-y">
              {holidays.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.date} · {item.category === 'civil' ? 'Civil' : item.category === 'religious' ? 'Religieux' : 'Exceptionnel'}{item.seeded ? ' · Préchargé' : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="icon" variant="outline" aria-label={`Modifier ${item.label}`} onClick={() => { setEditingDate(item.date); setDate(item.date); setLabel(item.label); setCategory(item.category); }}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="destructive" aria-label={`Supprimer ${item.label}`} onClick={() => handleDelete(item)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

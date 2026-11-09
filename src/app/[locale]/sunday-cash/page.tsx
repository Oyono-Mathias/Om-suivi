'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { CalendarDays, Clock3, Moon, Sun, Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { calculateSpecialDayCashPayout } from '@/lib/payroll-calculations';
import type { PublicHolidayRecord } from '@/lib/public-holidays';

function getNextSundayDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const formatFCFA = (amount: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' FCFA';

export default function SundayCashPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [date, setDate] = useState(getNextSundayDate);
  const [shiftType, setShiftType] = useState<'day' | 'night'>('day');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [breakMinutes, setBreakMinutes] = useState('60');
  const [hourlyRate, setHourlyRate] = useState('1500');
  const [holidays, setHolidays] = useState<PublicHolidayRecord[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedYear = Number(date.slice(0, 4));
  useEffect(() => {
    if (!selectedYear || !Number.isFinite(selectedYear)) return;
    setLoadingCalendar(true);
    const holidayQuery = query(collection(firestore, 'public_holidays'), where('year', '==', selectedYear));
    return onSnapshot(holidayQuery, (snapshot) => {
      setHolidays(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PublicHolidayRecord)));
      setLoadingCalendar(false);
    }, (snapshotError) => {
      console.error('Public holiday calendar load failed:', snapshotError);
      setLoadingCalendar(false);
      setError('Le calendrier des jours fériés est indisponible.');
    });
  }, [firestore, selectedYear]);

  const calculation = useMemo(() => calculateSpecialDayCashPayout({
    date, startTime, endTime,
    breakMinutes: Number(breakMinutes) || 0,
    hourlyRate: Number(hourlyRate) || 0,
    shiftType,
    holidays,
  }), [date, startTime, endTime, breakMinutes, hourlyRate, shiftType, holidays]);

  const isSpecialDate = calculation.dayKind !== 'ordinary';
  const validAmount = Number.isFinite(calculation.amount) && calculation.amount > 0;
  const canSave = Boolean(user && isSpecialDate && validAmount && !saving && !loadingCalendar);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!user) return setError('Connectez-vous pour enregistrer ce paiement.');
    if (!isSpecialDate) return setError('La date doit être un dimanche ou un jour férié enregistré.');
    if (!validAmount) return setError('Le montant calculé doit être supérieur à 0 FCFA.');

    setSaving(true);
    try {
      await addDoc(collection(firestore, 'sunday_cash_payouts'), {
        userId: user.uid,
        employeeName: user.displayName || user.email || 'Employé',
        date, shiftType, startTime, endTime,
        breakMinutes: Math.max(0, Math.min(1440, Number(breakMinutes) || 0)),
        hourlyRate: Math.max(0, Number(hourlyRate) || 0),
        workedMinutes: calculation.workedMinutes,
        workedHours: calculation.workedHours,
        dayKind: calculation.dayKind,
        dayLabel: calculation.dayLabel,
        multiplier: calculation.multiplier,
        hourlyWage: calculation.hourlyWage,
        ration: calculation.ration,
        nightBasket: calculation.nightBasket,
        amount: calculation.amount,
        currency: 'XAF',
        status: 'recorded',
        createdAt: serverTimestamp(),
      });
      setSuccess('Le paiement spécial a été enregistré séparément du bulletin mensuel.');
    } catch (saveError) {
      console.error('Special-day cash payout save failed:', saveError);
      setError("Impossible d'enregistrer ce paiement. Vérifiez vos droits Firestore et réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
          <CalendarDays className="h-4 w-4" /> Paiement exceptionnel
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dimanches &amp; Jours fériés — Cash</h1>
        <p className="text-sm text-muted-foreground">
          Calculez une vacation spéciale indépendamment du bulletin mensuel. Le calendrier administrable détermine automatiquement le taux applicable.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <label htmlFor="special-date" className="mb-2 block text-sm font-medium">Date de la vacation</label>
          <input id="special-date" type="date" value={date} onChange={event => setDate(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" required />
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
            {loadingCalendar ? 'Chargement du calendrier…' : isSpecialDate ? (
              <p className="font-medium text-emerald-500">{calculation.dayLabel} · majoration {Math.round(calculation.multiplier * 100)} %</p>
            ) : (
              <p className="text-amber-600">Cette date n’est ni un dimanche ni un jour férié enregistré. Le paiement spécial ne peut pas être validé.</p>
            )}
            {calculation.dayKind === 'public_holiday' && new Date(date + 'T12:00:00').getDay() === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Jour férié prioritaire : 150 % appliqué une seule fois, sans cumul avec les 140 % du dimanche.</p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <div>
            <h2 className="font-semibold">Type de vacation</h2>
            <p className="text-sm text-muted-foreground">La ration est ajoutée à toute vacation ; le panier est réservé aux vacations de nuit.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShiftType('day')}
              className={`rounded-xl border p-3 text-sm font-semibold transition-colors ${shiftType === 'day' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
              <Sun className="mx-auto mb-1 h-5 w-5" /> Journée
            </button>
            <button type="button" onClick={() => setShiftType('night')}
              className={`rounded-xl border p-3 text-sm font-semibold transition-colors ${shiftType === 'night' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
              <Moon className="mx-auto mb-1 h-5 w-5" /> Nuit
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="start-time" className="text-sm font-medium">Heure de début</label>
              <input id="start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="end-time" className="text-sm font-medium">Heure de fin</label>
              <input id="end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="break-minutes" className="text-sm font-medium">Pause (minutes)</label>
              <input id="break-minutes" type="number" min="0" max="1440" value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3" />
            </div>
            <div className="space-y-2">
              <label htmlFor="hourly-rate" className="text-sm font-medium">Taux horaire (FCFA)</label>
              <input id="hourly-rate" type="number" min="1" step="1" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3" required />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6">
          <p className="text-sm font-medium text-muted-foreground">Détail du paiement cash</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-400 sm:text-4xl">{formatFCFA(calculation.amount)}</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><span>Heures payées ({calculation.workedHours.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h × {Math.round(calculation.multiplier * 100)} %)</span><strong>{formatFCFA(calculation.hourlyWage)}</strong></div>
            <div className="flex justify-between gap-3"><span>Ration</span><strong>{formatFCFA(calculation.ration)}</strong></div>
            {shiftType === 'night' && <div className="flex justify-between gap-3"><span>Panier de nuit</span><strong>{formatFCFA(calculation.nightBasket)}</strong></div>}
            <div className="border-t border-emerald-500/20 pt-2 text-xs text-muted-foreground">{calculation.workedMinutes} minutes nettes · aucune retenue mensuelle appliquée</div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
        {success && <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-500"><CheckCircle2 className="h-5 w-5 shrink-0" />{success}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={!canSave}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enregistrement…</> : 'Enregistrer le paiement cash'}
        </Button>
      </form>
    </div>
  );
}

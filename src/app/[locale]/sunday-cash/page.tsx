'use client';

import React, { useMemo, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { CalendarDays, Clock3, Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { calculateSundayCashPayout } from '@/lib/payroll-calculations';

function getNextSundayDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function isSundayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getDay() === 0;
}

const formatFCFA = (amount: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount) + ' FCFA';

export default function SundayCashPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [date, setDate] = useState(getNextSundayDate);
  const [mode, setMode] = useState<'hourly' | 'flat'>('hourly');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [breakMinutes, setBreakMinutes] = useState('60');
  const [hourlyRate, setHourlyRate] = useState('1500');
  const [flatAmount, setFlatAmount] = useState('10000');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const calculation = useMemo(() => calculateSundayCashPayout({
    mode, startTime, endTime,
    breakMinutes: Number(breakMinutes) || 0,
    hourlyRate: Number(hourlyRate) || 0,
    flatAmount: Number(flatAmount) || 0,
  }), [mode, startTime, endTime, breakMinutes, hourlyRate, flatAmount]);

  const validAmount = Number.isFinite(calculation.amount) && calculation.amount > 0;
  const canSave = Boolean(user && isSundayDate(date) && validAmount && !saving);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!user) return setError('Connectez-vous pour enregistrer ce paiement.');
    if (!isSundayDate(date)) return setError('La date sélectionnée doit être un dimanche.');
    if (!validAmount) return setError('Le montant calculé doit être supérieur à 0 FCFA.');

    setSaving(true);
    try {
      await addDoc(collection(firestore, 'sunday_cash_payouts'), {
        userId: user.uid,
        employeeName: user.displayName || user.email || 'Employé',
        date, mode,
        ...(mode === 'hourly' ? {
          startTime, endTime,
          breakMinutes: Math.max(0, Math.min(1440, Number(breakMinutes) || 0)),
          hourlyRate: Math.max(0, Number(hourlyRate) || 0),
        } : { flatAmount: Math.max(0, Number(flatAmount) || 0) }),
        workedMinutes: calculation.workedMinutes,
        workedHours: calculation.workedHours,
        amount: calculation.amount,
        currency: 'XAF',
        status: 'recorded',
        createdAt: serverTimestamp(),
      });
      setSuccess('Le paiement du dimanche a été enregistré séparément du bulletin mensuel.');
    } catch (saveError) {
      console.error('Sunday cash payout save failed:', saveError);
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
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pointage Dimanche &amp; Paiement Cash</h1>
        <p className="text-sm text-muted-foreground">
          Enregistrez les vacations du dimanche et calculez leur paiement immédiat.
          Ces montants restent indépendants du bulletin de paie mensuel.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <label htmlFor="sunday-date" className="mb-2 block text-sm font-medium">Date de la vacation</label>
          <input id="sunday-date" type="date" value={date} onChange={event => setDate(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" required />
          {date && !isSundayDate(date) && <p className="mt-2 text-sm text-red-500">Choisissez obligatoirement un dimanche.</p>}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
          <div>
            <h2 className="font-semibold">Mode de calcul</h2>
            <p className="text-sm text-muted-foreground">Choisissez le calcul à appliquer à cette vacation.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('hourly')}
              className={\`rounded-xl border p-3 text-sm font-semibold transition-colors \${mode === 'hourly' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}\`}>
              <Clock3 className="mx-auto mb-1 h-5 w-5" /> À l'heure
            </button>
            <button type="button" onClick={() => setMode('flat')}
              className={\`rounded-xl border p-3 text-sm font-semibold transition-colors \${mode === 'flat' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}\`}>
              <Wallet className="mx-auto mb-1 h-5 w-5" /> Forfait fixe
            </button>
          </div>

          {mode === 'hourly' ? (
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
                <label htmlFor="hourly-rate" className="text-sm font-medium">Tarif horaire (FCFA)</label>
                <input id="hourly-rate" type="number" min="1" step="1" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3" required />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="flat-amount" className="text-sm font-medium">Montant forfaitaire (FCFA)</label>
              <input id="flat-amount" type="number" min="1" step="1" value={flatAmount} onChange={e => setFlatAmount(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3" required />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 sm:p-6">
          <p className="text-sm font-medium text-muted-foreground">Montant cash calculé</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-400 sm:text-4xl">{formatFCFA(calculation.amount)}</p>
          {mode === 'hourly' && <p className="mt-2 text-sm text-muted-foreground">
            {calculation.workedHours.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} heure(s) payée(s) · {calculation.workedMinutes} minute(s)
          </p>}
          <p className="mt-3 text-xs text-muted-foreground">Aucune retenue de paie mensuelle n'est appliquée à ce paiement cash.</p>
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

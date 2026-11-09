export interface PublicHolidayRecord {
  id: string;
  date: string;
  year: number;
  label: string;
  category: 'civil' | 'religious' | 'exceptional';
  source?: string;
  seeded?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SpecialDayKind = 'ordinary' | 'sunday' | 'public_holiday';

export interface SpecialDayRate {
  kind: SpecialDayKind;
  multiplier: 1 | 1.4 | 1.5;
  label: string;
}

/** Gregorian Easter Sunday (Meeus/Jones/Butcher algorithm). */
export function getEasterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatDateUTC(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateUTC(date: Date): string {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateUTC(value);
}

/**
 * Preloads statutory fixed dates and computable movable dates under Law 73/5.
 * Eid dates are deliberately administered from the official annual announcement:
 * they depend on moon sighting and must not be guessed by a Gregorian formula.
 */
export function getCameroonHolidaySeeds(year: number): Omit<PublicHolidayRecord, 'id'>[] {
  const fixed = [
    ['01-01', "Jour de l'An", 'civil'],
    ['02-11', 'Fête de la Jeunesse', 'civil'],
    ['05-01', 'Fête du Travail', 'civil'],
    ['05-20', 'Fête Nationale', 'civil'],
    ['08-15', 'Assomption', 'religious'],
    ['12-25', 'Noël', 'religious'],
  ] as const;

  const easter = getEasterSunday(year);
  const movable = [
    { date: addUtcDays(easter, -2), label: 'Vendredi Saint', category: 'religious' as const },
    { date: addUtcDays(easter, 39), label: 'Ascension', category: 'religious' as const },
    // 2026 dates were announced by the Cameroon National Crescent Commission.
    ...(year === 2026 ? [
      { date: '2026-03-20', label: 'Djouldé Soumaé (fin du Ramadan)', category: 'religious' as const },
      { date: '2026-05-27', label: 'Djouldé Laïhadji (Tabaski)', category: 'religious' as const },
    ] : []),
  ];

  const records = [
    ...fixed.map(([monthDay, label, category]) => ({
      date: `${year}-${monthDay}`, year, label, category,
      source: 'Loi n°73/5 du 7 décembre 1973', seeded: true,
    })),
    ...movable.map((item) => ({
      ...item, year, source: 'Loi n°73/5 du 7 décembre 1973 (date mobile calculée depuis Pâques)', seeded: true,
    })),
  ];

  // Under Article 2, the following day is assimilated when a civil holiday falls on Sunday.
  for (const record of [...records]) {
    if (record.category !== 'civil') continue;
    const [y, m, d] = record.date.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) {
      const observedDate = addUtcDays(record.date, 1);
      if (!records.some((item) => item.date === observedDate)) {
        records.push({
          date: observedDate, year, label: `Jour assimilé après ${record.label}`,
          category: 'civil', source: 'Article 2 de la loi n°73/5', seeded: true,
        });
      }
    }
  }

  return records;
}

/** A public holiday has priority over Sunday, so the multiplier is never compounded. */
export function getSpecialDayRate(
  date: string,
  holidays: Pick<PublicHolidayRecord, 'date' | 'label'>[]
): SpecialDayRate {
  const holiday = holidays.find((item) => item.date === date);
  if (holiday) return { kind: 'public_holiday', multiplier: 1.5, label: holiday.label };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { kind: 'ordinary', multiplier: 1, label: 'Date invalide' };
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const valid = parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  if (!valid) return { kind: 'ordinary', multiplier: 1, label: 'Date invalide' };
  if (parsed.getUTCDay() === 0) return { kind: 'sunday', multiplier: 1.4, label: 'Dimanche' };
  return { kind: 'ordinary', multiplier: 1, label: 'Jour ordinaire' };
}

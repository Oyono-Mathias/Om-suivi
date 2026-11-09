import { format, parseISO } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

export type DateValue = string | Date | Timestamp;

export function toDate(value: DateValue): Date {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return parseISO(value);
}

export function toDateInput(value?: DateValue | null): string {
  return value ? format(toDate(value), 'yyyy-MM-dd') : '';
}

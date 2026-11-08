export const SHIFT_END_TIMES: Record<string, string> = {
  morningA: "14:15",
  morningB: "16:15",
  afternoon: "22:15",
  night: "06:15",
};

export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== "string" || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    return null;
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function localDateTimeToUtcMillis(dateValue: string, timeValue: string): number {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  // Africa/Douala is UTC+1.
  return Date.UTC(year, month - 1, day, hours - 1, minutes);
}

export function addLocalDay(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function getDoualaDateAndTime(value: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Douala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export function calculateTrustedDurations(
  entry: Record<string, unknown>,
  endDate: string,
  endTime: string,
  breakDurationMinutes: number,
  eligibleForOvertime: boolean
): { duration: number; overtimeDuration: number } | null {
  const startMinutes = parseClockMinutes(entry.startTime);
  const endMinutes = parseClockMinutes(endTime);
  const date = typeof entry.date === "string" ? entry.date : "";
  const shiftId = typeof entry.shiftId === "string" ? entry.shiftId : "";
  const scheduledEndTime = SHIFT_END_TIMES[shiftId];
  const scheduledEndMinutes = parseClockMinutes(scheduledEndTime);
  if (!date || startMinutes === null || endMinutes === null || scheduledEndMinutes === null) {
    return null;
  }

  const startTime = String(entry.startTime);
  const startUtc = localDateTimeToUtcMillis(date, startTime);
  const endUtc = localDateTimeToUtcMillis(endDate, endTime);
  const totalDuration = Math.floor((endUtc - startUtc) / 60_000);
  if (totalDuration <= 0 || totalDuration > 24 * 60) return null;

  let scheduledEndUtc = localDateTimeToUtcMillis(date, scheduledEndTime);
  if (scheduledEndUtc <= startUtc) scheduledEndUtc += 24 * 60 * 60 * 1000;

  const safeBreak = Math.min(
    totalDuration,
    Math.max(0, Number.isFinite(breakDurationMinutes) ? breakDurationMinutes : 0)
  );
  const duration = Math.max(0, totalDuration > 6 * 60 ? totalDuration - safeBreak : totalDuration);
  const rawOvertime = eligibleForOvertime && endUtc > scheduledEndUtc
    ? Math.floor((endUtc - scheduledEndUtc) / 60_000)
    : 0;

  return {
    duration,
    overtimeDuration: Math.min(duration, Math.max(0, rawOvertime)),
  };
}

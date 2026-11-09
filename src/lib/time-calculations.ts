export interface ShiftDurationInput {
  startDate: string;
  startTime: string;
  endTime: Date;
  scheduledEndTime: string;
  breakDurationMinutes?: number;
  eligibleForOvertime: boolean;
}

export interface ShiftDurationResult {
  startDateTime: Date;
  totalDuration: number;
  payableDuration: number;
  overtimeDuration: number;
}

/**
 * Calculates a shift against its scheduled end on the correct calendar day.
 * If the scheduled end clock time is at or before the start, it belongs to
 * the following day (for example, a 22:00–06:15 night shift).
 */
export function calculateShiftDurations(input: ShiftDurationInput): ShiftDurationResult {
  const startDateTime = new Date(`${input.startDate}T${input.startTime}:00`);
  const scheduledEndDateTime = new Date(`${input.startDate}T${input.scheduledEndTime}:00`);

  if (scheduledEndDateTime <= startDateTime) {
    scheduledEndDateTime.setDate(scheduledEndDateTime.getDate() + 1);
  }

  const totalDuration = Math.trunc(
    (input.endTime.getTime() - startDateTime.getTime()) / 60_000
  );
  const breakDuration = Math.max(0, input.breakDurationMinutes ?? 0);
  const payableDuration = Math.max(
    0,
    totalDuration > 6 * 60 ? totalDuration - breakDuration : totalDuration
  );
  const overtimeDuration = input.eligibleForOvertime && input.endTime > scheduledEndDateTime
    ? Math.max(0, Math.trunc((input.endTime.getTime() - scheduledEndDateTime.getTime()) / 60_000))
    : 0;

  return {
    startDateTime,
    totalDuration,
    payableDuration,
    overtimeDuration,
  };
}

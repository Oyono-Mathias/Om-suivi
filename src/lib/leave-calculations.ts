/**
 * Adds working days while excluding Saturday and Sunday.
 * The supplied start date is day zero, matching the leave document calculation.
 */
export function addWorkingDays(startDate: Date, daysToAdd: number): Date {
  const currentDate = new Date(startDate);
  const targetDays = Math.max(0, Math.floor(daysToAdd));
  let daysAdded = 0;

  while (daysAdded < targetDays) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded += 1;
    }
  }

  return currentDate;
}

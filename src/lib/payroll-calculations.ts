/**
 * Counts unique payroll days covered by a worked time entry or approved sick leave.
 * A date present in both sets must only count once.
 */
export function countCoveredWorkDays(
  workedDates: Iterable<string>,
  sickLeaveDates: Iterable<string>
): number {
  return new Set([...workedDates, ...sickLeaveDates]).size;
}

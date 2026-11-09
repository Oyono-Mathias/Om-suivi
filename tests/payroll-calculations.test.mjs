import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import vm from 'node:vm';

const helperPath = fileURLToPath(new URL('../src/lib/payroll-calculations.ts', import.meta.url));
const source = readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { countCoveredWorkDays, calculateCameroonPayrollDeductions, calculatePayrollProration, countNightShifts, calculateNightBasketAllowance, calculateSeniorityBonus, calculateConditionalMonthlyBonus, calculateTransportAllowance, countUnjustifiedAbsences, isRegularPayrollWorkDate, calculateSundayCashPayout, calculateSpecialDayCashPayout, FULL_MONTH_SIMULATION_REFERENCE } = module.exports;

test('a date with both a time entry and sick leave counts once', () => {
  assert.equal(
    countCoveredWorkDays(
      new Set(['2026-11-02', '2026-11-03']),
      new Set(['2026-11-03', '2026-11-04'])
    ),
    3
  );
});

test('worked days and sick leave days are both included when distinct', () => {
  assert.equal(
    countCoveredWorkDays(['2026-11-02', '2026-11-03'], ['2026-11-04']),
    3
  );
});

test('empty attendance data produces zero covered days', () => {
  assert.equal(countCoveredWorkDays([], []), 0);
});

test('Cameroon payroll statutory deductions respect the 62,000 FCFA threshold', () => {
  const result = calculateCameroonPayrollDeductions({
    grossSalary: 62000,
    baseSalary: 62000,
    transportAllowance: 0,
    cnpsBase: 62000,
  });
  assert.deepEqual(
    { cnps: result.cnps, cfc: result.cfc, irpp: result.irpp, cac: result.cac, crtv: result.crtv, tdl: result.tdl },
    { cnps: 2604, cfc: 620, irpp: 0, cac: 0, crtv: 750, tdl: 250 }
  );
});

test('Cameroon payroll deductions apply the CNPS ceiling and separate CFC from CAC', () => {
  const result = calculateCameroonPayrollDeductions({
    grossSalary: 900000,
    baseSalary: 900000,
    transportAllowance: 0,
    cnpsBase: 900000,
  });
  assert.equal(result.cnps, 31500);
  assert.equal(result.cfc, 9000);
  assert.ok(result.irpp > 0);
  assert.equal(result.cac, Math.round(result.irpp * 0.1));
  assert.equal(result.crtv, 11050);
  assert.equal(result.tdl, 2500);
  assert.equal(result.total, result.cnps + result.cfc + result.irpp + result.cac + result.crtv + result.tdl);
});

test('invalid negative payroll inputs are clamped to zero', () => {
  const result = calculateCameroonPayrollDeductions({
    grossSalary: -500,
    baseSalary: -100,
    transportAllowance: -20,
  });
  assert.equal(result.total, 0);
});

test('CNPS PVID remains due below the tax withholding threshold', () => {
  const result = calculateCameroonPayrollDeductions({
    grossSalary: 50000,
    baseSalary: 50000,
    cnpsBase: 50000,
  });
  assert.equal(result.cnps, 2100);
  assert.equal(result.cfc, 0);
  assert.equal(result.irpp, 0);
  assert.equal(result.cac, 0);
  assert.equal(result.crtv, 0);
  assert.equal(result.tdl, 0);
});


test('monthly fixed amounts are prorated over a 30-day payroll basis', () => {
  assert.equal(calculatePayrollProration(200000, 10), 66667);
  assert.equal(calculatePayrollProration(30000, 10), 10000);
});

test('payroll proration is bounded between zero and the monthly amount', () => {
  assert.equal(calculatePayrollProration(200000, 0), 0);
  assert.equal(calculatePayrollProration(200000, 45), 200000);
  assert.equal(calculatePayrollProration(-200000, 10), 0);
});


test('night basket counts each completed night vacation once, including early-morning shifts', () => {
  const shifts = [
    { id: 'night', startTime: '22:00', endTime: '06:00' },
    { id: 'early', startTime: '03:00', endTime: '10:00' },
    { id: 'day', startTime: '08:00', endTime: '16:00' },
  ];
  assert.equal(countNightShifts([
    { shiftId: 'night' }, { shiftId: 'early' }, { shiftId: 'day' },
  ], shifts), 2);
  assert.equal(calculateNightBasketAllowance(2), 2780);
});

test('seniority uses completed years at 2 percent per year', () => {
  const result = calculateSeniorityBonus(71362.5, '2018-11-01T00:00:00.000Z', new Date('2026-11-09T12:00:00.000Z'));
  assert.equal(result.completedYears, 8);
  assert.equal(result.amount, 11418);
});

test('attendance and performance bonuses are zero after an unexcused absence', () => {
  assert.equal(calculateConditionalMonthlyBonus(3000, 30, true), 0);
  assert.equal(calculateConditionalMonthlyBonus(4000, 30, false), 4000);
});

test('transport is strictly proportional to actual worked days', () => {
  assert.equal(calculateTransportAllowance(1000, 10), 10000);
});


test('only explicit unexcused absences without admin approval disable bonuses', () => {
  assert.equal(countUnjustifiedAbsences([
    { status: 'unjustified_absence' },
    { status: 'unjustified_absence', adminJustified: true },
    { status: 'sick_leave' },
    { status: 'paid_leave' },
  ]), 1);
});


test('Sunday dates are excluded from regular monthly payroll but Monday through Saturday remain eligible', () => {
  assert.equal(isRegularPayrollWorkDate('2026-11-08'), false); // Sunday
  assert.equal(isRegularPayrollWorkDate('2026-11-09'), true);  // Monday
  assert.equal(isRegularPayrollWorkDate('2026-11-14'), true);  // Saturday
  assert.equal(isRegularPayrollWorkDate('invalid-date'), false);
});

test('Sunday hourly cash is calculated from actual duration, less break time', () => {
  const result = calculateSundayCashPayout({
    mode: 'hourly',
    startTime: '08:00',
    endTime: '16:00',
    breakMinutes: 60,
    hourlyRate: 1500,
  });
  assert.deepEqual(result, { workedMinutes: 420, workedHours: 7, amount: 10500 });
});

test('Sunday overnight cash shift and flat forfait are calculated independently', () => {
  const overnight = calculateSundayCashPayout({
    mode: 'hourly',
    startTime: '22:00',
    endTime: '06:00',
    hourlyRate: 1250,
  });
  assert.equal(overnight.workedMinutes, 480);
  assert.equal(overnight.amount, 10000);
  assert.equal(calculateSundayCashPayout({ mode: 'flat', flatAmount: 12000 }).amount, 12000);
});


test('Prima Dee-Lite full-month simulation uses the exact reference amounts and a separate overtime fixture', () => {
  assert.equal(FULL_MONTH_SIMULATION_REFERENCE.baseSalary, 72799);
  assert.equal(FULL_MONTH_SIMULATION_REFERENCE.seniorityYears, 8);
  assert.equal(FULL_MONTH_SIMULATION_REFERENCE.seniorityBonus, 11418);
  assert.equal(FULL_MONTH_SIMULATION_REFERENCE.housingMonthly, 7280);
  assert.equal(FULL_MONTH_SIMULATION_REFERENCE.transportMonthly, 18325);

  const hourlyRate = Math.round(FULL_MONTH_SIMULATION_REFERENCE.baseSalary / 173.33);
  const overtime = FULL_MONTH_SIMULATION_REFERENCE.overtimeHours;
  const overtimeGross = Math.round(
    overtime.tier1 * hourlyRate * 1.2 +
    overtime.tier2 * hourlyRate * 1.3 +
    overtime.night * hourlyRate * 1.4 +
    overtime.holiday * hourlyRate * 1.5
  );
  const gross = FULL_MONTH_SIMULATION_REFERENCE.baseSalary +
    FULL_MONTH_SIMULATION_REFERENCE.seniorityBonus +
    FULL_MONTH_SIMULATION_REFERENCE.housingMonthly +
    FULL_MONTH_SIMULATION_REFERENCE.transportMonthly +
    3000 + 4000 + overtimeGross;
  assert.equal(gross, 178426);
});


test('Sunday special cash uses 140 percent plus ration for a day shift', () => {
  const result = calculateSpecialDayCashPayout({
    date: '2026-11-08',
    startTime: '08:00',
    endTime: '16:00',
    breakMinutes: 60,
    hourlyRate: 1500,
    shiftType: 'day',
    holidays: [],
  });
  assert.equal(result.dayKind, 'sunday');
  assert.equal(result.multiplier, 1.4);
  assert.equal(result.hourlyWage, 14700);
  assert.equal(result.ration, 1000);
  assert.equal(result.nightBasket, 0);
  assert.equal(result.amount, 15700);
});

test('a public holiday falling on Sunday takes 150 percent once, and night adds both primes', () => {
  const result = calculateSpecialDayCashPayout({
    date: '2026-11-08',
    startTime: '20:00',
    endTime: '04:00',
    breakMinutes: 0,
    hourlyRate: 1500,
    shiftType: 'night',
    holidays: [{ date: '2026-11-08', label: 'Fête exceptionnelle' }],
  });
  assert.equal(result.dayKind, 'public_holiday');
  assert.equal(result.multiplier, 1.5);
  assert.equal(result.hourlyWage, 18000);
  assert.equal(result.ration, 1000);
  assert.equal(result.nightBasket, 1390);
  assert.equal(result.amount, 20390);
});

test('a registered weekday holiday is paid at 150 percent and ordinary dates are not special', () => {
  const holiday = calculateSpecialDayCashPayout({
    date: '2026-11-09',
    startTime: '08:00',
    endTime: '12:00',
    hourlyRate: 1000,
    shiftType: 'day',
    holidays: [{ date: '2026-11-09', label: 'Jour férié ajouté' }],
  });
  assert.equal(holiday.multiplier, 1.5);
  assert.equal(holiday.amount, 7000);

  const ordinary = calculateSpecialDayCashPayout({
    date: '2026-11-10',
    startTime: '08:00',
    endTime: '12:00',
    hourlyRate: 1000,
    shiftType: 'day',
    holidays: [],
  });
  assert.equal(ordinary.dayKind, 'ordinary');
  assert.equal(ordinary.amount, 5000);
});

const holidaySource = readFileSync(fileURLToPath(new URL('../src/lib/public-holidays.ts', import.meta.url)), 'utf8');
const holidayCompiled = ts.transpileModule(holidaySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const holidayModule = { exports: {} };
vm.runInNewContext(holidayCompiled, { module: holidayModule, exports: holidayModule.exports });
const { getEasterSunday, getCameroonHolidaySeeds, getSpecialDayRate } = holidayModule.exports;

test('Cameroon holiday seed includes fixed dates and calculated movable Christian holidays', () => {
  assert.equal(getEasterSunday(2026), '2026-04-05');
  const dates = getCameroonHolidaySeeds(2026);
  assert.ok(dates.some((item) => item.date === '2026-01-01' && item.label === "Jour de l'An"));
  assert.ok(dates.some((item) => item.date === '2026-04-03' && item.label === 'Vendredi Saint'));
  assert.ok(dates.some((item) => item.date === '2026-05-14' && item.label === 'Ascension'));
  assert.ok(dates.some((item) => item.date === '2026-12-25' && item.label === 'Noël'));
});

test('holiday calendar rate takes priority over Sunday rate', () => {
  assert.deepEqual(
    getSpecialDayRate('2026-11-08', [{ date: '2026-11-08', label: 'Fête déclarée' }]),
    { kind: 'public_holiday', multiplier: 1.5, label: 'Fête déclarée' }
  );
  assert.deepEqual(
    getSpecialDayRate('2026-11-08', []),
    { kind: 'sunday', multiplier: 1.4, label: 'Dimanche' }
  );
});

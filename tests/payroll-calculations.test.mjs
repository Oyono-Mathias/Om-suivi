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
const { countCoveredWorkDays, calculateCameroonPayrollDeductions, calculatePayrollProration, countNightShifts, calculateNightBasketAllowance, calculateSeniorityBonus, calculateConditionalMonthlyBonus, calculateTransportAllowance } = module.exports;

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

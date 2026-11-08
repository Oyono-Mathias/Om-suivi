import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import vm from 'node:vm';

const helperPath = fileURLToPath(new URL('../src/lib/time-calculations.ts', import.meta.url));
const source = readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { calculateShiftDurations } = module.exports;

test('night shift calculates scheduled end on the following day', () => {
  const result = calculateShiftDurations({
    startDate: '2026-11-08',
    startTime: '22:00',
    endTime: new Date('2026-11-09T07:00:00'),
    scheduledEndTime: '06:15',
    eligibleForOvertime: true,
  });
  assert.equal(result.totalDuration, 540);
  assert.equal(result.overtimeDuration, 45);
});

test('night shift ending on schedule has no overtime', () => {
  const result = calculateShiftDurations({
    startDate: '2026-11-08',
    startTime: '22:00',
    endTime: new Date('2026-11-09T06:15:00'),
    scheduledEndTime: '06:15',
    eligibleForOvertime: true,
  });
  assert.equal(result.overtimeDuration, 0);
});

test('day shift overtime is measured from the same-day scheduled end', () => {
  const result = calculateShiftDurations({
    startDate: '2026-11-08',
    startTime: '06:00',
    endTime: new Date('2026-11-08T15:00:00'),
    scheduledEndTime: '14:15',
    eligibleForOvertime: true,
  });
  assert.equal(result.overtimeDuration, 45);
});

test('break is deducted only after six hours and payable duration cannot be negative', () => {
  const overSixHours = calculateShiftDurations({
    startDate: '2026-11-08',
    startTime: '08:00',
    endTime: new Date('2026-11-08T16:15:00'),
    scheduledEndTime: '16:15',
    breakDurationMinutes: 60,
    eligibleForOvertime: false,
  });
  assert.equal(overSixHours.payableDuration, 375);

  const shortShift = calculateShiftDurations({
    startDate: '2026-11-08',
    startTime: '08:00',
    endTime: new Date('2026-11-08T12:00:00'),
    scheduledEndTime: '16:15',
    breakDurationMinutes: 60,
    eligibleForOvertime: false,
  });
  assert.equal(shortShift.payableDuration, 240);
});

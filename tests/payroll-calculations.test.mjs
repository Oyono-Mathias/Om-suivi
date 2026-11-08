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
const { countCoveredWorkDays } = module.exports;

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

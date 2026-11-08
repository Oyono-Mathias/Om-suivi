import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import vm from 'node:vm';

const helperPath = fileURLToPath(new URL('../src/lib/leave-calculations.ts', import.meta.url));
const source = readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { addWorkingDays } = module.exports;

test('one working day after Friday resumes on Monday', () => {
  const result = addWorkingDays(new Date(2026, 10, 6), 1);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 10);
  assert.equal(result.getDate(), 9);
});

test('five working days after Friday resumes the following Friday', () => {
  const result = addWorkingDays(new Date(2026, 10, 6), 5);
  assert.equal(result.getDate(), 13);
});

test('zero or negative days do not move the date', () => {
  const start = new Date(2026, 10, 6);
  assert.equal(addWorkingDays(start, 0).getDate(), 6);
  assert.equal(addWorkingDays(start, -2).getDate(), 6);
});

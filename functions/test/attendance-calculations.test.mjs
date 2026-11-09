import test from "node:test";
import assert from "node:assert/strict";
import attendance from "../lib/attendance-calculations.js";

const {
  addLocalDay,
  calculateTrustedDurations,
  getDoualaDateAndTime,
  parseClockMinutes,
} = attendance;

test("calculates day shift payable minutes and overtime from server time", () => {
  const result = calculateTrustedDurations(
    { date: "2026-11-08", startTime: "08:00", shiftId: "morningB" },
    "2026-11-08",
    "17:00",
    30,
    true,
  );

  assert.deepEqual(result, { duration: 510, overtimeDuration: 45 });
});

test("calculates overnight shift durations across midnight", () => {
  const result = calculateTrustedDurations(
    { date: "2026-11-08", startTime: "22:00", shiftId: "night" },
    "2026-11-09",
    "06:30",
    30,
    true,
  );

  assert.deepEqual(result, { duration: 480, overtimeDuration: 15 });
});

test("does not award overtime to professions that are not eligible", () => {
  const result = calculateTrustedDurations(
    { date: "2026-11-08", startTime: "08:00", shiftId: "morningB" },
    "2026-11-08",
    "17:00",
    30,
    false,
  );

  assert.deepEqual(result, { duration: 510, overtimeDuration: 0 });
});

test("rejects invalid shifts, invalid times and entries longer than 24 hours", () => {
  assert.equal(calculateTrustedDurations(
    { date: "2026-11-08", startTime: "08:00", shiftId: "unknown" },
    "2026-11-08",
    "17:00",
    30,
    true,
  ), null);
  assert.equal(calculateTrustedDurations(
    { date: "2026-11-08", startTime: "25:00", shiftId: "morningB" },
    "2026-11-08",
    "17:00",
    30,
    true,
  ), null);
  assert.equal(calculateTrustedDurations(
    { date: "2026-11-08", startTime: "08:00", shiftId: "morningB" },
    "2026-11-09",
    "09:00",
    30,
    true,
  ), null);
});

test("uses the Africa/Douala clock and advances overnight dates", () => {
  assert.deepEqual(
    getDoualaDateAndTime(new Date("2026-11-08T15:00:00.000Z")),
    { date: "2026-11-08", time: "16:00" },
  );
  assert.equal(addLocalDay("2026-11-08"), "2026-11-09");
  assert.equal(parseClockMinutes("06:15"), 375);
  assert.equal(parseClockMinutes("25:00"), null);
});

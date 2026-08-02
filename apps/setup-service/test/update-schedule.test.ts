import assert from "node:assert/strict";
import { test } from "bun:test";

import { scheduleAutomaticSweeps } from "../src/update-schedule.js";

interface RecordedTimer {
  callback: () => void;
  ms: number;
  unreferenced: boolean;
}

function recorder() {
  const timeouts: RecordedTimer[] = [];
  const intervals: RecordedTimer[] = [];
  const record = (into: RecordedTimer[]) =>
    (callback: () => void, ms: number) => {
      const entry: RecordedTimer = { callback, ms, unreferenced: false };
      into.push(entry);
      return {
        unref: () => {
          entry.unreferenced = true;
        },
      };
    };
  return {
    timeouts,
    intervals,
    setTimeout: record(timeouts),
    setInterval: record(intervals),
  };
}

test("sweeps shortly after start-up rather than only after an interval", () => {
  const timers = recorder();
  let sweeps = 0;

  scheduleAutomaticSweeps({
    run: () => {
      sweeps += 1;
    },
    intervalMs: 3_600_000,
    startDelayMs: 30_000,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
  });

  assert.equal(timers.timeouts.length, 1, "one early sweep is scheduled");
  assert.equal(timers.timeouts[0]!.ms, 30_000);
  assert.equal(timers.intervals.length, 1);
  assert.equal(timers.intervals[0]!.ms, 3_600_000);

  // Without the early one, a deploy would push the first sweep a whole hour
  // out, and a service deployed hourly would never sweep at all.
  assert.equal(sweeps, 0, "nothing runs before its timer fires");
  timers.timeouts[0]!.callback();
  assert.equal(sweeps, 1);
  timers.intervals[0]!.callback();
  assert.equal(sweeps, 2);
});

test("lets neither timer keep the process alive", () => {
  const timers = recorder();

  scheduleAutomaticSweeps({
    run: () => undefined,
    intervalMs: 3_600_000,
    startDelayMs: 30_000,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
  });

  assert.equal(timers.timeouts[0]!.unreferenced, true);
  assert.equal(timers.intervals[0]!.unreferenced, true);
});

test("schedules nothing at all when sweeping is turned off", () => {
  const timers = recorder();

  scheduleAutomaticSweeps({
    run: () => undefined,
    intervalMs: 0,
    startDelayMs: 30_000,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
  });

  assert.deepEqual(timers.timeouts, []);
  assert.deepEqual(timers.intervals, []);
});

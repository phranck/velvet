import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  responseAxisStep,
  responseScaleTicks,
} from "../src/response-chart/arithmetic.js";

/**
 * The printed scale is the one part of a chart that claims something about
 * time without writing a figure. A mark every eight units of the drawing says
 * nothing, and a mark every day over a window of days says a great deal, so
 * what is checked here is that each mark stands for a length of time the
 * window is actually made of.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-03-22T15:35:00.000Z");

/** A window ending now and reaching back by the given number of milliseconds. */
function windowOf(span: number): { start: number; end: number } {
  return { start: NOW - span, end: NOW };
}

test("a window of days is divided into days", () => {
  const ticks = responseScaleTicks(windowOf(30 * DAY));
  assert.equal(ticks.length, 31);
  assert.equal(ticks.filter(({ major }) => major).length, 7);
  for (let index = 1; index < ticks.length; index += 1) {
    assert.equal(ticks[index]!.at - ticks[index - 1]!.at, DAY);
  }
});

test("a window of one day is divided into hours", () => {
  const ticks = responseScaleTicks(windowOf(DAY));
  assert.equal(ticks.length, 25);
  assert.equal(ticks[1]!.at - ticks[0]!.at, HOUR);
});

test("a window of a year is divided into weeks", () => {
  const ticks = responseScaleTicks(windowOf(365 * DAY));
  assert.equal(ticks[1]!.at - ticks[0]!.at, 7 * DAY);
  assert.equal(ticks.length, 53);
});

/**
 * An installation reports on itself from its first hours, and a range covering
 * everything it has measured is those hours until it is more. A scale that
 * only knew named ranges would have nothing to draw here.
 */
test("a window of hours still carries a scale", () => {
  const ticks = responseScaleTicks(windowOf(6 * HOUR));
  assert.equal(ticks.length, 7);
  assert.equal(ticks[1]!.at - ticks[0]!.at, HOUR);
});

test("the last mark stands at the end of the window, and is a long one", () => {
  for (const span of [6 * HOUR, DAY, 7 * DAY, 30 * DAY, 90 * DAY, 365 * DAY]) {
    const ticks = responseScaleTicks(windowOf(span));
    assert.equal(ticks.at(-1)!.at, NOW, `span ${span}`);
    assert.equal(ticks.at(-1)!.major, true, `span ${span}`);
  }
});

/**
 * The ceiling is what stops the scale becoming a band. Checked across every
 * length between an hour and a decade rather than at the five the product
 * offers today, because the range a page may show is about to stop being one
 * of a fixed set.
 */
test("no window crowds the scale past sixty marks", () => {
  for (let hours = 1; hours <= 10 * 365 * 24; hours += 7) {
    const ticks = responseScaleTicks(windowOf(hours * HOUR));
    assert.ok(
      ticks.length <= 61,
      `${hours} hours produced ${ticks.length} marks`,
    );
  }
});

test("a window with no length carries no scale", () => {
  assert.deepEqual(responseScaleTicks({ start: NOW, end: NOW }), []);
  assert.deepEqual(responseScaleTicks({ start: NOW, end: NOW - DAY }), []);
});

/**
 * The value axis is read by the figure beside each line, and a reader compares
 * one service against the next by those figures. What is checked here is that
 * they stay figures anybody reads at a glance, whatever the readings are, and
 * that the axis still holds them without standing far above them.
 */

const ALLOWED_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Whether a step is one of the allowed figures times a power of ten. */
function isRoundFigure(step: number): boolean {
  const power = 10 ** Math.floor(Math.log10(step));
  return ALLOWED_MANTISSAS.some(
    (mantissa) => Math.abs(mantissa * power - step) < 1e-9,
  );
}

test("every step is a figure a reader takes at a glance", () => {
  for (let highest = 1; highest <= 20_000; highest += 1) {
    for (const steps of [2, 4, 6]) {
      const step = responseAxisStep(highest, steps);
      assert.ok(
        isRoundFigure(step),
        `${highest}ms over ${steps} steps produced ${step}`,
      );
    }
  }
});

test("the axis holds the readings without standing far above them", () => {
  for (let highest = 40; highest <= 20_000; highest += 1) {
    for (const steps of [2, 4, 6]) {
      const top = responseAxisStep(highest, steps) * steps;
      assert.ok(top >= highest, `${highest}ms over ${steps} steps topped at ${top}`);
      assert.ok(
        top <= highest * 1.5,
        `${highest}ms over ${steps} steps topped at ${top}`,
      );
    }
  }
});

test("a service answering in single milliseconds keeps a floor", () => {
  assert.equal(responseAxisStep(3, 4), 10);
  assert.equal(responseAxisStep(0, 4), 10);
});

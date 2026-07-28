import assert from "node:assert/strict";
import { test } from "bun:test";

interface FakeRuntime {
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}

function fixture() {
  let now = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const runtime: FakeRuntime = {
    now: () => now,
    requestFrame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
  };
  const scroller = {
    scrollTop: 500,
    scrollHeight: 4_762,
    clientHeight: 1_427,
  } as HTMLElement;

  function advance(time: number): void {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  }

  return { advance, frames, runtime, scroller };
}

test("uses the exact CSS ease-in-out curve", async () => {
  const motion = await import("../src/configurator/scroll-motion.js");

  assert.ok(Math.abs(motion.easeInOutProgress(0.25) - 0.1292) < 0.0002);
  assert.ok(Math.abs(motion.easeInOutProgress(0.5) - 0.5) < 0.0001);
  assert.ok(Math.abs(motion.easeInOutProgress(0.75) - 0.8708) < 0.0002);
});

test("moves a clamped sidebar offset with the disclosure timing", async () => {
  const motion = await import("../src/configurator/scroll-motion.js");
  const { advance, frames, runtime, scroller } = fixture();
  const controller = motion.createScrollCompensation(scroller, runtime);

  controller.compensate(3_335, false);
  assert.equal(frames.size, 1);

  advance(80);
  assert.equal(scroller.scrollTop, 250);
  advance(160);
  assert.equal(scroller.scrollTop, 0);
  assert.equal(frames.size, 0);
});

test("keeps the offset inside a scroll range that vanishes before motion ends", async () => {
  const motion = await import("../src/configurator/scroll-motion.js");
  const { advance, runtime, scroller } = fixture();
  const controller = motion.createScrollCompensation(scroller, runtime);

  controller.compensate(3_957, false);
  advance(80);
  assert.ok(Math.abs(scroller.scrollTop - 203.37) < 0.1);
  advance(120);
  assert.equal(scroller.scrollTop, 0);
});

test("does not move when the collapsed content still supports the offset", async () => {
  const motion = await import("../src/configurator/scroll-motion.js");
  const { frames, runtime, scroller } = fixture();
  const controller = motion.createScrollCompensation(scroller, runtime);

  controller.compensate(1_000, false);

  assert.equal(scroller.scrollTop, 500);
  assert.equal(frames.size, 0);
});

test("uses the final offset immediately for reduced motion", async () => {
  const motion = await import("../src/configurator/scroll-motion.js");
  const { frames, runtime, scroller } = fixture();
  const controller = motion.createScrollCompensation(scroller, runtime);

  controller.compensate(3_335, true);

  assert.equal(scroller.scrollTop, 0);
  assert.equal(frames.size, 0);
});

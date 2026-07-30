import assert from "node:assert/strict";
import { test } from "bun:test";

interface FakeAnimation extends Animation {
  cancelCalls: number;
  commitStylesCalls: number;
  finish(): void;
}

function fixture(open: boolean, naturalHeight = 120) {
  const values = new Map<string, string>();
  const details = { open } as HTMLDetailsElement;
  const animations: Array<{
    animation: FakeAnimation;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
  }> = [];
  const style = {
    get height() {
      return values.get("height") ?? "";
    },
    set height(value: string) {
      values.set("height", value);
    },
    get opacity() {
      return values.get("opacity") ?? "";
    },
    set opacity(value: string) {
      values.set("opacity", value);
    },
    get overflow() {
      return values.get("overflow") ?? "";
    },
    set overflow(value: string) {
      values.set("overflow", value);
    },
    removeProperty(property: string) {
      values.delete(property);
      return "";
    },
  } as CSSStyleDeclaration;
  const content = {
    style,
    scrollHeight: naturalHeight,
    getBoundingClientRect() {
      const inlineHeight = Number.parseFloat(style.height);
      return {
        height: Number.isFinite(inlineHeight)
          ? inlineHeight
          : details.open
            ? naturalHeight
            : 0,
      } as DOMRect;
    },
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
      let resolveFinished: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        resolveFinished = () => resolve();
      });
      const animation = {
        cancelCalls: 0,
        commitStylesCalls: 0,
        finished,
        cancel(this: FakeAnimation) {
          this.cancelCalls += 1;
        },
        commitStyles(this: FakeAnimation) {
          this.commitStylesCalls += 1;
          style.height = `${naturalHeight / 2}px`;
          style.opacity = "0.5";
        },
        finish() {
          resolveFinished();
        },
      } as unknown as FakeAnimation;
      animations.push({ animation, frames, options });
      return animation;
    },
  } as unknown as HTMLElement;

  return { animations, content, details, style };
}

test("keeps details open until concurrent height and opacity collapse finishes", async () => {
  const motion = await import("../src/lib/disclosure-motion.js");
  assert.equal(typeof motion.createDisclosureMotion, "function");

  const { animations, content, details } = fixture(true);
  const controller = motion.createDisclosureMotion(details, content);
  controller.setExpanded(false, false);

  assert.equal(details.open, true);
  assert.equal(animations.length, 1);
  assert.deepEqual(animations[0].frames, [
    { height: "120px", opacity: 1 },
    { height: "0px", opacity: 0 },
  ]);
  assert.equal(animations[0].options.duration, 160);
  assert.equal(animations[0].options.easing, "ease-in-out");
  assert.equal(content.style.overflow, "clip");

  animations[0].animation.finish();
  await animations[0].animation.finished;
  await Promise.resolve();
  assert.equal(details.open, false);
  assert.equal(content.style.overflow, "");
  assert.equal(animations[0].animation.cancelCalls, 1);
});

test("opens immediately and interrupts an active disclosure animation", async () => {
  const motion = await import("../src/lib/disclosure-motion.js");
  assert.equal(typeof motion.createDisclosureMotion, "function");

  const { animations, content, details } = fixture(true);
  const controller = motion.createDisclosureMotion(details, content);
  controller.setExpanded(false, false);
  const closing = animations[0].animation;

  controller.setExpanded(true, false);

  assert.equal(closing.commitStylesCalls, 1);
  assert.equal(closing.cancelCalls, 1);
  assert.equal(details.open, true);
  assert.deepEqual(animations[1].frames, [
    { height: "60px", opacity: 0.5 },
    { height: "120px", opacity: 1 },
  ]);
  assert.equal(content.style.overflow, "clip");
});

test("uses an immediate path for reduced motion", async () => {
  const motion = await import("../src/lib/disclosure-motion.js");
  assert.equal(typeof motion.createDisclosureMotion, "function");

  const { animations, content, details } = fixture(true);
  const controller = motion.createDisclosureMotion(details, content);
  controller.setExpanded(false, true);

  assert.equal(details.open, false);
  assert.equal(animations.length, 0);
  assert.equal(content.style.overflow, "");
});

test("drives a non-details disclosure through its hidden state", async () => {
  const motion = await import("../src/lib/disclosure-motion.js");
  const { createHiddenDisclosureMotion } = motion;
  assert.equal(typeof createHiddenDisclosureMotion, "function");

  const { animations, content, style } = fixture(false);
  content.hidden = true;
  content.getBoundingClientRect = () => {
    const inlineHeight = Number.parseFloat(style.height);
    return {
      height: Number.isFinite(inlineHeight)
        ? inlineHeight
        : content.hidden
          ? 0
          : content.scrollHeight,
    } as DOMRect;
  };

  const controller = createHiddenDisclosureMotion(content);
  controller.setExpanded(true, false);

  assert.equal(content.hidden, false);
  assert.deepEqual(animations[0]?.frames, [
    { height: "0px", opacity: 0 },
    { height: "120px", opacity: 1 },
  ]);
});

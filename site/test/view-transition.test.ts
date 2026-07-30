import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  createViewTransitionController,
  type ViewTransitionHandle,
} from "../src/lib/view-transition.js";

interface ControlledTransition extends ViewTransitionHandle {
  skipCalls: number;
  finish(): void;
}

function transitionFixture() {
  const transitions: ControlledTransition[] = [];
  const document = {
    startViewTransition(update: () => void | Promise<void>) {
      let finish: () => void = () => undefined;
      const transition = {
        skipCalls: 0,
        finished: new Promise<void>((resolve) => {
          finish = resolve;
        }),
        skipTransition() {
          this.skipCalls += 1;
          finish();
        },
        finish,
      } satisfies ControlledTransition;
      transitions.push(transition);
      void update();
      return transition;
    },
  };

  return { document, transitions };
}

test("runs state changes through one browser view transition", () => {
  const { document, transitions } = transitionFixture();
  const controller = createViewTransitionController(document);
  let updates = 0;

  controller.update(() => {
    updates += 1;
  });

  assert.equal(updates, 1);
  assert.equal(transitions.length, 1);
});

test("skips an active transition before starting the next state change", () => {
  const { document, transitions } = transitionFixture();
  const controller = createViewTransitionController(document);

  controller.update(() => undefined);
  controller.update(() => undefined);

  assert.equal(transitions.length, 2);
  assert.equal(transitions[0]?.skipCalls, 1);
});

test("updates immediately for reduced motion and unsupported browsers", () => {
  const supported = transitionFixture();
  const reducedController = createViewTransitionController(supported.document);
  let updates = 0;

  reducedController.update(() => {
    updates += 1;
  }, true);

  const unsupportedController = createViewTransitionController({});
  unsupportedController.update(() => {
    updates += 1;
  });

  assert.equal(updates, 2);
  assert.equal(supported.transitions.length, 0);
});

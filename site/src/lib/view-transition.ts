export interface ViewTransitionHandle {
  finished: Promise<unknown>;
  skipTransition(): void;
}

interface ViewTransitionDocument {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => ViewTransitionHandle;
}

export interface ViewTransitionController {
  update(update: () => void | Promise<void>, reducedMotion?: boolean): void;
  destroy(): void;
}

export function createViewTransitionController(
  target: ViewTransitionDocument,
): ViewTransitionController {
  let active: ViewTransitionHandle | null = null;

  function clearWhenFinished(candidate: ViewTransitionHandle): void {
    void candidate.finished.then(
      () => {
        if (active === candidate) active = null;
      },
      () => {
        if (active === candidate) active = null;
      },
    );
  }

  return {
    update(update, reducedMotion = false) {
      if (reducedMotion || !target.startViewTransition) {
        void update();
        return;
      }

      active?.skipTransition();
      const candidate = target.startViewTransition(update);
      active = candidate;
      clearWhenFinished(candidate);
    },
    destroy() {
      active?.skipTransition();
      active = null;
    },
  };
}

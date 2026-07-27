const SCROLL_MOTION_DURATION = 160;

export interface ScrollMotionRuntime {
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}

export interface ScrollCompensationController {
  compensate(collapsingHeight: number, reducedMotion?: boolean): void;
  cancel(): void;
  destroy(): void;
}

function cubicBezierCoordinate(
  progress: number,
  controlPoint1: number,
  controlPoint2: number,
): number {
  const inverse = 1 - progress;
  return (
    3 * inverse * inverse * progress * controlPoint1 +
    3 * inverse * progress * progress * controlPoint2 +
    progress * progress * progress
  );
}

export function easeInOutProgress(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  let lower = 0;
  let upper = 1;
  let curveProgress = progress;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const x = cubicBezierCoordinate(curveProgress, 0.42, 0.58);
    if (Math.abs(x - progress) < 0.000001) break;
    if (x < progress) lower = curveProgress;
    else upper = curveProgress;
    curveProgress = (lower + upper) / 2;
  }

  return cubicBezierCoordinate(curveProgress, 0, 1);
}

function browserRuntime(): ScrollMotionRuntime {
  return {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
  };
}

export function createScrollCompensation(
  scroller: HTMLElement,
  runtime: ScrollMotionRuntime = browserRuntime(),
): ScrollCompensationController {
  let frameId: number | null = null;

  function cancel(): void {
    if (frameId === null) return;
    runtime.cancelFrame(frameId);
    frameId = null;
  }

  function compensate(
    collapsingHeight: number,
    reducedMotion = false,
  ): void {
    cancel();

    const start = scroller.scrollTop;
    const initialMaxScroll = Math.max(
      0,
      scroller.scrollHeight - scroller.clientHeight,
    );
    const finalScrollHeight = Math.max(
      scroller.clientHeight,
      scroller.scrollHeight - Math.max(0, collapsingHeight),
    );
    const finalMaxScroll = Math.max(
      0,
      finalScrollHeight - scroller.clientHeight,
    );
    const target = Math.min(start, finalMaxScroll);
    if (target === start) return;

    if (reducedMotion) {
      scroller.scrollTop = target;
      return;
    }

    const startedAt = runtime.now();
    const move = (time: number) => {
      const linearProgress = Math.min(
        1,
        Math.max(0, (time - startedAt) / SCROLL_MOTION_DURATION),
      );
      const progress = easeInOutProgress(linearProgress);
      if (finalMaxScroll === 0 && initialMaxScroll > 0) {
        const currentMaxScroll = Math.max(
          0,
          initialMaxScroll - Math.max(0, collapsingHeight) * progress,
        );
        scroller.scrollTop = currentMaxScroll * (start / initialMaxScroll);
      } else {
        scroller.scrollTop = start + (target - start) * progress;
      }

      if (linearProgress >= 1) {
        frameId = null;
        return;
      }
      frameId = runtime.requestFrame(move);
    };

    frameId = runtime.requestFrame(move);
  }

  return {
    compensate,
    cancel,
    destroy: cancel,
  };
}

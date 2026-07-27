export const SECTION_MOTION_OPTIONS: KeyframeAnimationOptions = {
  duration: 160,
  easing: "ease-in-out",
  fill: "forwards",
};

export interface DisclosureMotionController {
  setExpanded(expanded: boolean, reducedMotion?: boolean): void;
  destroy(): void;
}

export function createDisclosureMotion(
  details: HTMLDetailsElement,
  content: HTMLElement,
): DisclosureMotionController {
  let animation: Animation | null = null;

  function interrupt(): void {
    if (!animation) return;
    try {
      animation.commitStyles();
    } catch {
      // Some browsers cannot commit an animation before its first frame.
    }
    animation.cancel();
    animation = null;
  }

  function clearSizeStyles(): void {
    content.style.removeProperty("height");
    content.style.removeProperty("opacity");
    content.style.removeProperty("overflow");
  }

  function currentOpacity(fallback: number): number {
    const value = Number.parseFloat(content.style.opacity);
    return Number.isFinite(value) ? value : fallback;
  }

  function finishWhenCurrent(
    candidate: Animation,
    callback: () => void,
  ): void {
    void candidate.finished.then(
      () => {
        if (animation !== candidate) return;
        animation = null;
        callback();
        candidate.cancel();
      },
      () => undefined,
    );
  }

  function setExpanded(expanded: boolean, reducedMotion = false): void {
    if (!animation && details.open === expanded) return;

    interrupt();
    content.style.overflow = "clip";

    if (expanded) {
      if (!details.open) {
        details.open = true;
        content.style.height = "0px";
        content.style.opacity = "0";
      }

      const startHeight = content.getBoundingClientRect().height;
      const startOpacity = currentOpacity(startHeight > 0 ? 1 : 0);
      const endHeight = content.scrollHeight;

      if (reducedMotion || endHeight === 0 || typeof content.animate !== "function") {
        clearSizeStyles();
        return;
      }

      const candidate = content.animate(
        [
          { height: `${startHeight}px`, opacity: startOpacity },
          { height: `${endHeight}px`, opacity: 1 },
        ],
        SECTION_MOTION_OPTIONS,
      );
      animation = candidate;
      finishWhenCurrent(candidate, clearSizeStyles);
      return;
    }

    const startHeight = content.getBoundingClientRect().height;
    const startOpacity = currentOpacity(1);
    content.style.height = `${startHeight}px`;
    content.style.opacity = `${startOpacity}`;

    if (reducedMotion || startHeight === 0 || typeof content.animate !== "function") {
      details.open = false;
      clearSizeStyles();
      return;
    }

    const candidate = content.animate(
      [
        { height: `${startHeight}px`, opacity: startOpacity },
        { height: "0px", opacity: 0 },
      ],
      SECTION_MOTION_OPTIONS,
    );
    animation = candidate;
    finishWhenCurrent(candidate, () => {
      details.open = false;
      clearSizeStyles();
    });
  }

  return {
    setExpanded,
    destroy() {
      if (!animation) return;
      animation.cancel();
      animation = null;
    },
  };
}

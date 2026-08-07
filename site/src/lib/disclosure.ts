/**
 * Opens and closes a panel by animating its own height.
 *
 * The panel is the only thing that changes size, so everything below it, the
 * rows after it, the card around it, and the footer under the card, is carried
 * along by ordinary layout rather than by anything this has to move itself.
 *
 * The animation is handed to the browser's animation timeline through the Web
 * Animations API, so no script runs whilst it plays. That distinction is what
 * makes a height animation affordable here: measured on a production build of
 * the status page in WebKit, expanding and collapsing six services produced two
 * frames longer than 32ms out of roughly 250, which is what the same page
 * produces with no animation at all.
 *
 * A closed panel carries `hidden`, so its contents cost no layout and stay out
 * of the tab order and the accessibility tree. `hidden` is applied only once a
 * collapse has finished, because an element removed from the layout cannot be
 * animated out of it.
 */

/** How long a panel takes to open or close, read from the stylesheet. */
const DURATION_PROPERTY = "--velvet-disclosure-duration";
/** Used when the property is absent, which happens in a bare test document. */
const FALLBACK_DURATION_MS = 200;

/**
 * Reads a CSS time value in milliseconds.
 *
 * @param value The declared value, such as `200ms` or `0.2s`.
 * @returns The duration in milliseconds, or null when it is not a time.
 */
function millisecondsFrom(value: string): number | null {
  const match = /^\s*([\d.]+)(ms|s)\s*$/u.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2] === "s" ? amount * 1_000 : amount;
}

/** Whether the visitor has asked for less movement. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Presents a panel as open or closed, animating the change in height.
 *
 * Applied with `use:disclosure={open}`. The element it is applied to owns the
 * `hidden` and `inert` attributes from then on, so nothing else may set them:
 * a closing panel has to stay in the layout until its animation has finished,
 * and only this knows when that is.
 *
 * @param node The panel wrapper, which clips its own overflow at all times. It
 *   has to: the clip is what contains the panel's top margin, and a height
 *   measured without it is short by exactly that margin.
 * @param open Whether the panel should be shown.
 * @returns The action handle Svelte calls when `open` changes.
 */
export function disclosure(node: HTMLElement, open: boolean) {
  const declared = getComputedStyle(node).getPropertyValue(DURATION_PROPERTY);
  const duration = millisecondsFrom(declared) ?? FALLBACK_DURATION_MS;
  let shown = open;
  let animation: Animation | null = null;

  /** Clears what an animation left on the element. */
  function settle(): void {
    node.style.removeProperty("height");
    animation = null;
  }

  /** Puts the element into its final state without moving anything. */
  function snap(next: boolean): void {
    animation?.cancel();
    settle();
    node.hidden = !next;
    node.inert = !next;
  }

  /** Moves the element into its next state, animating the height. */
  function present(next: boolean): void {
    // The height it stands at right now, which is its animated height when a
    // previous run is still playing, so an interrupted panel carries on from
    // where it is rather than jumping first.
    const current = node.hidden ? 0 : node.getBoundingClientRect().height;
    animation?.cancel();
    settle();

    // Not focusable whilst it closes, though it stays visible until the
    // collapse has finished.
    node.inert = !next;

    if (prefersReducedMotion() || typeof node.animate !== "function") {
      snap(next);
      return;
    }

    node.hidden = false;
    const target = next ? node.getBoundingClientRect().height : 0;
    if (target === current) {
      snap(next);
      return;
    }

    animation = node.animate(
      [{ height: `${current}px` }, { height: `${target}px` }],
      { duration, easing: "ease-in-out" },
    );
    animation.finished.then(
      () => {
        node.hidden = !next;
        settle();
      },
      () => {
        // Cancelled by a newer toggle, which has taken over from here.
      },
    );
  }

  snap(open);

  return {
    update(next: boolean): void {
      if (next === shown) return;
      shown = next;
      present(next);
    },
    destroy(): void {
      animation?.cancel();
    },
  };
}

/**
 * The layer every hover overlay is drawn on.
 *
 * An overlay must never be clipped, and inside the card it always will be. Two
 * ancestors clip: the card carries a `clip-path` in the themes with chamfered
 * corners, and the disclosure wrapper carries `overflow: hidden` in all of
 * them, which it needs because that clip is what contains the panel's own top
 * margin whilst its height animates.
 *
 * `position: fixed` does not help. It escapes `overflow`, but a `clip-path` on
 * an ancestor clips every descendant regardless of how it is positioned. The
 * only thing that works is not being a descendant, so an overlay is appended to
 * the document and positioned against the element it belongs to.
 *
 * Measured before this, hovering the first segment of the first service: the
 * tooltip stood 12px above the card's top edge and 18px to the left of it under
 * one of the themes, both inside a `clip-path`, and the chart tooltip had a
 * clipping ancestor in every theme.
 */

/** How an overlay is placed relative to what it describes. */
export interface OverlayAnchor {
  /** The box to sit against, in viewport coordinates. */
  rect: DOMRect;
  /** Preferred side. It flips when there is not enough room. */
  side?: "above" | "below";
}

export interface Overlay {
  /**
   * Shows the overlay against an anchor.
   *
   * @param content - Text, or a node to place inside.
   * @param anchor - Where to put it, re-read on scroll and resize.
   */
  show(content: string | Node, anchor: () => OverlayAnchor | null): void;
  hide(): void;
  destroy(): void;
}

/** How far an overlay stays from the edge of the window. */
const WINDOW_MARGIN = 8;
/** The gap between an overlay and the thing it describes. */
const ANCHOR_GAP = 9;

/**
 * Creates an overlay on the document's own layer.
 *
 * @param className - Applied to the element, so a theme styles it as it styles
 *   anything else. Both overlays use the tooltip tokens, so a theme states that
 *   appearance once.
 * @returns Handles for showing, hiding and removing it.
 */
export function createOverlay(className: string): Overlay {
  const element = document.createElement("div");
  element.className = className;
  element.setAttribute("role", "status");
  element.hidden = true;
  // The overlay is drawn against the window rather than the page, so it needs
  // to sit above everything without joining any stacking context inside a card.
  element.style.position = "fixed";
  element.style.zIndex = "60";
  element.style.pointerEvents = "none";
  element.style.width = "max-content";
  document.body.append(element);

  let currentAnchor: (() => OverlayAnchor | null) | null = null;

  /** Puts the overlay where its anchor currently is. */
  function place(): void {
    if (!currentAnchor) return;
    const anchor = currentAnchor();
    if (!anchor) {
      hide();
      return;
    }
    // Measured after the content is in place, because the size depends on it.
    const box = element.getBoundingClientRect();
    const wantsAbove = anchor.side !== "below";
    const roomAbove = anchor.rect.top - box.height - ANCHOR_GAP;
    const roomBelow =
      window.innerHeight - anchor.rect.bottom - box.height - ANCHOR_GAP;
    // Flip to the other side when the preferred one does not fit, and stay on
    // the preferred side when neither does, since clamping will handle it.
    const above =
      wantsAbove
        ? roomAbove >= WINDOW_MARGIN || roomBelow < WINDOW_MARGIN
        : !(roomBelow >= WINDOW_MARGIN || roomAbove < WINDOW_MARGIN);

    const top = above
      ? anchor.rect.top - box.height - ANCHOR_GAP
      : anchor.rect.bottom + ANCHOR_GAP;
    const centred = anchor.rect.left + anchor.rect.width / 2 - box.width / 2;
    const left = Math.min(
      Math.max(centred, WINDOW_MARGIN),
      window.innerWidth - box.width - WINDOW_MARGIN,
    );

    element.style.top = `${Math.max(WINDOW_MARGIN, Math.min(top, window.innerHeight - box.height - WINDOW_MARGIN))}px`;
    element.style.left = `${Math.max(WINDOW_MARGIN, left)}px`;
  }

  function hide(): void {
    if (element.hidden) return;
    element.hidden = true;
    currentAnchor = null;
  }

  // Scrolling moves the anchor without moving the pointer, so nothing else
  // would tell the overlay to follow. Passive, because neither handler
  // prevents the default.
  const reposition = (): void => {
    if (!element.hidden) place();
  };
  window.addEventListener("scroll", reposition, { passive: true, capture: true });
  window.addEventListener("resize", reposition, { passive: true });

  return {
    show(content, anchor) {
      currentAnchor = anchor;
      if (typeof content === "string") {
        element.textContent = content;
      } else {
        element.textContent = "";
        element.append(content);
      }
      element.hidden = false;
      place();
    },
    hide,
    destroy() {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
      element.remove();
    },
  };
}

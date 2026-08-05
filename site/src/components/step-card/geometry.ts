/**
 * Returns the radius an element sitting `inset` inside a rounded box takes.
 *
 * Concentric rounding is what keeps the gap between two curves constant along
 * their whole length. An inner element given the outer radius pinches at the
 * corner, and one given a radius picked by eye pinches differently at each of
 * the four.
 *
 * @param outerRadius - Radius of the box the element sits inside.
 * @param inset - Distance from that box's edge to the element.
 * @returns The nested radius, clamped at zero, because an element further in
 *   than the radius sits past the curve entirely and is square.
 */
function deriveNestedCornerRadius(
  outerRadius: number,
  inset: number,
): number {
  return Math.max(outerRadius - inset, 0);
}

/**
 * The step card's own corner radius.
 *
 * Everything below follows from this and the inset, so a change here moves the
 * whole card rather than the one edge it was written for. The same value is
 * stated for the site's other cards in `website.css`, because a step card on
 * the start page stands beside them.
 */
export const STEP_CARD_RADIUS = 28;

/** How far a step card holds its content in from its own edge, on all sides. */
export const STEP_CARD_CONTENT_INSET = 16;

/** The footer's inset, kept equal to the body's so the two columns line up. */
export const STEP_CARD_FOOTER_INSET = STEP_CARD_CONTENT_INSET;

/** The radius of anything sitting at the step card's content edge. */
export const STEP_CARD_INNER_RADIUS = deriveNestedCornerRadius(
  STEP_CARD_RADIUS,
  STEP_CARD_CONTENT_INSET,
);

/**
 * A button in a step card's footer.
 *
 * The same as the inner radius, because a footer button stands at the content
 * edge like everything else the card holds.
 */
export const STEP_CARD_BUTTON_RADIUS = STEP_CARD_INNER_RADIUS;

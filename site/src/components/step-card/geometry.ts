function deriveNestedCornerRadius(
  outerRadius: number,
  inset: number,
): number {
  return Math.max(outerRadius - inset, 0);
}

export const STEP_CARD_RADIUS = 32;
export const STEP_CARD_CONTENT_INSET = 20;
export const STEP_CARD_FOOTER_INSET = STEP_CARD_CONTENT_INSET;
export const STEP_CARD_INNER_RADIUS = deriveNestedCornerRadius(
  STEP_CARD_RADIUS,
  STEP_CARD_CONTENT_INSET,
);
export const STEP_CARD_BUTTON_RADIUS = STEP_CARD_INNER_RADIUS;

/**
 * Duration of the overlay's opening and closing motion, in milliseconds.
 *
 * Shared with the CSS through a custom property so the value cannot drift
 * between the animation and anything that needs to wait for it. It matches the
 * established disclosure timing used elsewhere in the product.
 */
export const OVERLAY_MOTION_MS = 200;

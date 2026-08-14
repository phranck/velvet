/**
 * The response chart, as one part: the arithmetic and the drawing.
 *
 * They are one part rather than two because neither is much use without the
 * other, and a design that wanted only the arithmetic would be a design about
 * to draw the curve differently from the product.
 */

export * from "./arithmetic.js";
export * from "./view.js";

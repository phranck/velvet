const SQUIRCLE_SEGMENTS = 64;

/**
 * How square a squircle is, as the exponent its parameterisation is raised to.
 *
 * A superellipse |x|^n + |y|^n = 1 drawn from an angle takes each coordinate to
 * the power 2/n, so a smaller exponent here is a larger n and a squarer shape.
 *
 * `SURFACE` is Velvet's own shape, and everything the product draws takes it:
 * cards, keys, frames, the tick. `GLASS` is squarer, and one thing takes it,
 * which is the tube in the terminal. A cathode ray tube's face is flatter than
 * a rounded rectangle at its corners and rounder than one along its sides, and
 * that is what tells a reader they are looking at glass rather than at another
 * card.
 */
export const SQUIRCLE_SURFACE_EXPONENT = 1 / 2;
export const SQUIRCLE_GLASS_EXPONENT = 1 / 3;

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function point(x: number, y: number): string {
  return `${formatCoordinate(x)} ${formatCoordinate(y)}`;
}

/**
 * A squircle spanning a square.
 *
 * @param size - Width and height of the box the shape spans.
 * @param inset - How far inside the box the path is drawn, so a stroke on it
 *   stays within the element.
 * @param segments - How many points the curve is drawn with.
 * @returns An SVG path, or an empty string where the box leaves no room.
 */
/**
 * A squircle spanning a rectangle.
 *
 * The superellipse takes a radius per axis, so a surface wider than it is tall
 * curves by the same amount at every corner. Drawing the square path and
 * letting the browser stretch it would thin the stroke along whichever axis was
 * stretched further.
 *
 * @param width - Width of the box the shape spans.
 * @param height - Height of that box.
 * @param inset - How far inside the box the path is drawn, so a stroke on it
 *   stays within the element.
 * @param segments - How many points the curve is drawn with.
 * @param exponent - How square the shape is. Defaults to Velvet's own surface;
 *   see {@link SQUIRCLE_GLASS_EXPONENT} for the one thing that differs.
 * @returns An SVG path, or an empty string where the box leaves no room.
 */
export function createSquircleRectPath(
  width: number,
  height: number,
  inset = 0,
  segments = SQUIRCLE_SEGMENTS,
  exponent = SQUIRCLE_SURFACE_EXPONENT,
): string {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "";
  if (width <= 0 || height <= 0) return "";

  const safeInset = Math.max(Number.isFinite(inset) ? inset : 0, 0);
  const radiusX = width / 2 - safeInset;
  const radiusY = height / 2 - safeInset;
  if (radiusX <= 0 || radiusY <= 0) return "";

  const centreX = width / 2;
  const centreY = height / 2;
  const segmentCount = Math.max(
    4,
    Math.floor(Number.isFinite(segments) ? segments : SQUIRCLE_SEGMENTS),
  );

  return `${Array.from({ length: segmentCount }, (_, index) => {
    const angle = (index / segmentCount) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x =
      centreX + radiusX * Math.sign(cosine) * Math.abs(cosine) ** exponent;
    const y = centreY + radiusY * Math.sign(sine) * Math.abs(sine) ** exponent;
    return `${index === 0 ? "M" : "L"}${point(x, y)}`;
  }).join(" ")} Z`;
}

/**
 * A squircle spanning a square.
 *
 * @param size - Width and height of the box the shape spans.
 * @param inset - How far inside the box the path is drawn.
 * @param segments - How many points the curve is drawn with.
 * @returns An SVG path, or an empty string where the box leaves no room.
 */
export function createSquirclePath(
  size: number,
  inset = 0,
  segments = SQUIRCLE_SEGMENTS,
): string {
  return createSquircleRectPath(size, size, inset, segments);
}

export const SQUIRCLE_PATH = createSquirclePath(100, 3);

/**
 * The geometry of Velvet's double outline, stated once.
 *
 * A thin line at the edge and a thicker one just inside it. These four numbers
 * were written out separately in the onboarding's steps and in the theme cards,
 * which is how one shape becomes two that merely resemble each other.
 *
 * They describe, from the outside in: a 1px line flush against the edge, a 2px
 * gap, and a 3px line. A stroke straddles its path, so a line of width w drawn
 * flush from d to d+w sits on a path at d + w/2. That is where each inset comes
 * from, and it is why they are not round numbers.
 */
export const SQUIRCLE_OUTER_PATH_INSET = 0.5;
export const SQUIRCLE_OUTER_STROKE_WIDTH = 1;
export const SQUIRCLE_INNER_PATH_INSET = 4.5;
export const SQUIRCLE_INNER_STROKE_WIDTH = 3;

/**
 * Where the thick inner line stops and the content it frames begins.
 *
 * A stroke straddles its path, so half of it lies inside the inset the path was
 * drawn at. Derived rather than stated, so moving the line moves what it
 * contains with it.
 */
export const SQUIRCLE_CONTENT_INSET =
  SQUIRCLE_INNER_PATH_INSET + SQUIRCLE_INNER_STROKE_WIDTH / 2;

/**
 * The tick Velvet draws inside a squircle, across the middle third of the
 * shape, in the hundred-unit space the paths above use.
 *
 * Stated here rather than in the components that draw it, because a tick that
 * differs between the checkbox and the status page is two ticks.
 */
export const SQUIRCLE_TICK_PATH = "M30 51 L44 66 L71 35";

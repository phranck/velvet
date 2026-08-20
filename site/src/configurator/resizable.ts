/**
 * Dragging a centred dialog larger and smaller from any of its eight edges.
 *
 * Symmetric, which is what makes it belong to a dialog rather than to a panel:
 * a dialog stands in the middle of the window, so a drag that moved only the
 * edge under the pointer would move the whole box off centre. Every edge
 * therefore changes the size about the centre, and the opposite edge moves the
 * same distance the other way.
 *
 * A corner drag changes both measurements at once. A side drag changes one,
 * because that is what a side is.
 */

/** Which edge is being dragged, named the way a cursor is. */
export type ResizeGrip =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

/** Every grip, in the order they are laid over the dialog. */
export const RESIZE_GRIPS: readonly ResizeGrip[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

/** What a dialog may be dragged to, in pixels. */
export interface ResizeBounds {
  minimumWidth: number;
  minimumHeight: number;
  maximumWidth: number;
  maximumHeight: number;
}

/** How large the dialog is right now. */
export interface ResizeSize {
  width: number;
  height: number;
}

/**
 * The size a drag arrives at, about the centre and inside the bounds.
 *
 * The pointer moves one edge whilst the opposite edge moves the same distance
 * the other way, so the box grows by twice what the pointer travelled and its
 * centre stays where it was. A grip that names no direction for an axis leaves
 * that measurement alone.
 *
 * @param grip - The edge being dragged.
 * @param start - How large the dialog was when the drag began.
 * @param moved - How far the pointer has travelled since, in pixels.
 * @param bounds - The smallest and largest the dialog may be.
 * @returns The new size, already held inside the bounds.
 */
export function resizedTo(
  grip: ResizeGrip,
  start: ResizeSize,
  moved: { x: number; y: number },
  bounds: ResizeBounds,
): ResizeSize {
  const horizontal = grip.includes("e") ? 1 : grip.includes("w") ? -1 : 0;
  const vertical = grip.includes("s") ? 1 : grip.includes("n") ? -1 : 0;
  return {
    width: clamp(
      start.width + horizontal * moved.x * 2,
      bounds.minimumWidth,
      bounds.maximumWidth,
    ),
    height: clamp(
      start.height + vertical * moved.y * 2,
      bounds.minimumHeight,
      bounds.maximumHeight,
    ),
  };
}

/**
 * The cursor an edge is dragged with.
 *
 * Both directions are named, so the cursor says the edge moves either way
 * rather than only outwards.
 *
 * @param grip - The edge.
 * @returns A CSS cursor keyword.
 */
export function cursorFor(grip: ResizeGrip): string {
  if (grip === "n" || grip === "s") return "ns-resize";
  if (grip === "e" || grip === "w") return "ew-resize";
  if (grip === "ne" || grip === "sw") return "nesw-resize";
  return "nwse-resize";
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(highest, Math.max(lowest, value));
}

/**
 * Where the dialog's size is kept between visits.
 *
 * Its own key rather than a corner of the sidebar's, because the two are
 * arranged at different moments and neither should rewrite the other.
 */
export const RESIZE_STORAGE_KEY = "velvet:configurator:theme-picker";

/**
 * Reads a remembered size back, or nothing where there is none to read.
 *
 * A stored size is only ever what somebody dragged, so anything that is not a
 * pair of usable numbers is treated as nothing at all rather than repaired:
 * the dialog then opens at the size its stylesheet states.
 *
 * @param stored - Whatever was in storage, of unknown shape.
 * @param minimum - The smallest the dialog may be.
 * @returns The size, or null.
 */
export function storedSize(
  stored: unknown,
  minimum: ResizeSize,
): ResizeSize | null {
  if (typeof stored !== "object" || stored === null) return null;
  const record = stored as Record<string, unknown>;
  const { width, height } = record;
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < minimum.width || height < minimum.height) return null;
  return { width, height };
}

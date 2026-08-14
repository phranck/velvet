/**
 * The shared types every part of the foundation speaks in.
 *
 * A theme imports the part it wants by its own subpath, so a theme using the
 * disclosure does not carry the canvas that draws a month of days:
 *
 *     import { disclosure } from "@velvet/foundation/disclosure";
 *
 * Nothing here obliges a theme to use any of it. A theme that draws its own
 * strip is allowed, and the conformance suite is what catches it if the drawing
 * lies.
 */

export type {
  DayStatus,
  MaintenanceWindow,
  RangeKey,
  ResponseSample,
  ResponseSeries,
  ResponseSeriesEntry,
  ServiceStatus,
} from "./data.js";

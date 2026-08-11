/**
 * The plugins a design may use, and the mechanism that versions them.
 *
 * Importing from here is for the host, which needs to know what exists. A
 * design imports the one plugin it wants, by its own subpath, so a bundle using
 * the disclosure does not carry the canvas that draws a month of days:
 *
 *     import { disclosure } from "@velvet/bundle-plugins/disclosure";
 *
 * Nothing here obliges a design to use any of it. A design that draws its own
 * strip is allowed, and the conformance suite is what catches it if the drawing
 * lies.
 */

export * from "./plugin.js";
export type {
  DayStatus,
  MaintenanceWindow,
  RangeKey,
  ResponseSample,
  ResponseSeries,
  ResponseSeriesEntry,
  ServiceStatus,
} from "./data.js";

/**
 * The fixture set, in one place.
 *
 * One directory used by the gallery, the conformance suite and the screenshot
 * workflow alike, because three copies of "what a status page looks like" is
 * three things to keep true and the one that drifts is always the one somebody
 * was relying on.
 *
 * Every theme is proved against every case here. That is what makes a theme's
 * independence safe: a theme may build its page however it likes, and these are
 * the ten installations it has to survive.
 */

import type { ThemeData } from "../../src/lib/themes/data.js";
import {
  allWell,
  everythingUnknown,
  everyDayState,
  firstDay,
  ipv6Only,
  longNames,
  longSummary,
  oneService,
  twentyServices,
} from "./cases.js";
import { velvetUnderground } from "./velvet-underground.js";

/** One case, with the sentence explaining what it exists to catch. */
export interface Fixture {
  /** How the suite names it in a failure. */
  name: string;
  /** What this case is for. */
  what: string;
  data: ThemeData;
}

export const FIXTURES: readonly Fixture[] = [
  {
    name: "velvet-underground",
    what: "the ordinary installation: five services, three hundred days, one open incident",
    data: velvetUnderground,
  },
  {
    name: "all-well",
    what: "the ordinary installation with nothing wrong, which is what the start page is photographed on",
    data: allWell,
  },
  {
    name: "first-day",
    what: "the first day of an installation, with no history at all",
    data: firstDay,
  },
  {
    name: "everything-unknown",
    what: "nothing has answered and no figure exists",
    data: everythingUnknown,
  },
  {
    name: "every-day-state",
    what: "answered, degraded, out and unrecorded days in one row",
    data: everyDayState,
  },
  { name: "one-service", what: "one service", data: oneService },
  { name: "twenty-services", what: "twenty services", data: twentyServices },
  { name: "long-names", what: "very long service names", data: longNames },
  {
    name: "long-summary",
    what: "an incident summary of two thousand characters",
    data: longSummary,
  },
  {
    name: "ipv6-only",
    what: "a service reachable over IPv6 only",
    data: ipv6Only,
  },
];

/** One fixture by name, for a suite run narrowed to a single case. */
export function fixtureNamed(name: string): Fixture | undefined {
  return FIXTURES.find((fixture) => fixture.name === name);
}

export { velvetUnderground } from "./velvet-underground.js";
export * from "./cases.js";

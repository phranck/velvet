/**
 * The fixture set, in one place.
 *
 * One directory used by the gallery, the conformance suite and the screenshot
 * workflow alike, because three copies of "what a status page looks like" is
 * three things to keep true and the one that drifts is always the one somebody
 * was relying on.
 *
 * Every design is proved against every case here. That is what makes a bundle's
 * independence safe: a design may build its page however it likes, and these
 * are the eight installations it has to survive.
 */

import type { BundleData } from "../../src/lib/bundles/data.js";
import {
  everythingUnknown,
  firstDay,
  ipv6Only,
  longNames,
  longSummary,
  oneService,
  twentyServices,
} from "./cases.js";
import { orbital } from "./orbital.js";

/** One case, with the sentence explaining what it exists to catch. */
export interface Fixture {
  /** How the suite names it in a failure. */
  name: string;
  /** What this case is for. */
  what: string;
  data: BundleData;
}

export const FIXTURES: readonly Fixture[] = [
  {
    name: "orbital",
    what: "the ordinary installation: five services, three hundred days, one open incident",
    data: orbital,
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

export { orbital } from "./orbital.js";
export * from "./cases.js";

/**
 * The small pieces the template and the script both need.
 *
 * Every formatter is built once at module scope rather than inside the function
 * that uses it. `toLocaleString` builds a formatter on every call, and both of
 * these label content that is rewritten on every range change: measured on a
 * status page, formatting 360 dates that way took 6.2ms against 0.4ms through
 * one `Intl.DateTimeFormat`.
 */

/**
 * The three ranges, in the order and with the labels the product uses.
 *
 * None of them carries what stands at its far end, because `all` reaches back
 * to the day the installation began and that is a different date on every one.
 * `rangeLabel` in the status plugin answers it from the data instead.
 */
export const RANGES = [
  { key: "month", label: "30d", description: "The last 30 days" },
  { key: "quarter", label: "90d", description: "The last 90 days" },
  { key: "all", label: "All", description: "Everything measured" },
] as const;

/** One range by key, falling back to the month a page opens in. */
export function rangeNamed(key: string): (typeof RANGES)[number] {
  return RANGES.find((option) => option.key === key) ?? RANGES[0];
}

const EVENT_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** When an incident began or a maintenance window is due. */
export function formatEventTime(moment: Date): string {
  return EVENT_TIME.format(moment);
}

/** The moment the page was generated, under the headline. */
export function formatUpdated(moment: string): string {
  return EVENT_TIME.format(new Date(moment));
}

/**
 * What a service's own state is called on the readout.
 *
 * A word rather than a colour, because the readout is the only place this
 * design says what a service is doing and a lamp beside it would be a second
 * thing to read.
 */
export const STATE_WORD: Record<string, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Maintenance",
  unknown: "No data",
};

/**
 * Escapes text for markup.
 *
 * The bundle carries its own rather than importing one, because a service name
 * comes from an operator's configuration and a design that borrowed this from
 * somewhere else would stop being self-contained over four replacements.
 *
 * @param value - Anything that came from the data.
 * @returns The same text, safe between tags and inside an attribute.
 */
export function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

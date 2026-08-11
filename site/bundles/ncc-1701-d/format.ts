/**
 * The small pieces the template and the script both need.
 *
 * Every formatter is built once at module scope rather than inside the function
 * that uses it. `toLocaleString` builds a formatter on every call, and both of
 * these label content that is rewritten on every range change: measured on a
 * status page, formatting 360 dates that way took 6.2ms against 0.4ms through
 * one `Intl.DateTimeFormat`.
 */

/** The five ranges, in the order and with the labels the product uses. */
export const RANGES = [
  { key: "day", label: "24h", description: "The last 24 hours", from: "24h ago" },
  { key: "week", label: "7d", description: "The last 7 days", from: "7 days ago" },
  { key: "month", label: "30d", description: "The last 30 days", from: "30 days ago" },
  { key: "quarter", label: "90d", description: "The last 90 days", from: "90 days ago" },
  { key: "year", label: "1yr", description: "The last 12 months", from: "1 year ago" },
] as const;

/** One range by key, falling back to the month a page opens in. */
export function rangeNamed(key: string): (typeof RANGES)[number] {
  return RANGES.find((option) => option.key === key) ?? RANGES[2];
}

const EVENT_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The moment the page was generated, under the headline. */
export function formatUpdated(moment: string): string {
  return EVENT_TIME.format(new Date(moment));
}

/**
 * A date as `24.03.2026`.
 *
 * Written out rather than formatted by locale, because this panel's reading of
 * a date is fixed: two digits, two digits, four digits, separated by stops. A
 * locale would give a different order and a different separator depending on
 * who is looking.
 *
 * @param moment - The date to write.
 * @returns The date, zero-padded.
 */
export function panelDate(moment: Date): string {
  const day = String(moment.getUTCDate()).padStart(2, "0");
  const month = String(moment.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${moment.getUTCFullYear()}`;
}

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

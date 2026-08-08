/**
 * The locale a build renders times in, having no reader to ask.
 *
 * Velvet's own interface is written in British English, so a prerendered page
 * states its times that way until a browser restates them.
 */
export const BUILD_LOCALE = "en-GB";

/**
 * The locale every formatted time on the page is currently read in.
 *
 * A prerendered page is rendered twice: once by the build, which has no reader,
 * and once by the browser as it hydrates. Both have to produce the same markup,
 * so both start from the build's locale, and the reader's own is adopted only
 * afterwards. A formatter reading the system locale directly would differ
 * between those two renders for every reader outside the build's locale, which
 * is what hydration cannot reconcile.
 */
let current = $state(BUILD_LOCALE);

/**
 * The locale to format a time in right now.
 *
 * Read it inside a `$derived` that builds the formatter, so the formatter is
 * constructed once per locale rather than once per value. Constructing one per
 * value is measurably expensive: 360 dates cost 6.2ms that way against 0.4ms
 * through a formatter made in advance.
 *
 * @returns The locale to pass to `Intl`.
 */
export function readingLocale(): string {
  return current;
}

/**
 * Switches every formatted time on the page to the reader's own locale.
 *
 * Called once the page has hydrated, which is the first moment the markup no
 * longer has to match what the build produced.
 */
export function adoptReaderLocale(): void {
  if (typeof navigator !== "undefined") current = navigator.language;
}

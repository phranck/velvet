/**
 * What the configurator and the page in its monitor say to each other.
 *
 * The monitor shows a theme in a frame, and the frame runs a document built by
 * `scripts/build-configurator-themes.ts`. The two are separate programs joined
 * by nothing but the names below, so the names live here and both read them.
 * Written out on each side instead, a rename would reach one of them and the
 * monitor would go quiet without anything failing.
 */

/**
 * Sent by the page once its script has run and it can take settings.
 *
 * The configurator waits for it rather than guessing when a document it has
 * just pointed at has finished loading.
 */
export const MONITOR_READY = "velvet:ready";

/**
 * Sent by the configurator whenever a setting changes.
 *
 * Carries a `declarations` object of custom property names against values, which
 * the page writes onto its own root and onto the document's.
 */
export const MONITOR_SETTINGS = "velvet:settings";

/**
 * Sent by the configurator whenever a page setting changes that is data rather
 * than appearance.
 *
 * The window a page opens in is decided when the page is drawn: the template
 * marks the key that is down and the script starts in that window. There is no
 * custom property to change, so the page is drawn again from the same fixture
 * with the new value.
 *
 * Carries a `site` object holding the fields that changed.
 */
export const MONITOR_PAGE = "velvet:page";

/**
 * Saying that the page's appearance has moved.
 *
 * Most of a page follows a changed custom property on its own, because the
 * browser resolves it again: a stylesheet reading `var(--protocol-ipv4)`
 * repaints without being asked. What does not follow is anything drawn onto a
 * canvas, which holds the pixels it was given until something asks for them
 * again, and the uptime strip is exactly that.
 *
 * Nothing in the platform reports a custom property changing. So whoever
 * changes one says so, and whatever painted from one listens.
 */

/** What is dispatched on the document when a design's own values move. */
export const APPEARANCE_EVENT = "velvet:appearance";

/**
 * Says that the values a page is drawn from have changed.
 *
 * @param target - The document to say it in, which is the page's own.
 */
export function announceAppearance(target: Document = document): void {
  target.dispatchEvent(new CustomEvent(APPEARANCE_EVENT));
}

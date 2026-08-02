/**
 * How one instance's analytics is configured.
 *
 * Optional throughout. An instance that configures nothing serves no analytics
 * script and grants nothing extra in its Content Security Policy, which is what
 * anyone running their own copy of Velvet should get by default.
 */
export interface AnalyticsConfiguration {
  /**
   * Absolute HTTPS URL the analytics script is served from.
   *
   * Validated when the configuration is loaded, so it carries no credentials,
   * query, or fragment, and its origin is what the policy has to grant.
   */
  readonly scriptUrl: string;
  /**
   * Identifier the analytics installation knows this site by.
   *
   * Restricted to letters, digits, dots, dashes, and underscores when loaded,
   * which is what makes it safe to write into an HTML attribute unescaped.
   */
  readonly websiteId: string;
}

/**
 * The origin a Content Security Policy has to grant for analytics to work.
 *
 * The policy must name it twice, in `script-src` because the script is fetched
 * from there and in `connect-src` because its events are posted back to it.
 * Granting only the first loads the script and then records nothing, which
 * looks exactly like working analytics whilst collecting no data. Deriving both
 * from this one function is what stops the two from drifting apart.
 *
 * @param analytics - The instance's analytics configuration, or `null`.
 * @returns The origin to grant, or `null` when analytics is off.
 */
export function analyticsOrigin(
  analytics: AnalyticsConfiguration | null,
): string | null {
  return analytics ? new URL(analytics.scriptUrl).origin : null;
}

/**
 * Adds the analytics script to a document the service is about to serve.
 *
 * The script is injected here rather than written into the built bundle,
 * because the bundle is committed to a repository other people fork and run.
 * A hardcoded tag would have their visitors counted in somebody else's
 * dashboard, and that somebody else's figures inflated by traffic they never
 * had, with neither party in a position to notice.
 *
 * Both values are validated when the configuration is loaded, so neither can
 * contain a quote or an angle bracket and neither needs escaping here.
 *
 * @param document - The HTML document as served.
 * @param analytics - The instance's analytics configuration, or `null`.
 * @returns The document, unchanged when analytics is off or when the document
 *   has no `</head>` to insert before.
 */
export function withAnalytics(
  document: string,
  analytics: AnalyticsConfiguration | null,
): string {
  if (!analytics) return document;
  const tag =
    `<script defer src="${analytics.scriptUrl}" ` +
    `data-website-id="${analytics.websiteId}"></script>`;
  return document.replace("</head>", `  ${tag}\n  </head>`);
}

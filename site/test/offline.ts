import type { Page } from "playwright";

/**
 * Refuses every request that would leave the machine running the test.
 *
 * A browser test that reaches the internet has its timing decided by somebody
 * else's server. That is what made the onboarding run intermittently red: the
 * page carried an analytics script served from a real host, and the latency of
 * fetching it moved the render past the assertion that read the result. The
 * failure looked like a race in the component, and it was a dependency on a
 * network.
 *
 * Register this before a test's own stubs. Playwright gives the most recently
 * registered route precedence, so anything a test deliberately fulfils still
 * wins over this refusal.
 *
 * @param page - The page to confine to the local dev server.
 */
export async function refuseOffsiteRequests(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    // Anything that is not fetched over the network, such as `data:` images,
    // never leaves the page and is left alone.
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return route.continue();
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return route.continue();
    }
    return route.abort();
  });
}

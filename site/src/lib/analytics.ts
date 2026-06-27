/**
 * Runtime injection of optional web-analytics trackers.
 *
 * Velvet loads its `config.json` in the browser, so any analytics snippet is
 * appended to `<head>` once the config is known rather than being baked into the
 * static bundle. Umami and Google Analytics are independent: whichever is
 * configured is injected, both may run together, and the function is a no-op when
 * neither is set. The trackers themselves record the initial page view on load.
 */
import type { VelvetConfig } from "./config";

declare global {
  interface Window {
    /** Google Analytics command queue, consumed by gtag.js once it loads. */
    dataLayer?: unknown[];
  }
}

/**
 * Inject the configured analytics scripts into the document head.
 *
 * Safe to call once after {@link VelvetConfig} is loaded. Has no effect unless
 * `config.umami` (both `websiteId` and `src`) or `config.googleAnalytics` is set.
 * Loading external scripts is a side effect; nothing is returned.
 *
 * @param config - the loaded Velvet config; reads `umami` and `googleAnalytics`
 */
export function injectAnalytics(config: VelvetConfig): void {
  if (config.umami?.websiteId && config.umami.src) {
    const script = document.createElement("script");
    script.defer = true;
    script.src = config.umami.src;
    script.setAttribute("data-website-id", config.umami.websiteId);
    document.head.appendChild(script);
  }

  if (config.googleAnalytics) {
    const id = config.googleAnalytics;
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(loader);

    window.dataLayer = window.dataLayer ?? [];
    const gtag = (...args: unknown[]): void => {
      window.dataLayer?.push(args);
    };
    gtag("js", new Date());
    gtag("config", id);
  }
}

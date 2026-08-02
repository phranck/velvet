import { createPrivateKey } from "node:crypto";

import type { AnalyticsConfiguration } from "./analytics.js";
import { parseSerialRepository } from "./serial.js";

export interface SetupServiceConfig {
  environment: "development" | "production" | "test";
  publicOrigin: string;
  port: number;
  secureCookies: boolean;
  github: {
    appId: string;
    appSlug: string;
    clientId: string;
    clientSecret: string;
    privateKey: string;
  };
  sessionSecret: string;
  /**
   * How often eligible security releases are swept for, in milliseconds.
   *
   * Zero turns the sweep off entirely, which is what a development instance
   * without real installations wants.
   */
  automaticUpdateIntervalMs: number;
  /**
   * Where the installation serial counter lives, or `null` to hand out no
   * serials at all.
   *
   * Optional on purpose. A development instance has no counter repository, and
   * an instance that cannot reach one should still complete setups rather than
   * refuse them over a decorative number.
   */
  serialCounter: {
    /** Repository holding the counter, as `owner/name`. */
    repository: string;
    /** Path to the counter file inside it. */
    path: string;
  } | null;
  /**
   * Where this instance sends its usage statistics, or `null` to send none.
   *
   * Absent by default on purpose. Velvet is installed and run by other people,
   * so an instance that configures nothing must collect nothing rather than
   * report into whichever dashboard the source happened to name.
   */
  analytics: AnalyticsConfiguration | null;
}

export function loadSetupServiceConfig(
  environment: Record<string, string | undefined>,
): SetupServiceConfig {
  const nodeEnvironment = environment.NODE_ENV ?? "production";
  if (
    nodeEnvironment !== "development" &&
    nodeEnvironment !== "production" &&
    nodeEnvironment !== "test"
  ) {
    throw new TypeError("NODE_ENV must be development, production, or test.");
  }

  const publicOrigin = parsePublicOrigin(
    required(environment, "PUBLIC_ORIGIN"),
    nodeEnvironment,
  );
  const appId = required(environment, "GITHUB_APP_ID");
  if (!/^\d+$/.test(appId)) {
    throw new TypeError("GITHUB_APP_ID must be numeric.");
  }
  const appSlug = required(environment, "GITHUB_APP_SLUG");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(appSlug)) {
    throw new TypeError("GITHUB_APP_SLUG is invalid.");
  }
  const clientId = required(environment, "GITHUB_APP_CLIENT_ID");
  if (!/^[A-Za-z0-9._-]{4,128}$/.test(clientId)) {
    throw new TypeError("GITHUB_APP_CLIENT_ID is invalid.");
  }
  const clientSecret = required(environment, "GITHUB_APP_CLIENT_SECRET");
  if (Buffer.byteLength(clientSecret, "utf8") < 16) {
    throw new TypeError("GITHUB_APP_CLIENT_SECRET is too short.");
  }
  const privateKey = required(environment, "GITHUB_APP_PRIVATE_KEY").replaceAll(
    "\\n",
    "\n",
  );
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== "rsa") throw new Error("Not an RSA key.");
  } catch (error) {
    throw new TypeError("GITHUB_APP_PRIVATE_KEY must be a valid RSA private key.", {
      cause: error,
    });
  }
  const sessionSecret = required(environment, "SESSION_SECRET");
  if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new TypeError("SESSION_SECRET must contain at least 32 bytes.");
  }
  const port = Number(environment.PORT ?? "3000");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("PORT must be an integer from 1 through 65535.");
  }
  // Hourly by default. A sweep costs nothing whilst no release may install
  // itself, which is the ordinary state, so the interval only decides how
  // quickly one that may reaches installations.
  const sweepMinutes = Number(
    environment.AUTOMATIC_UPDATE_INTERVAL_MINUTES ?? "60",
  );
  if (
    !Number.isSafeInteger(sweepMinutes) ||
    sweepMinutes < 0 ||
    sweepMinutes > 1_440
  ) {
    throw new TypeError(
      "AUTOMATIC_UPDATE_INTERVAL_MINUTES must be an integer from 0 through 1440.",
    );
  }

  const serialRepository = environment.SERIAL_COUNTER_REPOSITORY?.trim();
  if (serialRepository) parseSerialRepository(serialRepository);
  const serialPath = environment.SERIAL_COUNTER_PATH?.trim() || "registry.json";
  if (serialRepository && !/^[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/u.test(serialPath)) {
    throw new TypeError(
      "SERIAL_COUNTER_PATH must be a relative path to a .json file.",
    );
  }

  return {
    environment: nodeEnvironment,
    publicOrigin,
    port,
    secureCookies: new URL(publicOrigin).protocol === "https:",
    github: { appId, appSlug, clientId, clientSecret, privateKey },
    sessionSecret,
    automaticUpdateIntervalMs: sweepMinutes * 60_000,
    serialCounter: serialRepository
      ? { repository: serialRepository, path: serialPath }
      : null,
    analytics: parseAnalytics(environment),
  };
}

/**
 * Reads the optional analytics settings, refusing a half-configured pair.
 *
 * Both values or neither. A script URL without an identifier loads the script
 * and records nothing, and an identifier without a URL loads nothing at all;
 * both present as analytics that simply does not work, which is the failure
 * mode hardest to notice.
 *
 * @param environment - The process environment to read from.
 * @returns The configuration, or `null` when this instance collects nothing.
 */
function parseAnalytics(
  environment: Record<string, string | undefined>,
): AnalyticsConfiguration | null {
  const scriptUrl = environment.ANALYTICS_SCRIPT_URL?.trim();
  const websiteId = environment.ANALYTICS_WEBSITE_ID?.trim();
  if (!scriptUrl && !websiteId) return null;
  if (!scriptUrl || !websiteId) {
    throw new TypeError(
      "ANALYTICS_SCRIPT_URL and ANALYTICS_WEBSITE_ID must be set together.",
    );
  }

  let url: URL;
  try {
    url = new URL(scriptUrl);
  } catch (error) {
    throw new TypeError("ANALYTICS_SCRIPT_URL must be an absolute URL.", {
      cause: error,
    });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "ANALYTICS_SCRIPT_URL must be an HTTPS URL without credentials, query, or fragment.",
    );
  }
  // Deliberately narrow. The identifier is written into an HTML attribute on a
  // document this service serves, and a character set with no quote and no
  // angle bracket in it is what makes that safe without escaping.
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(websiteId)) {
    throw new TypeError(
      "ANALYTICS_WEBSITE_ID must contain only letters, digits, dots, dashes, or underscores.",
    );
  }

  return { scriptUrl: url.href, websiteId };
}

function required(
  environment: Record<string, string | undefined>,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
}

function parsePublicOrigin(
  source: string,
  environment: SetupServiceConfig["environment"],
): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch (error) {
    throw new TypeError("PUBLIC_ORIGIN must be an absolute URL.", { cause: error });
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new TypeError("PUBLIC_ORIGIN must contain only an origin.");
  }
  const localDevelopment =
    environment !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new TypeError("PUBLIC_ORIGIN must use HTTPS outside local development.");
  }
  return url.origin;
}

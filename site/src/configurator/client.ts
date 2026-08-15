import {
  validateInstallationConfiguration,
  validateSetupInstallations,
  validateSetupSession,
  type InstallationConfiguration,
  type ManageableInstallation,
} from "@velvet/contracts";

import {
  browserNavigate,
  readJsonResponse,
} from "../lib/service-response.js";

/**
 * How the configurator gets at the service, so a test can answer for it.
 *
 * The same shape `fetch` has, narrowed to what this client asks of it.
 */
export type ConfiguratorFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Why the configurator cannot go on, in the words it says it in.
 *
 * `signed-out` is not in here. Being signed out is not a failure but a step:
 * the client leaves for the authorization and never returns to its caller.
 */
export type ConfiguratorFailure = "unreachable" | "unreadable";

/** A failure the configurator can name, as opposed to one it cannot. */
export class ConfiguratorError extends Error {
  constructor(readonly reason: ConfiguratorFailure) {
    super(reason);
    this.name = "ConfiguratorError";
  }
}

/** What the configurator found when it opened. */
export interface ConfiguratorOpening {
  /** The GitHub account this browser is signed in as. */
  login: string;
  /**
   * The installations this account may configure, newest information first.
   *
   * Only repositories carrying a readable lock are here. A repository the
   * account granted access to without ever setting Velvet up in it is not an
   * installation and is dropped rather than offered as an empty one.
   */
  installations: ManageableInstallation[];
  /**
   * Whether the service stopped looking before it had found everything.
   *
   * Shown rather than swallowed, because an installation missing from a list
   * looks exactly like one that does not exist.
   */
  truncated: boolean;
}

export interface ConfiguratorClient {
  /**
   * Reads who is signed in and what they may configure.
   *
   * Leaves for the GitHub authorization when nobody is, in which case it never
   * returns: the browser is already on its way elsewhere.
   *
   * @throws {ConfiguratorError} When the service cannot be reached, or answers
   *   something that is not a listing.
   */
  open(): Promise<ConfiguratorOpening>;
  /**
   * Reads how one installation is published today.
   *
   * What is live rather than what is being drafted, so the configurator starts
   * from the theme the page actually carries.
   *
   * @param installation - The installation and repository to read.
   * @returns The theme and what is set on it, with no theme where the
   *   repository carries no readable configuration.
   * @throws {ConfiguratorError} When the service cannot be reached, or answers
   *   something that is not a configuration.
   */
  configurationOf(
    installation: ManageableInstallation,
  ): Promise<InstallationConfiguration>;
}

/**
 * Talks to the setup service from the browser it is served by.
 *
 * Same-origin throughout, which is the whole reason the configurator lives
 * under the service's own name: the session cookie is `__Host-` prefixed and
 * bound to exactly this host, so nothing here carries a credential anywhere.
 *
 * @param fetchImplementation - How to make the request.
 * @param navigate - How to leave the page, so a test can watch instead.
 * @returns A client, holding no state of its own.
 */
export function createConfiguratorClient(
  fetchImplementation: ConfiguratorFetch = globalThis.fetch,
  navigate: (url: string) => void = browserNavigate,
): ConfiguratorClient {
  const unreadable = (): Error => new ConfiguratorError("unreadable");

  const ask = async (path: string): Promise<Response> => {
    try {
      return await fetchImplementation(path, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } catch {
      throw new ConfiguratorError("unreachable");
    }
  };

  return {
    async open() {
      const sessionResponse = await ask("/api/session");
      if (!sessionResponse.ok) throw unreadable();
      const session = validateSetupSession(
        await readJsonResponse(sessionResponse, unreadable),
      );
      if (!session.success) throw unreadable();
      if (!session.data.authenticated || !session.data.user) {
        navigate("/api/auth/start");
        // Unreachable in a browser, which has left by now. A test that does
        // not follow the navigation gets an answer rather than a hang.
        return { login: "", installations: [], truncated: false };
      }

      const listing = await ask("/api/installations");
      // A session that expired between the two requests is a sign-in rather
      // than a failure, and is the one status worth telling apart here.
      if (listing.status === 401) {
        navigate("/api/auth/start");
        return { login: "", installations: [], truncated: false };
      }
      if (!listing.ok) throw unreadable();
      const installations = validateSetupInstallations(
        await readJsonResponse(listing, unreadable),
      );
      if (!installations.success) throw unreadable();

      return {
        login: session.data.user.login,
        installations: installations.data.repositories.filter(
          (repository) => repository.installedVersion !== null,
        ),
        truncated: installations.data.truncated,
      };
    },

    async configurationOf(installation) {
      const answer = await ask(
        `/api/configuration?installation=${installation.installationId}&repository=${installation.repositoryId}`,
      );
      if (answer.status === 401) {
        navigate("/api/auth/start");
        // Unreachable in a browser, which has left by now.
        return { theme: null, themeSettings: {} };
      }
      if (!answer.ok) throw unreadable();
      const configuration = validateInstallationConfiguration(
        await readJsonResponse(answer, unreadable),
      );
      if (!configuration.success) throw unreadable();
      return configuration.data;
    },
  };
}

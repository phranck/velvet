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
 *
 * `unwritable` is the operator's own file rather than anything here: it has a
 * shape the service will not change, and only they can put that right. It is
 * told apart from `unreadable` because the two need different words on screen.
 */
export type ConfiguratorFailure = "unreachable" | "unreadable" | "unwritable";

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
  /** That account's picture on GitHub, for showing whose session this is. */
  avatarUrl: string;
  /**
   * What the account calls itself on GitHub.
   *
   * Absent where it has set no name, which is common enough that anything
   * showing it falls back on the login rather than showing a gap.
   */
  name?: string;
  /**
   * The address GitHub answers with for this account.
   *
   * Absent where GitHub gives none, so anything showing it leaves the line out
   * rather than showing a gap.
   */
  email?: string;
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
  /**
   * Writes a theme and its settings into the installation's own configuration.
   *
   * One commit, which sets off the workflow that rebuilds the page. Everything
   * else in the file is left as the operator wrote it, and a file the service
   * cannot edit safely is refused rather than reformatted.
   *
   * @param installation - The installation and repository to publish to.
   * @param configuration - The theme and what is set on it.
   * @returns The commit the write produced, or nothing where the page was
   *   already published exactly that way.
   * @throws {ConfiguratorError} When the service cannot be reached, answers
   *   something unreadable, or refuses the file it was asked to change.
   */
  publish(
    installation: ManageableInstallation,
    configuration: InstallationConfiguration,
  ): Promise<{ commit: string | null }>;
  /**
   * Ends this session and revokes the token GitHub issued for it.
   *
   * Never returns: the browser leaves for `destination` as soon as the session
   * is gone.
   *
   * The destination is the caller's, because ending a session to leave and
   * ending one to sign in as somebody else are the same request and different
   * journeys. Neither can ask GitHub to offer a choice of account, since GitHub
   * alone decides which one answers an authorization.
   *
   * @param destination - Where to send the browser once the session is gone.
   * @throws {ConfiguratorError} When the service cannot be reached, or refuses
   *   to end the session.
   */
  endSession(destination: string): Promise<void>;
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

  /**
   * Makes a writing request, carrying the token that proves it came from here.
   *
   * The session is read for that token at the moment of writing rather than
   * held from earlier, so a session that has since expired is noticed before
   * the write instead of after it.
   *
   * @param path - Where to write.
   * @param body - What to send.
   * @returns The service's answer.
   */
  const send = async (path: string, body: unknown): Promise<Response> => {
    const sessionResponse = await ask("/api/session");
    if (!sessionResponse.ok) throw unreadable();
    const session = validateSetupSession(
      await readJsonResponse(sessionResponse, unreadable),
    );
    if (!session.success) throw unreadable();
    if (!session.data.authenticated || !session.data.csrfToken) {
      navigate("/api/auth/start");
      throw new ConfiguratorError("unreadable");
    }
    try {
      return await fetchImplementation(path, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Velvet-CSRF": session.data.csrfToken,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ConfiguratorError("unreachable");
    }
  };

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
        return { login: "", avatarUrl: "", installations: [], truncated: false };
      }

      const listing = await ask("/api/installations");
      // A session that expired between the two requests is a sign-in rather
      // than a failure, and is the one status worth telling apart here.
      if (listing.status === 401) {
        navigate("/api/auth/start");
        return { login: "", avatarUrl: "", installations: [], truncated: false };
      }
      if (!listing.ok) throw unreadable();
      const installations = validateSetupInstallations(
        await readJsonResponse(listing, unreadable),
      );
      if (!installations.success) throw unreadable();

      return {
        login: session.data.user.login,
        avatarUrl: session.data.user.avatarUrl,
        ...(session.data.user.name ? { name: session.data.user.name } : {}),
        ...(session.data.user.email ? { email: session.data.user.email } : {}),
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
        return {
          theme: null,
          themeSettings: {},
          responseChart: true,
          defaultRange: "30d",
        };
      }
      if (!answer.ok) throw unreadable();
      const configuration = validateInstallationConfiguration(
        await readJsonResponse(answer, unreadable),
      );
      if (!configuration.success) throw unreadable();
      return configuration.data;
    },

    async publish(installation, configuration) {
      const answer = await send("/api/configuration/publish", {
        installationId: installation.installationId,
        repositoryId: installation.repositoryId,
        theme: configuration.theme,
        themeSettings: configuration.themeSettings,
        responseChart: configuration.responseChart,
        defaultRange: configuration.defaultRange,
      });
      if (answer.status === 401) {
        navigate("/api/auth/start");
        // Unreachable in a browser, which has left by now.
        return { commit: null };
      }
      // The one refusal worth telling apart. It means the operator's own file
      // has a shape the service will not change rather than anything being
      // wrong here, and only they can put that right.
      if (answer.status === 409) throw new ConfiguratorError("unwritable");
      if (!answer.ok) throw unreadable();
      const body = await readJsonResponse(answer, unreadable);
      const commit = (body as { commit?: unknown }).commit;
      if (commit !== null && typeof commit !== "string") throw unreadable();
      return { commit };
    },

    async endSession(destination) {
      const answer = await send("/api/logout", {});
      // A session that has already gone is the outcome this was asking for, so
      // it counts as done rather than as a failure nobody can act on.
      if (!answer.ok && answer.status !== 401) throw unreadable();
      navigate(destination);
    },
  };
}

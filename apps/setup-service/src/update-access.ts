import {
  MAX_MANAGEABLE_INSTALLATIONS,
  parseVelvetVersionLock,
} from "@velvet/contracts";

import { createGitHubRequest } from "./github-api.js";
import { GitHubApiError } from "./github-api.js";
import type { GitHubSetupClient } from "./github.js";
import { isRecord, positiveInteger } from "./update-github-validation.js";

const ACCESS_USER_AGENT = "velvet-update-service";

/**
 * Repositories inspected per installation.
 *
 * One page of results. An installation granted access to every repository of a
 * large account would otherwise cost one lock read per repository on an
 * interactive request, which is neither fast nor a reasonable use of the
 * user's rate limit.
 */
const MAX_REPOSITORIES_PER_INSTALLATION = 100;

/**
 * Lock reads performed across all installations for one listing.
 *
 * The same number as the longest listing the contract permits, because one
 * read produces one entry. Taking it from there rather than stating it again
 * is what stops a listing this service is willing to build from being one the
 * browser refuses to read.
 */
const MAX_LOCK_READS = MAX_MANAGEABLE_INSTALLATIONS;

/** Lock reads in flight at once, high enough to be quick and low enough to be polite. */
const LOCK_READ_CONCURRENCY = 8;

/**
 * One repository a signed-in user may manage Velvet in.
 *
 * @property installedVersion - The version its `velvet.lock.json` records.
 *   Absent for a repository that carries no readable lock, which means it was
 *   not created by browser onboarding and cannot receive a managed update.
 */
export interface ManageableRepository {
  installationId: number;
  repositoryId: number;
  owner: string;
  name: string;
  htmlUrl: string;
  defaultBranch: string;
  installedVersion: string | null;
}

/**
 * What a listing found, and whether it saw everything.
 *
 * @property truncated - True when a bound stopped the search before every
 *   repository had been inspected, so the interface can say that a repository
 *   may be missing rather than implying the list is complete.
 */
export interface ManageableRepositories {
  repositories: ManageableRepository[];
  truncated: boolean;
}

/**
 * Refusal to act on an installation or repository for the signed-in user.
 *
 * Deliberately carries no detail about why. Distinguishing "no such
 * repository" from "not yours" would let a caller enumerate repositories they
 * cannot see.
 */
export class UpdateAccessError extends Error {
  constructor() {
    super("This Velvet installation is not available to the signed-in user.");
    this.name = "UpdateAccessError";
  }
}

export interface UpdateAccess {
  /**
   * Lists the Velvet installations the user holds and what they contain.
   *
   * @param userToken - The user's own GitHub token, so GitHub decides what is
   *   visible rather than the service deciding on its behalf.
   */
  list(userToken: string): Promise<ManageableRepositories>;
  /**
   * Proves the user may act on one repository through one installation.
   *
   * @throws {UpdateAccessError} When the user does not hold that installation,
   *   the repository does not belong to its account, or the user is not an
   *   administrator of it.
   */
  authorize(
    userToken: string,
    installationId: number,
    repositoryId: number,
  ): Promise<ManageableRepository>;
  /**
   * Reads a repository's Velvet configuration with the user's own token.
   *
   * @returns The file verbatim and the blob it was read from, so a write can
   *   refuse when someone else changed it meanwhile.
   */
  readConfiguration(
    userToken: string,
    repository: ManageableRepository,
  ): Promise<{ source: string; blobSha: string }>;
  /**
   * Writes a repository's Velvet configuration with the user's own token.
   *
   * Using the user's token rather than an installation token matters here.
   * `velvet.yml` belongs to the user, the Velvet App never writes it as part of
   * an update, and an edit made here is the user's own, so it is recorded as
   * such.
   *
   * @param blobSha - The blob the edit was based on. GitHub rejects the write
   *   when the file has moved on, which is what stops a concurrent edit from
   *   being silently overwritten.
   * @param message - What the commit says, which differs by what was edited.
   * @returns The commit's own hash, which is what identifies the workflow run
   *   the write sets off.
   */
  writeConfiguration(
    userToken: string,
    repository: ManageableRepository,
    source: string,
    blobSha: string,
    message: string,
  ): Promise<string>;
}

interface UpdateAccessOptions {
  github: GitHubSetupClient;
  fetch?: (request: Request) => Promise<Response>;
}

interface AccessibleRepository {
  id: number;
  owner: string;
  name: string;
  htmlUrl: string;
  defaultBranch: string;
  /** Absent when GitHub omitted the field rather than denying administration. */
  administrator: boolean | null;
}

/**
 * Builds the authorization boundary for every managed-update route.
 *
 * Every decision is made from what GitHub reports for the user's own token.
 * An installation or repository identifier supplied by a caller is therefore
 * only ever a selector among what GitHub already grants that user, and never a
 * grant in itself.
 */
export function createUpdateAccess(options: UpdateAccessOptions): UpdateAccess {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const githubRequest = createGitHubRequest(
    fetchImplementation,
    ACCESS_USER_AGENT,
  );

  /**
   * Reads the installed version from a repository's version lock.
   *
   * @returns The recorded version, or `null` when the repository carries no
   *   readable, valid lock and therefore cannot be managed.
   */
  const installedVersion = async (
    userToken: string,
    repository: AccessibleRepository,
  ): Promise<string | null> => {
    let body: unknown;
    try {
      body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/contents/velvet.lock.json?ref=${encodeURIComponent(repository.defaultBranch)}`,
        userToken,
      );
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
    if (
      !isRecord(body) ||
      body.type !== "file" ||
      body.encoding !== "base64" ||
      typeof body.content !== "string"
    ) {
      return null;
    }
    const source = Buffer.from(
      body.content.replace(/\s/gu, ""),
      "base64",
    ).toString("utf8");
    const parsed = parseVelvetVersionLock(source);
    return parsed.success ? parsed.data.installedVersion : null;
  };

  const installationRepositories = async (
    userToken: string,
    installationId: number,
  ): Promise<AccessibleRepository[]> => {
    const body = await githubRequest<unknown>(
      `/user/installations/${installationId}/repositories?per_page=${MAX_REPOSITORIES_PER_INSTALLATION}`,
      userToken,
    );
    if (!isRecord(body) || !Array.isArray(body.repositories)) {
      throw new Error("GitHub installation repositories response was invalid.");
    }
    return body.repositories.map(parseAccessibleRepository);
  };

  return {
    async list(userToken) {
      const installations = await options.github.listInstallations(userToken);
      const repositories: ManageableRepository[] = [];
      let lockReads = 0;
      let truncated = false;

      for (const installation of installations) {
        const accessible = await installationRepositories(
          userToken,
          installation.id,
        );
        if (accessible.length === MAX_REPOSITORIES_PER_INSTALLATION) {
          truncated = true;
        }
        // A repository whose administration GitHub does not report is kept in
        // the list, because `authorize` refuses it later anyway. Dropping it
        // here on a missing field would hide installations rather than protect
        // them.
        const candidates = accessible.filter(
          (repository) => repository.administrator !== false,
        );
        const budget = Math.max(0, MAX_LOCK_READS - lockReads);
        if (candidates.length > budget) truncated = true;
        const inspected = candidates.slice(0, budget);
        lockReads += inspected.length;

        for (const batch of chunk(inspected, LOCK_READ_CONCURRENCY)) {
          const versions = await Promise.all(
            batch.map((repository) => installedVersion(userToken, repository)),
          );
          batch.forEach((repository, index) => {
            repositories.push({
              installationId: installation.id,
              repositoryId: repository.id,
              owner: repository.owner,
              name: repository.name,
              htmlUrl: repository.htmlUrl,
              defaultBranch: repository.defaultBranch,
              installedVersion: versions[index]!,
            });
          });
        }
      }

      return { repositories, truncated };
    },

    async authorize(userToken, installationId, repositoryId) {
      if (!positiveInteger(installationId) || !positiveInteger(repositoryId)) {
        throw new UpdateAccessError();
      }
      const installations = await options.github.listInstallations(userToken);
      const installation = installations.find(
        (candidate) => candidate.id === installationId,
      );
      if (!installation) throw new UpdateAccessError();

      let body: unknown;
      try {
        body = await githubRequest<unknown>(
          `/repositories/${repositoryId}`,
          userToken,
        );
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) {
          throw new UpdateAccessError();
        }
        throw error;
      }
      const repository = parseAccessibleRepository(body);
      if (
        repository.administrator !== true ||
        repository.owner.toLowerCase() !== installation.accountLogin.toLowerCase()
      ) {
        throw new UpdateAccessError();
      }
      return {
        installationId,
        repositoryId,
        owner: repository.owner,
        name: repository.name,
        htmlUrl: repository.htmlUrl,
        defaultBranch: repository.defaultBranch,
        installedVersion: await installedVersion(userToken, repository),
      };
    },

    async readConfiguration(userToken, repository) {
      const body = await githubRequest<unknown>(
        `${contentsPath(repository)}?ref=${encodeURIComponent(repository.defaultBranch)}`,
        userToken,
      );
      if (
        !isRecord(body) ||
        body.type !== "file" ||
        body.encoding !== "base64" ||
        typeof body.content !== "string" ||
        typeof body.sha !== "string"
      ) {
        throw new Error("GitHub configuration response was invalid.");
      }
      return {
        source: Buffer.from(
          body.content.replace(/\s/gu, ""),
          "base64",
        ).toString("utf8"),
        blobSha: body.sha,
      };
    },

    async writeConfiguration(userToken, repository, source, blobSha, message) {
      const body = await githubRequest<unknown>(
        contentsPath(repository),
        userToken,
        {
          method: "PUT",
          body: JSON.stringify({
            message,
            content: Buffer.from(source, "utf8").toString("base64"),
            sha: blobSha,
            branch: repository.defaultBranch,
          }),
        },
      );
      if (
        !isRecord(body) ||
        !isRecord(body.commit) ||
        typeof body.commit.sha !== "string"
      ) {
        throw new Error("GitHub configuration write response was invalid.");
      }
      return body.commit.sha;
    },
  };
}

function contentsPath(repository: ManageableRepository): string {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/contents/velvet.yml`;
}

function parseAccessibleRepository(value: unknown): AccessibleRepository {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !isRecord(value.owner) ||
    typeof value.owner.login !== "string" ||
    typeof value.html_url !== "string" ||
    typeof value.default_branch !== "string" ||
    value.default_branch.length === 0
  ) {
    throw new Error("GitHub repository response was invalid.");
  }
  const permissions = value.permissions;
  return {
    id: value.id,
    owner: value.owner.login,
    name: value.name,
    htmlUrl: value.html_url,
    defaultBranch: value.default_branch,
    administrator: isRecord(permissions)
      ? permissions.admin === true
      : null,
  };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

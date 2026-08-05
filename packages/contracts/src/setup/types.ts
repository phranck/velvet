import type { NormalizedVelvetConfiguration } from "../configuration/types.js";

/** Whether the repository setup creates is visible to everybody. */
export type RepositoryVisibility = "public" | "private";

export interface SetupRequest {
  configuration: NormalizedVelvetConfiguration;
  /**
   * Whether GitHub should create the repository private.
   *
   * Absent means public, which is what every installation made before this
   * existed received. Publishing GitHub Pages from a private repository needs
   * a paid GitHub plan, so a private repository on a free account produces a
   * repository that works and a page that never appears.
   */
  repositoryVisibility?: RepositoryVisibility;
  /**
   * Whether setup may delete a repository already using the name.
   *
   * Absent means no. A repository holds Issues, history, and a published page,
   * and deleting it takes all three with nothing able to restore them, so this
   * is never inferred from anything: it is a second request that says so, sent
   * after somebody has been told what they would lose.
   */
  replaceExistingRepository?: boolean;
  /**
   * A logo for the status page's header.
   *
   * The file itself rather than a URL, because a URL would put somebody's
   * status page at the mercy of whatever host it names. It is written into
   * their own repository and served from their own page.
   */
  logo?: SetupLogo;
}

/** A logo as it travels with a setup request. */
export interface SetupLogo {
  /** What the file is, which decides the name it is written under. */
  type: "image/svg+xml" | "image/png" | "image/webp" | "image/jpeg";
  /** The file itself, base64 without a data-URL prefix. */
  content: string;
}

export interface SetupContractError {
  code: "INVALID_SETUP_REQUEST" | "INVALID_SETUP_CONTRACT";
  path: string;
  message: string;
}

export type SetupContractValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: SetupContractError[] };

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
}

export interface SetupContractError {
  code: "INVALID_SETUP_REQUEST" | "INVALID_SETUP_CONTRACT";
  path: string;
  message: string;
}

export type SetupContractValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: SetupContractError[] };

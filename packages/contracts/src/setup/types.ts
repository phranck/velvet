import type { NormalizedVelvetConfiguration } from "../configuration/types.js";

export interface SetupRequest {
  configuration: NormalizedVelvetConfiguration;
}

export interface SetupContractError {
  code: "INVALID_SETUP_REQUEST" | "INVALID_SETUP_CONTRACT";
  path: string;
  message: string;
}

export type SetupContractValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: SetupContractError[] };

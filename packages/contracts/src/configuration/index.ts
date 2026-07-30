export {
  CONFIGURATION_SCHEMA_VERSION,
  VelvetConfigurationSchema,
} from "./schemas.js";
export type {
  VelvetConfigurationInput,
  VelvetThemeInput,
} from "./schemas.js";
export {
  configurationIdentifierFromName,
  normalizeCustomDomain,
  parseVelvetConfiguration,
  validateVelvetConfiguration,
} from "./validation.js";
export type {
  ConfigurationValidationError,
  ConfigurationValidationErrorCode,
  ConfigurationValidationResult,
  NormalizedHttpCheck,
  NormalizedHttpHeader,
  NormalizedJsonAssertion,
  NormalizedService,
  NormalizedVelvetConfiguration,
} from "./types.js";

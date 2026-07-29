import type {
  VelvetConfigurationInput,
  VelvetThemeInput,
} from "./schemas.js";

export type ConfigurationValidationErrorCode =
  | "DUPLICATE_CONFIGURATION_CHECK_ID"
  | "DUPLICATE_CONFIGURATION_SERVICE_ID"
  | "DUPLICATE_HEADER_NAME"
  | "DUPLICATE_JSON_ASSERTION"
  | "FORBIDDEN_SECRET_INTERPOLATION"
  | "INCOMPATIBLE_CHECK_OPTIONS"
  | "INVALID_CONFIGURATION"
  | "INVALID_CONFIGURATION_IDENTIFIER"
  | "INVALID_CONFIGURATION_URL"
  | "INVALID_SECRET_REFERENCE"
  | "INVALID_SERVICE_CHECKS"
  | "UNSAFE_JSON_ASSERTION"
  | "UNSAFE_REQUEST_HEADER"
  | "UNSUPPORTED_CONFIGURATION_METHOD"
  | "UNSUPPORTED_CONFIGURATION_STATUS_CODE"
  | "UNSUPPORTED_CONFIGURATION_VERSION";

export interface ConfigurationValidationError {
  code: ConfigurationValidationErrorCode;
  path: string;
  message: string;
}

export type ConfigurationValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ConfigurationValidationError[] };

export interface NormalizedHttpHeader {
  name: string;
  secret: string;
}

export interface NormalizedJsonAssertion {
  path: string;
  equals: string | number | boolean | null;
}

export interface NormalizedHttpCheck {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  expectedStatusCodes: number[];
  maxRedirects: number;
  timeoutMs: number;
  headers: NormalizedHttpHeader[];
  jsonAssertions: NormalizedJsonAssertion[];
}

export interface NormalizedService {
  id: string;
  name: string;
  checks: NormalizedHttpCheck[];
}

export interface NormalizedVelvetConfiguration {
  schemaVersion: 1;
  repository: VelvetConfigurationInput["repository"];
  statusPage: {
    name: string;
    layout: "grouped" | "cards";
    defaultRange: "24h" | "7d" | "30d" | "90d" | "1yr";
    logoHeight: number;
    showPoweredBy: boolean;
    navigation: Array<{ title: string; href: string }>;
    icons: Record<string, string>;
    customDomain?: string;
    logoUrl?: string;
    theme?: VelvetThemeInput;
    fonts?: { sans?: string; mono?: string };
    analytics?: VelvetConfigurationInput["statusPage"]["analytics"];
    seo?: VelvetConfigurationInput["statusPage"]["seo"];
  };
  services: NormalizedService[];
  incidents: {
    failureThreshold: number;
    recoveryThreshold: number;
    incidentLabel: string;
    maintenanceLabel: string;
  };
  history: { retentionDays: number };
}

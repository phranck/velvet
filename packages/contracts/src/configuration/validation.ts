import { Value } from "@sinclair/typebox/value";
import { load } from "js-yaml";

import {
  CONFIGURATION_SCHEMA_VERSION,
  VelvetConfigurationSchema,
  type VelvetConfigurationInput,
} from "./schemas.js";
import type {
  ConfigurationValidationError,
  ConfigurationValidationErrorCode,
  ConfigurationValidationResult,
  NormalizedHttpCheck,
  NormalizedService,
  NormalizedVelvetConfiguration,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const SECRET_INTERPOLATION = /\$(?:\{[A-Z_][A-Z0-9_]*\}|[A-Z_][A-Z0-9_]*)/;
const ENVIRONMENT_VARIABLE = /^[A-Z_][A-Z0-9_]*$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const UNSAFE_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const UNSAFE_JSON_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const configurationError = (
  code: ConfigurationValidationErrorCode,
  path: string,
  message: string,
): ConfigurationValidationError => ({ code, path, message });

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const escapePointerSegment = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

function inspectVersion(value: unknown): ConfigurationValidationError[] {
  if (
    !isRecord(value) ||
    !("schemaVersion" in value) ||
    value.schemaVersion === CONFIGURATION_SCHEMA_VERSION
  ) {
    return [];
  }

  return [
    configurationError(
      "UNSUPPORTED_CONFIGURATION_VERSION",
      "/schemaVersion",
      "Configuration schemaVersion must be 1.",
    ),
  ];
}

function inspectInterpolation(
  value: unknown,
  path = "",
): ConfigurationValidationError[] {
  if (typeof value === "string") {
    return SECRET_INTERPOLATION.test(value)
      ? [
          configurationError(
            "FORBIDDEN_SECRET_INTERPOLATION",
            path || "/",
            "Configuration strings must not interpolate environment secrets. Use a header secret reference instead.",
          ),
        ]
      : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      inspectInterpolation(entry, `${path}/${index}`),
    );
  }

  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    inspectInterpolation(entry, `${path}/${escapePointerSegment(key)}`),
  );
}

function parseHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function inspectUrl(
  value: unknown,
  path: string,
): ConfigurationValidationError[] {
  if (typeof value !== "string" || parseHttpUrl(value) !== null) return [];
  return [
    configurationError(
      "INVALID_CONFIGURATION_URL",
      path,
      "URL must be an absolute HTTP(S) URL without credentials or a fragment.",
    ),
  ];
}

function inspectJsonPointer(
  value: unknown,
  path: string,
): ConfigurationValidationError[] {
  if (typeof value !== "string") return [];
  const validEscape = !/~(?:[^01]|$)/.test(value);
  const segments = value
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (
    !value.startsWith("/") ||
    !validEscape ||
    segments.some((segment) => UNSAFE_JSON_SEGMENTS.has(segment))
  ) {
    return [
      configurationError(
        "UNSAFE_JSON_ASSERTION",
        path,
        "JSON assertion paths must be safe RFC 6901 pointers.",
      ),
    ];
  }
  return [];
}

function inspectCheck(
  value: unknown,
  path: string,
): ConfigurationValidationError[] {
  if (!isRecord(value)) return [];
  const errors = [
    ...inspectUrl(value.url, `${path}/url`),
  ];

  if (
    typeof value.method === "string" &&
    value.method !== "GET" &&
    value.method !== "HEAD"
  ) {
    errors.push(
      configurationError(
        "UNSUPPORTED_CONFIGURATION_METHOD",
        `${path}/method`,
        "HTTP method must be GET or HEAD.",
      ),
    );
  }

  if (
    value.method === "HEAD" &&
    Array.isArray(value.jsonAssertions) &&
    value.jsonAssertions.length > 0
  ) {
    errors.push(
      configurationError(
        "INCOMPATIBLE_CHECK_OPTIONS",
        `${path}/jsonAssertions`,
        "JSON assertions require GET because HEAD responses have no body.",
      ),
    );
  }

  if (Array.isArray(value.expectedStatusCodes)) {
    value.expectedStatusCodes.forEach((statusCode, index) => {
      if (
        typeof statusCode === "number" &&
        (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)
      ) {
        errors.push(
          configurationError(
            "UNSUPPORTED_CONFIGURATION_STATUS_CODE",
            `${path}/expectedStatusCodes/${index}`,
            "Expected HTTP status codes must be integers from 100 through 599.",
          ),
        );
      }
    });
  }

  if (Array.isArray(value.headers)) {
    const headerNames = new Set<string>();
    value.headers.forEach((header, index) => {
      if (!isRecord(header)) return;
      if (typeof header.name === "string") {
        const canonicalName = header.name.toLowerCase();
        if (headerNames.has(canonicalName)) {
          errors.push(
            configurationError(
              "DUPLICATE_HEADER_NAME",
              `${path}/headers/${index}/name`,
              "HTTP header names must be unique within a check.",
            ),
          );
        }
        headerNames.add(canonicalName);
        if (!HEADER_NAME.test(header.name)) {
          errors.push(
            configurationError(
              "INVALID_CONFIGURATION",
              `${path}/headers/${index}/name`,
              "HTTP header name is invalid.",
            ),
          );
        } else if (UNSAFE_REQUEST_HEADERS.has(canonicalName)) {
          errors.push(
            configurationError(
              "UNSAFE_REQUEST_HEADER",
              `${path}/headers/${index}/name`,
              "HTTP header must not control request routing, framing, or connection behavior.",
            ),
          );
        }
      }
      if (
        typeof header.secret === "string" &&
        !ENVIRONMENT_VARIABLE.test(header.secret)
      ) {
        errors.push(
          configurationError(
            "INVALID_SECRET_REFERENCE",
            `${path}/headers/${index}/secret`,
            "Header secrets must reference an uppercase environment-variable name without a dollar sign.",
          ),
        );
      }
    });
  }

  if (Array.isArray(value.jsonAssertions)) {
    const assertionPaths = new Set<string>();
    value.jsonAssertions.forEach((assertion, index) => {
      if (!isRecord(assertion)) return;
      const assertionPath = `${path}/jsonAssertions/${index}/path`;
      errors.push(...inspectJsonPointer(assertion.path, assertionPath));
      if (typeof assertion.path === "string") {
        if (assertionPaths.has(assertion.path)) {
          errors.push(
            configurationError(
              "DUPLICATE_JSON_ASSERTION",
              assertionPath,
              "JSON assertion paths must be unique within a check.",
            ),
          );
        }
        assertionPaths.add(assertion.path);
      }
    });
  }

  return errors;
}

function inspectConfiguration(value: unknown): ConfigurationValidationError[] {
  if (!isRecord(value)) return [];
  const errors: ConfigurationValidationError[] = [];
  const statusPage = value.statusPage;
  if (isRecord(statusPage)) {
    errors.push(...inspectUrl(statusPage.logoUrl, "/statusPage/logoUrl"));
    if (Array.isArray(statusPage.navigation)) {
      statusPage.navigation.forEach((entry, index) => {
        if (!isRecord(entry) || typeof entry.href !== "string") return;
        if (entry.href.startsWith("/")) return;
        errors.push(
          ...inspectUrl(entry.href, `/statusPage/navigation/${index}/href`),
        );
      });
    }
    if (isRecord(statusPage.analytics) && isRecord(statusPage.analytics.umami)) {
      errors.push(
        ...inspectUrl(
          statusPage.analytics.umami.src,
          "/statusPage/analytics/umami/src",
        ),
      );
    }
    if (isRecord(statusPage.seo)) {
      errors.push(...inspectUrl(statusPage.seo.image, "/statusPage/seo/image"));
    }
  }

  if (!Array.isArray(value.services)) return errors;
  value.services.forEach((service, serviceIndex) => {
    if (!isRecord(service)) return;
    const path = `/services/${serviceIndex}`;
    const hasUrl = service.url !== undefined;
    const hasChecks = service.checks !== undefined;
    if (hasUrl === hasChecks) {
      errors.push(
        configurationError(
          "INVALID_SERVICE_CHECKS",
          path,
          "A service must set either url or checks, but not both.",
        ),
      );
    }
    if (hasUrl) errors.push(...inspectUrl(service.url, `${path}/url`));
    if (Array.isArray(service.checks)) {
      service.checks.forEach((check, checkIndex) => {
        errors.push(...inspectCheck(check, `${path}/checks/${checkIndex}`));
      });
    }
  });
  return errors;
}

export function configurationIdentifierFromName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolvedIdentifier(
  id: string | undefined,
  name: string,
  path: string,
): { id?: string; error?: ConfigurationValidationError } {
  const resolved = id ?? configurationIdentifierFromName(name);
  if (!resolved || resolved.length > 64) {
    return {
      error: configurationError(
        "INVALID_CONFIGURATION_IDENTIFIER",
        path,
        "Name cannot produce a valid identifier; set an explicit lowercase kebab-case id.",
      ),
    };
  }
  return { id: resolved };
}

function normalizeCheck(
  check: VelvetConfigurationInput["services"][number]["checks"] extends
    | Array<infer Entry>
    | undefined
    ? Entry
    : never,
  path: string,
  defaultId?: string,
): { data?: NormalizedHttpCheck; error?: ConfigurationValidationError } {
  const identifier = resolvedIdentifier(
    check.id ?? defaultId,
    check.name,
    `${path}/id`,
  );
  if (!identifier.id) {
    return {
      error:
        identifier.error ??
        configurationError(
          "INVALID_CONFIGURATION_IDENTIFIER",
          `${path}/id`,
          "Check identifier is invalid.",
        ),
    };
  }

  const url = parseHttpUrl(check.url);
  if (url === null) {
    return {
      error: configurationError(
        "INVALID_CONFIGURATION_URL",
        `${path}/url`,
        "URL must be an absolute HTTP(S) URL without credentials or a fragment.",
      ),
    };
  }

  return {
    data: {
      id: identifier.id,
      name: check.name,
      url,
      method: check.method === "HEAD" ? "HEAD" : "GET",
      expectedStatusCodes: [...(check.expectedStatusCodes ?? [200])],
      maxRedirects: check.maxRedirects ?? 5,
      timeoutMs: check.timeoutMs ?? 10_000,
      headers: (check.headers ?? []).map((header) => ({ ...header })),
      jsonAssertions: (check.jsonAssertions ?? []).map((assertion) => ({
        ...assertion,
      })),
    },
  };
}

function normalizeServices(
  services: VelvetConfigurationInput["services"],
): ConfigurationValidationResult<NormalizedService[]> {
  const normalized: NormalizedService[] = [];
  const serviceIds = new Set<string>();

  for (const [serviceIndex, service] of services.entries()) {
    const servicePath = `/services/${serviceIndex}`;
    const identifier = resolvedIdentifier(
      service.id,
      service.name,
      `${servicePath}/id`,
    );
    if (!identifier.id) return { success: false, errors: [identifier.error!] };
    if (serviceIds.has(identifier.id)) {
      return {
        success: false,
        errors: [
          configurationError(
            "DUPLICATE_CONFIGURATION_SERVICE_ID",
            `${servicePath}/id`,
            "Service identifiers must be unique.",
          ),
        ],
      };
    }
    serviceIds.add(identifier.id);

    const inputChecks = service.url
      ? [{ name: service.name, url: service.url }]
      : service.checks!;
    const checks: NormalizedHttpCheck[] = [];
    const checkIds = new Set<string>();
    for (const [checkIndex, check] of inputChecks.entries()) {
      const checkPath = service.url
        ? `${servicePath}/url`
        : `${servicePath}/checks/${checkIndex}`;
      const result = normalizeCheck(
        check,
        checkPath,
        service.url ? identifier.id : undefined,
      );
      if (!result.data) return { success: false, errors: [result.error!] };
      if (checkIds.has(result.data.id)) {
        return {
          success: false,
          errors: [
            configurationError(
              "DUPLICATE_CONFIGURATION_CHECK_ID",
              `${checkPath}/id`,
              "Check identifiers must be unique within a service.",
            ),
          ],
        };
      }
      checkIds.add(result.data.id);
      checks.push(result.data);
    }
    normalized.push({ id: identifier.id, name: service.name, checks });
  }

  return { success: true, data: normalized };
}

function normalizeConfiguration(
  value: VelvetConfigurationInput,
): ConfigurationValidationResult<NormalizedVelvetConfiguration> {
  const services = normalizeServices(value.services);
  if (!services.success) return services;

  const statusPage = value.statusPage;
  return {
    success: true,
    data: {
      schemaVersion: CONFIGURATION_SCHEMA_VERSION,
      repository: { ...value.repository },
      statusPage: {
        name: statusPage.name,
        layout: statusPage.layout ?? "grouped",
        defaultRange: statusPage.defaultRange ?? "30d",
        logoHeight: statusPage.logoHeight ?? 72,
        showPoweredBy: statusPage.showPoweredBy ?? true,
        navigation: (statusPage.navigation ?? []).map((entry) => ({ ...entry })),
        icons: { ...(statusPage.icons ?? {}) },
        ...(statusPage.customDomain
          ? { customDomain: statusPage.customDomain }
          : {}),
        ...(statusPage.logoUrl
          ? { logoUrl: parseHttpUrl(statusPage.logoUrl)! }
          : {}),
        ...(statusPage.theme ? { theme: structuredClone(statusPage.theme) } : {}),
        ...(statusPage.fonts ? { fonts: { ...statusPage.fonts } } : {}),
        ...(statusPage.analytics
          ? { analytics: structuredClone(statusPage.analytics) }
          : {}),
        ...(statusPage.seo ? { seo: { ...statusPage.seo } } : {}),
      },
      services: services.data,
      incidents: {
        failureThreshold: value.incidents?.failureThreshold ?? 2,
        recoveryThreshold: value.incidents?.recoveryThreshold ?? 2,
        incidentLabel: value.incidents?.incidentLabel ?? "incident",
        maintenanceLabel: value.incidents?.maintenanceLabel ?? "maintenance",
      },
      history: { retentionDays: value.history?.retentionDays ?? 365 },
    },
  };
}

export function validateVelvetConfiguration(
  value: unknown,
): ConfigurationValidationResult<NormalizedVelvetConfiguration> {
  const versionErrors = inspectVersion(value);
  if (versionErrors.length > 0) return { success: false, errors: versionErrors };

  const interpolationErrors = inspectInterpolation(value);
  if (interpolationErrors.length > 0) {
    return { success: false, errors: interpolationErrors };
  }

  const inspectionErrors = inspectConfiguration(value);
  if (inspectionErrors.length > 0) {
    return { success: false, errors: inspectionErrors };
  }

  if (!Value.Check(VelvetConfigurationSchema, value)) {
    const error = Value.Errors(VelvetConfigurationSchema, value).First();
    return {
      success: false,
      errors: [
        configurationError(
          "INVALID_CONFIGURATION",
          error?.path || "/",
          "Configuration does not match the Velvet schema at the reported path.",
        ),
      ],
    };
  }

  return normalizeConfiguration(value);
}

export function parseVelvetConfiguration(
  source: string,
): ConfigurationValidationResult<NormalizedVelvetConfiguration> {
  let value: unknown;
  try {
    value = load(source);
  } catch {
    return {
      success: false,
      errors: [
        configurationError(
          "INVALID_CONFIGURATION",
          "/",
          "Configuration YAML could not be parsed.",
        ),
      ],
    };
  }
  return validateVelvetConfiguration(value);
}

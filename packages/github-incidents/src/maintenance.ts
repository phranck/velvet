import type {
  MaintenanceMetadata,
  MaintenanceParseResult,
  MaintenanceService,
  MaintenanceTarget,
  MaintenanceValidationError,
  MaintenanceValidationErrorCode,
} from "./types.js";

const EXPLICIT_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const TARGET_TOKEN = /\[([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\/(\*|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\]$/u;
const METADATA_MARKER = /\n*<!-- velvet-metadata:[\s\S]*? -->\n*/gu;

function validationError(
  code: MaintenanceValidationErrorCode,
  field: string,
  message: string,
): MaintenanceValidationError {
  return { code, field, message };
}

function formFields(body: string): Map<string, string> | null {
  const headings = [...body.matchAll(/^###\s+(.+?)\s*$/gmu)];
  const fields = new Map<string, string>();
  for (const [index, heading] of headings.entries()) {
    const label = heading[1]?.trim();
    if (label === undefined || fields.has(label)) return null;
    const startsAt = (heading.index ?? 0) + heading[0].length;
    const endsAt = headings[index + 1]?.index ?? body.length;
    fields.set(label, body.slice(startsAt, endsAt).trim());
  }
  return fields;
}

function timestamp(value: string): string | null {
  if (!EXPLICIT_TIMESTAMP.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function parseTargets(
  source: string,
  services: MaintenanceService[],
): { targets: MaintenanceTarget[]; errors: MaintenanceValidationError[] } {
  const selections = source
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^-\s+/u, ""))
    .filter((line) => line !== "" && line !== "_No response_");
  if (selections.length === 0) {
    return {
      targets: [],
      errors: [
        validationError(
          "MISSING_MAINTENANCE_FIELD",
          "affected-targets",
          "Select at least one affected service or check.",
        ),
      ],
    };
  }

  const targets: MaintenanceTarget[] = [];
  const identities = new Set<string>();
  const serviceWide = new Set<string>();
  const errors: MaintenanceValidationError[] = [];
  for (const selection of selections) {
    const token = selection.match(TARGET_TOKEN);
    if (token === null) {
      errors.push(
        validationError(
          "UNKNOWN_MAINTENANCE_TARGET",
          "affected-targets",
          "A selected target is not configured.",
        ),
      );
      continue;
    }
    const serviceId = token[1]!;
    const checkToken = token[2]!;
    const checkId = checkToken === "*" ? null : checkToken;
    const service = services.find(({ id }) => id === serviceId);
    if (
      service === undefined ||
      (checkId !== null && !service.checks.some(({ id }) => id === checkId))
    ) {
      errors.push(
        validationError(
          "UNKNOWN_MAINTENANCE_TARGET",
          "affected-targets",
          `The selected target ${serviceId}/${checkToken} is not configured.`,
        ),
      );
      continue;
    }

    const identity = `${serviceId}\u0000${checkId ?? "*"}`;
    const overlapsWholeService =
      (checkId === null && targets.some((target) => target.serviceId === serviceId)) ||
      (checkId !== null && serviceWide.has(serviceId));
    if (identities.has(identity) || overlapsWholeService) {
      errors.push(
        validationError(
          "DUPLICATE_MAINTENANCE_TARGET",
          "affected-targets",
          `The selected target ${serviceId}/${checkToken} overlaps another selection.`,
        ),
      );
      continue;
    }
    identities.add(identity);
    if (checkId === null) serviceWide.add(serviceId);
    targets.push({ serviceId, checkId });
  }
  return { targets, errors };
}

export function parseMaintenanceIssueBody(
  body: string,
  services: MaintenanceService[],
): MaintenanceParseResult {
  const fields = formFields(body);
  if (fields === null) {
    return {
      success: false,
      errors: [
        validationError(
          "MISSING_MAINTENANCE_FIELD",
          "body",
          "The maintenance form headings are missing or duplicated.",
        ),
      ],
    };
  }

  const affectedTargets = fields.get("Affected services and checks") ?? "";
  const startsAtSource = fields.get("Starts at") ?? "";
  const endsAtSource = fields.get("Ends at") ?? "";
  const summary = (fields.get("Summary") ?? "")
    .replace(METADATA_MARKER, "\n")
    .trim();
  const targetResult = parseTargets(affectedTargets, services);
  const startsAt = timestamp(startsAtSource);
  const endsAt = timestamp(endsAtSource);
  const errors = [...targetResult.errors];
  if (startsAt === null) {
    errors.push(
      validationError(
        "INVALID_MAINTENANCE_TIMESTAMP",
        "starts-at",
        "Start must be an ISO 8601 timestamp with an explicit time zone.",
      ),
    );
  }
  if (endsAt === null) {
    errors.push(
      validationError(
        "INVALID_MAINTENANCE_TIMESTAMP",
        "ends-at",
        "End must be an ISO 8601 timestamp with an explicit time zone.",
      ),
    );
  }
  if (
    summary === "" ||
    summary === "_No response_" ||
    summary.length > 2_000
  ) {
    errors.push(
      validationError(
        "MISSING_MAINTENANCE_FIELD",
        "summary",
        "Add a brief maintenance summary.",
      ),
    );
  }
  if (
    startsAt !== null &&
    endsAt !== null &&
    Date.parse(startsAt) >= Date.parse(endsAt)
  ) {
    errors.push(
      validationError(
        "INVALID_MAINTENANCE_WINDOW",
        "ends-at",
        "Maintenance must end after it starts.",
      ),
    );
  }

  if (errors.length > 0 || startsAt === null || endsAt === null) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      schemaVersion: 1,
      kind: "maintenance",
      targets: targetResult.targets,
      startsAt,
      endsAt,
      summary,
    },
  };
}

export function resolveMaintenanceWindow(
  metadata: MaintenanceMetadata,
  issue: { state: "open" | "closed"; closedAt: string | null },
): MaintenanceMetadata | null {
  if (issue.state === "open") return metadata;
  if (issue.closedAt === null) return null;
  const closedAt = timestamp(issue.closedAt);
  if (closedAt === null || Date.parse(closedAt) <= Date.parse(metadata.startsAt)) {
    return null;
  }
  return Date.parse(closedAt) < Date.parse(metadata.endsAt)
    ? { ...metadata, endsAt: closedAt }
    : metadata;
}

export function maintenanceCovers(
  metadata: MaintenanceMetadata,
  serviceId: string,
  checkId: string,
  at: string,
): boolean {
  const atTimestamp = Date.parse(at);
  return (
    atTimestamp >= Date.parse(metadata.startsAt) &&
    atTimestamp < Date.parse(metadata.endsAt) &&
    metadata.targets.some(
      (target) =>
        target.serviceId === serviceId &&
        (target.checkId === null || target.checkId === checkId),
    )
  );
}

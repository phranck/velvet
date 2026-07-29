import { createHash } from "node:crypto";

import {
  CONTRACT_SCHEMA_VERSION,
  parseVelvetConfiguration,
  validateIncidentsDocument,
  type IncidentsDocument,
  type VelvetConfigurationInput,
} from "@velvet/contracts";
import {
  MONITOR_STATE_SCHEMA_VERSION,
  createResponseTimesDocument,
  createStatusDocument,
  type MonitorCheckState,
  type MonitorImportedDailyAvailability,
  type MonitorMaintenanceWindow,
  type MonitorPersistentState,
  type MonitorResponseSample,
  type MonitorServiceState,
  type MonitorStatus,
} from "@velvet/monitor";
import { JSON_SCHEMA, dump, load } from "js-yaml";

import { UpptimeAdapterError } from "./errors.js";
import type {
  UpptimeMigrationFinding,
  UpptimeMigrationIssueSource,
  UpptimeMigrationOmission,
  UpptimeMigrationReport,
  UpptimeMigrationRequiredSecret,
  UpptimeMigrationResult,
  UpptimeMigrationSource,
} from "./migration-types.js";
import type {
  UpptimeCommit,
  UpptimeIssue,
  UpptimeSnapshot,
} from "./types.js";

const DAY_MS = 86_400_000;
const RETENTION_DAYS = 365;
const UNSAFE_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const UNSUPPORTED_BODY_OPTIONS = [
  "__dangerous__body_down",
  "__dangerous__body_degraded",
  "__dangerous__body_down_if_text_missing",
  "__dangerous__body_degraded_if_text_missing",
] as const;
const HANDLED_SITE_OPTIONS = new Set([
  "name",
  "slug",
  "url",
  "method",
  "check",
  "headers",
  "body",
  "expectedStatusCodes",
  "ipv6",
  "type",
  ...UNSUPPORTED_BODY_OPTIONS,
]);

type UnknownRecord = Record<string, unknown>;

interface ParsedConfiguration {
  owner: string | null;
  repo: string | null;
  raw: UnknownRecord;
  statusWebsite: UnknownRecord;
  sites: ParsedSite[];
}

interface ParsedSite {
  id: string;
  name: string;
  slug: string;
  raw: UnknownRecord;
}

interface ParsedSummary {
  status: string;
  time: number;
  dailyMinutesDown: Record<string, number>;
}

interface ParsedHistory {
  lastUpdated: string;
  startTime: string;
}

interface PreparedService {
  id: string;
  name: string;
  check: VelvetConfigurationInput["services"][number]["checks"] extends
    | Array<infer Check>
    | undefined
    ? Check
    : never;
  summary: ParsedSummary;
  history: ParsedHistory;
  responseSamples: MonitorResponseSample[];
  latestStatusCode: number | null;
}

interface MigrationContext {
  source: UpptimeMigrationSource;
  omissions: UpptimeMigrationOmission[];
  findings: UpptimeMigrationFinding[];
  requiredSecrets: UpptimeMigrationRequiredSecret[];
  usedSecretNames: Map<string, string>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTimestamp(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Missing timestamp for ${context}`,
    );
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Invalid timestamp for ${context}`,
    );
  }
  return new Date(timestamp).toISOString();
}

function parseConfiguration(source: string): ParsedConfiguration {
  let value: unknown;
  try {
    value = load(source, { schema: JSON_SCHEMA });
  } catch (cause) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime configuration YAML",
      { cause },
    );
  }
  if (!isRecord(value) || !Array.isArray(value.sites)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime configuration",
    );
  }
  const sites = value.sites.map((entry, index): ParsedSite => {
    if (!isRecord(entry) || typeof entry.name !== "string") {
      throw new UpptimeAdapterError(
        "INVALID_INPUT",
        `Invalid Upptime site at index ${index}`,
      );
    }
    const slug = typeof entry.slug === "string" ? entry.slug : slugify(entry.name);
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(slug)) {
      throw new UpptimeAdapterError(
        "INVALID_INPUT",
        `Invalid Upptime site slug at index ${index}`,
      );
    }
    return { id: slug, name: entry.name, slug, raw: entry };
  });
  return {
    owner: typeof value.owner === "string" ? value.owner : null,
    repo: typeof value.repo === "string" ? value.repo : null,
    raw: value,
    statusWebsite: isRecord(value["status-website"])
      ? value["status-website"]
      : {},
    sites,
  };
}

function reportUnsupportedConfigurationOptions(
  parsed: ParsedConfiguration,
  context: MigrationContext,
): void {
  const handledRootOptions = new Set([
    "owner",
    "repo",
    "sites",
    "status-website",
  ]);
  for (const option of Object.keys(parsed.raw)
    .filter((key) => !handledRootOptions.has(key))
    .sort()) {
    finding(
      context,
      "UNSUPPORTED_CONFIGURATION_OPTION",
      `.upptimerc.yml#${option}`,
      `The Upptime repository option ${option} was not copied to Velvet.`,
    );
  }
  const handledStatusWebsiteOptions = new Set(["name", "cname", "logoUrl"]);
  for (const option of Object.keys(parsed.statusWebsite)
    .filter((key) => !handledStatusWebsiteOptions.has(key))
    .sort()) {
    finding(
      context,
      "UNSUPPORTED_CONFIGURATION_OPTION",
      `.upptimerc.yml#status-website/${option}`,
      `The Upptime status-page option ${option} was not copied to Velvet.`,
    );
  }
}

function parseSummaryEntries(source: string): Map<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (cause) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime summary JSON",
      { cause },
    );
  }
  if (!Array.isArray(value)) {
    throw new UpptimeAdapterError("INVALID_INPUT", "Invalid Upptime summary");
  }
  const summaries = new Map<string, unknown>();
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.slug === "string") {
      summaries.set(entry.slug, entry);
    }
  }
  return summaries;
}

function parseSummary(value: unknown): ParsedSummary {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    !["up", "down", "degraded"].includes(value.status) ||
    typeof value.time !== "number" ||
    !Number.isFinite(value.time) ||
    value.time < 0 ||
    !isRecord(value.dailyMinutesDown)
  ) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime summary entry",
    );
  }
  const dailyMinutesDown: Record<string, number> = {};
  for (const [date, minutes] of Object.entries(value.dailyMinutesDown)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      typeof minutes !== "number" ||
      !Number.isFinite(minutes) ||
      minutes < 0
    ) {
      throw new UpptimeAdapterError(
        "INVALID_INPUT",
        "Invalid Upptime daily downtime entry",
      );
    }
    dailyMinutesDown[date] = minutes;
  }
  return { status: value.status, time: value.time, dailyMinutesDown };
}

function parseHistory(source: string, slug: string): ParsedHistory {
  let value: unknown;
  try {
    value = load(source, { schema: JSON_SCHEMA });
  } catch (cause) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Invalid Upptime history for ${slug}`,
      { cause },
    );
  }
  if (!isRecord(value)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Invalid Upptime history for ${slug}`,
    );
  }
  return {
    lastUpdated: normalizeTimestamp(value.lastUpdated, `${slug} lastUpdated`),
    startTime: normalizeTimestamp(value.startTime, `${slug} startTime`),
  };
}

function omission(
  context: MigrationContext,
  code: string,
  source: string,
  message: string,
  serviceId?: string,
): void {
  context.omissions.push({
    code,
    source,
    message,
    ...(serviceId === undefined ? {} : { serviceId }),
  });
}

function finding(
  context: MigrationContext,
  code: string,
  source: string,
  message: string,
  serviceId?: string,
): void {
  context.findings.push({
    code,
    source,
    message,
    ...(serviceId === undefined ? {} : { serviceId }),
  });
}

function secretEnvironmentName(
  serviceId: string,
  header: string,
  context: MigrationContext,
): string {
  const component = header
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = `VELVET_${serviceId.toUpperCase().replaceAll("-", "_")}_${component}`;
  const identity = `${serviceId}\u0000${header.toLowerCase()}`;
  const existing = context.usedSecretNames.get(base);
  if (existing === undefined || existing === identity) {
    context.usedSecretNames.set(base, identity);
    return base;
  }
  const suffix = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  const name = `${base}_${suffix}`;
  context.usedSecretNames.set(name, identity);
  return name;
}

function parsedHeaders(
  site: ParsedSite,
  context: MigrationContext,
): Array<{ name: string; secret: string }> | null {
  const rawHeaders = site.raw.headers;
  if (rawHeaders === undefined) return [];
  if (!Array.isArray(rawHeaders)) {
    omission(
      context,
      "UNSUPPORTED_HEADERS",
      ".upptimerc.yml",
      "The site headers are not an Upptime string list.",
      site.id,
    );
    return null;
  }
  const headerNames = new Set<string>();
  const headers: Array<{ name: string; secret: string }> = [];
  for (const rawHeader of rawHeaders) {
    if (typeof rawHeader !== "string" || !rawHeader.includes(":")) {
      omission(
        context,
        "UNSUPPORTED_HEADERS",
        ".upptimerc.yml",
        "The site contains a malformed request header.",
        site.id,
      );
      return null;
    }
    const separator = rawHeader.indexOf(":");
    const name = rawHeader.slice(0, separator).trim();
    const value = rawHeader.slice(separator + 1).trim();
    const normalizedName = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) ||
      UNSAFE_HEADERS.has(normalizedName) ||
      headerNames.has(normalizedName)
    ) {
      omission(
        context,
        "UNSUPPORTED_HEADERS",
        ".upptimerc.yml",
        "The site contains an unsafe or duplicate request header.",
        site.id,
      );
      return null;
    }
    headerNames.add(normalizedName);
    const environmentVariable = secretEnvironmentName(site.id, name, context);
    const sourceSecretNames = [
      ...new Set(
        [...value.matchAll(/\$([A-Z_][A-Z0-9_]*)/gu)]
          .map((match) => match[1])
          .filter((entry): entry is string => entry !== undefined),
      ),
    ].sort();
    if (sourceSecretNames.length === 0) {
      finding(
        context,
        "PLAINTEXT_HEADER_CREDENTIAL",
        `.upptimerc.yml#sites/${site.id}/headers/${name}`,
        "The source contains a literal request-header value. Its value was not copied and must be created as a GitHub Secret.",
        site.id,
      );
    }
    context.requiredSecrets.push({
      environmentVariable,
      githubSecret: environmentVariable,
      workflowValue: `\${{ secrets.${environmentVariable} }}`,
      serviceId: site.id,
      header: name,
      sourceSecretNames,
    });
    headers.push({ name, secret: environmentVariable });
  }
  return headers;
}

function expectedStatusCodes(
  site: ParsedSite,
  context: MigrationContext,
): number[] | null {
  const value = site.raw.expectedStatusCodes;
  if (value === undefined) {
    finding(
      context,
      "DEFAULT_STATUS_CODES_NARROWED",
      ".upptimerc.yml",
      "Upptime's broad default was replaced with Velvet's explicit HTTP 200 default.",
      site.id,
    );
    return [200];
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 32 ||
    value.some(
      (entry) =>
        !Number.isInteger(entry) ||
        (entry as number) < 100 ||
        (entry as number) > 599,
    )
  ) {
    omission(
      context,
      "UNSUPPORTED_STATUS_CODES",
      ".upptimerc.yml",
      "The expected status-code list cannot be represented safely by Velvet.",
      site.id,
    );
    return null;
  }
  return [...new Set(value as number[])].sort((left, right) => left - right);
}

function prepareCheck(
  site: ParsedSite,
  context: MigrationContext,
): PreparedService["check"] | null {
  const source = ".upptimerc.yml";
  if (
    site.raw.ipv6 === true ||
    site.slug.endsWith("-ipv6") ||
    site.raw.type === "globalping"
  ) {
    omission(
      context,
      "IPV6_OR_GLOBALPING_OMITTED",
      source,
      "Legacy IPv6 or Globalping checks are not active in Velvet.",
      site.id,
    );
    return null;
  }
  const unsupportedOptions = Object.keys(site.raw)
    .filter((key) => !HANDLED_SITE_OPTIONS.has(key))
    .sort();
  if (unsupportedOptions.length > 0) {
    for (const option of unsupportedOptions) {
      omission(
        context,
        "UNSUPPORTED_SITE_OPTION",
        `${source}#sites/${site.id}/${option}`,
        `The Upptime site option ${option} cannot be represented safely by Velvet.`,
        site.id,
      );
    }
    return null;
  }
  if (
    (site.raw.ipv6 !== undefined && site.raw.ipv6 !== false) ||
    site.raw.type !== undefined
  ) {
    omission(
      context,
      "UNSUPPORTED_SITE_OPTION",
      source,
      "The site's IPv6 or check-provider option is unsupported.",
      site.id,
    );
    return null;
  }
  if (
    site.raw.check !== undefined &&
    site.raw.check !== "http" &&
    site.raw.check !== "https"
  ) {
    omission(
      context,
      "UNSUPPORTED_CHECK_TYPE",
      source,
      "Velvet migration supports HTTP checks only.",
      site.id,
    );
    return null;
  }
  const method = site.raw.method === undefined ? "GET" : site.raw.method;
  if (method !== "GET" && method !== "HEAD") {
    omission(
      context,
      "UNSUPPORTED_METHOD",
      source,
      "Velvet supports GET and HEAD checks only.",
      site.id,
    );
    return null;
  }
  if (
    site.raw.body !== undefined ||
    UNSUPPORTED_BODY_OPTIONS.some((key) => site.raw[key] !== undefined)
  ) {
    omission(
      context,
      "UNSUPPORTED_RESPONSE_OR_REQUEST_BODY",
      source,
      "The site's request or response-body behavior cannot be represented safely.",
      site.id,
    );
    return null;
  }
  if (typeof site.raw.url !== "string" || /\$[A-Z_]/u.test(site.raw.url)) {
    omission(
      context,
      "UNSUPPORTED_SECRET_OR_MISSING_URL",
      source,
      "The site URL is missing or depends on a secret that Velvet cannot embed.",
      site.id,
    );
    return null;
  }
  let url: URL;
  try {
    url = new URL(site.raw.url);
  } catch {
    omission(
      context,
      "INVALID_URL",
      source,
      "The site URL is not a valid absolute URL.",
      site.id,
    );
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    omission(
      context,
      "INVALID_URL",
      source,
      "The site URL cannot be represented safely by Velvet.",
      site.id,
    );
    return null;
  }
  const headers = parsedHeaders(site, context);
  const statusCodes = expectedStatusCodes(site, context);
  if (headers === null || statusCodes === null) return null;
  return {
    id: site.id,
    name: site.name,
    url: url.href,
    method,
    expectedStatusCodes: statusCodes,
    ...(headers.length === 0 ? {} : { headers }),
  };
}

function parseResponseSamples(
  commits: UpptimeCommit[],
  serviceId: string,
  context: MigrationContext,
  generatedAt: string,
): { samples: MonitorResponseSample[]; latestStatusCode: number | null } {
  const earliest = Date.parse(generatedAt) - RETENTION_DAYS * DAY_MS;
  const samples = new Map<string, MonitorResponseSample>();
  let latestStatusCode: number | null = null;
  let latestTimestamp = -1;
  for (const commit of commits) {
    if (!commit.message.includes("[upptime]")) continue;
    const match = commit.message.match(
      / is (up|down|degraded) \((\d+) in (\d+) ms\).*\[upptime\]$/u,
    );
    const timestamp = Date.parse(commit.committedAt);
    if (match === null || !Number.isFinite(timestamp)) {
      finding(
        context,
        "MALFORMED_HISTORY_COMMIT",
        `history/${serviceId}.yml@${commit.sha}`,
        "The response sample could not be read from this Upptime commit.",
        serviceId,
      );
      continue;
    }
    const statusCode = Number(match[2]);
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestStatusCode =
        statusCode >= 100 && statusCode <= 599 ? statusCode : null;
    }
    if (timestamp < earliest || timestamp > Date.parse(generatedAt)) continue;
    const normalizedTimestamp = new Date(timestamp).toISOString();
    if (!samples.has(normalizedTimestamp)) {
      samples.set(normalizedTimestamp, {
        serviceId,
        checkId: serviceId,
        timestamp: normalizedTimestamp,
        responseTimeMs: match[1] === "down" ? null : Number(match[3]),
      });
    }
  }
  return {
    samples: [...samples.values()].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp),
    ),
    latestStatusCode,
  };
}

function statusState(summary: ParsedSummary): {
  status: MonitorStatus;
  confirmedStatus: "up" | "down" | null;
  targetAvailability: "available" | "unavailable";
} {
  if (summary.status === "up") {
    return {
      status: "up",
      confirmedStatus: "up",
      targetAvailability: "available",
    };
  }
  if (summary.status === "down") {
    return {
      status: "down",
      confirmedStatus: "down",
      targetAvailability: "unavailable",
    };
  }
  return {
    status: "degraded",
    confirmedStatus: null,
    targetAvailability: "unavailable",
  };
}

function completeAvailabilityDays(
  service: PreparedService,
  source: UpptimeMigrationSource,
  generatedAt: string,
  context: MigrationContext,
): MonitorImportedDailyAvailability[] {
  const startsAt = Date.parse(service.history.startTime);
  const observedUntil = Date.parse(service.history.lastUpdated);
  const retentionCutoff = Date.parse(generatedAt) - RETENTION_DAYS * DAY_MS;
  const firstDay = Date.parse(
    `${service.history.startTime.slice(0, 10)}T00:00:00.000Z`,
  );
  const lastObservedDay = Date.parse(
    `${service.history.lastUpdated.slice(0, 10)}T00:00:00.000Z`,
  );
  const days: MonitorImportedDailyAvailability[] = [];
  for (let day = firstDay; day < lastObservedDay; day += DAY_MS) {
    if (day < retentionCutoff) continue;
    const date = new Date(day).toISOString().slice(0, 10);
    const monitoredSeconds = Math.floor(
      (Math.min(day + DAY_MS, observedUntil) - Math.max(day, startsAt)) / 1_000,
    );
    if (monitoredSeconds <= 0) continue;
    const unavailableSeconds =
      (service.summary.dailyMinutesDown[date] ?? 0) * 60;
    if (
      !Number.isInteger(unavailableSeconds) ||
      unavailableSeconds > monitoredSeconds
    ) {
      finding(
        context,
        "INVALID_DAILY_AVAILABILITY",
        `history/${service.id}.yml`,
        `The daily availability value for ${date} was omitted because it exceeds the evidenced monitoring window.`,
        service.id,
      );
      continue;
    }
    days.push({
      serviceId: service.id,
      date,
      monitoredSeconds,
      unavailableSeconds,
      source: {
        kind: "upptime",
        repository: source.repository,
        commit: source.commit,
        path: `history/${service.id}.yml`,
      },
    });
  }
  finding(
    context,
    "PARTIAL_CURRENT_DAY_OMITTED",
    `history/${service.id}.yml`,
    "The current partial day was omitted because Upptime does not provide exact outage intervals.",
    service.id,
  );
  return days;
}

function sanitizeIssueSummary(body: string): string {
  const sections = body
    .replace(/<!--[\s\S]*?-->/gu, "")
    .trim()
    .split(/\n\s*\n/u);
  if (sections[0]?.startsWith("In [") && sections[0].includes(" was **")) {
    sections.shift();
  }
  return sections
    .join("\n\n")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gu, "$1")
    .replace(/\(https?:\/\/[^)]+\)/gu, "")
    .replace(/https?:\/\/\S+/gu, "")
    .trim();
}

function issueUrl(source: UpptimeMigrationSource, issue: UpptimeIssue): string {
  return `https://github.com/${source.repository}/issues/${issue.number}`;
}

function maintenanceMetadata(body: string): {
  startsAt: string;
  endsAt: string;
  affectedSlugs: string[];
} | null {
  const metadataSource = body.match(/<!--([\s\S]*?)-->/u)?.[1];
  if (metadataSource === undefined) return null;
  let value: unknown;
  try {
    value = load(metadataSource, { schema: JSON_SCHEMA });
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.start !== "string" ||
    typeof value.end !== "string"
  ) {
    return null;
  }
  try {
    return {
      startsAt: normalizeTimestamp(value.start, "maintenance start"),
      endsAt: normalizeTimestamp(value.end, "maintenance end"),
      affectedSlugs: [value.expectedDown, value.expectedDegraded]
        .filter((entry): entry is string => typeof entry === "string")
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim())
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}

function createIncidents(
  snapshot: UpptimeSnapshot,
  source: UpptimeMigrationSource,
  serviceIds: Set<string>,
  generatedAt: string,
  context: MigrationContext,
): {
  document: IncidentsDocument;
  issueSources: UpptimeMigrationIssueSource[];
  maintenanceWindows: MonitorMaintenanceWindow[];
} {
  const events: IncidentsDocument["events"] = [];
  const issueSources: UpptimeMigrationIssueSource[] = [];
  const maintenanceWindows: MonitorMaintenanceWindow[] = [];
  for (const issue of [...snapshot.issues].sort(
    (left, right) => left.number - right.number,
  )) {
    const sourceUrl = issueUrl(source, issue);
    if (issue.labels.includes("maintenance")) {
      const metadata = maintenanceMetadata(issue.body);
      if (metadata === null) {
        omission(
          context,
          "MALFORMED_MAINTENANCE",
          sourceUrl,
          "The maintenance metadata could not be parsed.",
        );
        continue;
      }
      const affectedServiceIds = [
        ...new Set(metadata.affectedSlugs.filter((slug) => serviceIds.has(slug))),
      ].sort();
      const closedAt =
        issue.state === "closed" && issue.closedAt !== null
          ? normalizeTimestamp(issue.closedAt, `issue ${issue.number} close`)
          : null;
      if (closedAt !== null && Date.parse(closedAt) < Date.parse(metadata.startsAt)) {
        finding(
          context,
          "CANCELED_MAINTENANCE_OMITTED",
          sourceUrl,
          "The maintenance was closed before its planned start.",
        );
        continue;
      }
      const endsAt =
        closedAt !== null && Date.parse(closedAt) < Date.parse(metadata.endsAt)
          ? closedAt
          : metadata.endsAt;
      const state =
        closedAt !== null || Date.parse(generatedAt) >= Date.parse(endsAt)
          ? "completed"
          : Date.parse(generatedAt) < Date.parse(metadata.startsAt)
            ? "scheduled"
            : "active";
      events.push({
        id: `maintenance-${issue.number}`,
        kind: "maintenance",
        state,
        title: issue.title,
        summary: sanitizeIssueSummary(issue.body),
        affectedServiceIds,
        startsAt: metadata.startsAt,
        endsAt,
      });
      maintenanceWindows.push({
        id: `maintenance-${issue.number}`,
        affectedServiceIds,
        startsAt: metadata.startsAt,
        endsAt,
      });
      issueSources.push({
        number: issue.number,
        url: sourceUrl,
        kind: "maintenance",
      });
      continue;
    }
    if (!issue.labels.includes("status")) continue;
    const affectedServiceIds = [
      ...new Set(issue.labels.filter((label) => serviceIds.has(label))),
    ].sort();
    if (affectedServiceIds.length === 0) {
      omission(
        context,
        "UNMAPPED_OR_IPV6_INCIDENT",
        sourceUrl,
        "The incident affects no migrated IPv4 service.",
      );
      continue;
    }
    events.push({
      id: `incident-${issue.number}`,
      kind: "incident",
      state: issue.state === "open" ? "open" : "resolved",
      title: issue.title,
      summary: sanitizeIssueSummary(issue.body),
      affectedServiceIds,
      startsAt: normalizeTimestamp(issue.createdAt, `issue ${issue.number} start`),
      endsAt:
        issue.state === "open" || issue.closedAt === null
          ? null
          : normalizeTimestamp(issue.closedAt, `issue ${issue.number} end`),
    });
    issueSources.push({
      number: issue.number,
      url: sourceUrl,
      kind: "incident",
    });
  }
  events.sort((left, right) =>
    `${left.startsAt}\u0000${left.id}`.localeCompare(
      `${right.startsAt}\u0000${right.id}`,
    ),
  );
  const document: IncidentsDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt,
    events,
  };
  if (!validateIncidentsDocument(document).success) {
    throw new UpptimeAdapterError(
      "CONTRACT_VALIDATION_FAILED",
      "Generated incidents document failed validation",
    );
  }
  return { document, issueSources, maintenanceWindows };
}

function issuesDigest(issues: UpptimeIssue[]): string {
  const normalized = [...issues].sort((left, right) => left.number - right.number);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function latestTimestamp(values: string[]): string {
  const timestamp = Math.max(...values.map((value) => Date.parse(value)));
  if (!Number.isFinite(timestamp)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "The Upptime source has no deterministic timestamp",
    );
  }
  return new Date(timestamp).toISOString();
}

function earliestTimestamp(values: string[]): string {
  const timestamp = Math.min(...values.map((value) => Date.parse(value)));
  if (!Number.isFinite(timestamp)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "The Upptime source has no monitoring start timestamp",
    );
  }
  return new Date(timestamp).toISOString();
}

function statusPageInput(
  parsed: ParsedConfiguration,
  repositoryName: string,
): VelvetConfigurationInput["statusPage"] {
  const statusPage = parsed.statusWebsite;
  const name =
    typeof statusPage.name === "string"
      ? statusPage.name
      : `${repositoryName} Status`;
  return {
    name,
    ...(typeof statusPage.cname === "string"
      ? { customDomain: statusPage.cname }
      : {}),
    ...(typeof statusPage.logoUrl === "string"
      ? { logoUrl: statusPage.logoUrl }
      : {}),
  };
}

function sortedReportEntries<
  T extends { code: string; source: string; serviceId?: string },
>(entries: T[]): T[] {
  return entries.sort((left, right) =>
    `${left.source}\u0000${left.serviceId ?? ""}\u0000${left.code}`.localeCompare(
      `${right.source}\u0000${right.serviceId ?? ""}\u0000${right.code}`,
    ),
  );
}

export function renderUpptimeMigrationReport(
  report: UpptimeMigrationReport,
): string {
  const lines = [
    "# Velvet Upptime migration",
    "",
    `Source: ${report.source.repository}@${report.source.commit}`,
    "",
    "## Summary",
    "",
    `- Migrated services: ${report.summary.migratedServices}`,
    `- Imported availability days: ${report.summary.importedAvailabilityDays}`,
    `- Response samples: ${report.summary.responseSamples}`,
    `- Incidents: ${report.summary.incidents}`,
    `- Maintenance windows: ${report.summary.maintenanceWindows}`,
    `- Omissions: ${report.summary.omissions}`,
    `- Required secrets: ${report.summary.requiredSecrets}`,
    "",
    "## Required secrets",
    "",
    ...(report.requiredSecrets.length === 0
      ? ["None."]
      : report.requiredSecrets.map(
          (secret) =>
            `- Create GitHub Secret \`${secret.githubSecret}\` and map \`${secret.environmentVariable}: ${secret.workflowValue}\` for ${secret.serviceId} header \`${secret.header}\``,
        )),
    "",
    "## Omissions",
    "",
    ...(report.omissions.length === 0
      ? ["None."]
      : report.omissions.map(
          (entry) =>
            `- ${entry.code}: ${entry.source}${entry.serviceId === undefined ? "" : ` (${entry.serviceId})`}: ${entry.message}`,
        )),
    "",
    "## Findings",
    "",
    ...(report.findings.length === 0
      ? ["None."]
      : report.findings.map(
          (entry) =>
            `- ${entry.code}: ${entry.source}${entry.serviceId === undefined ? "" : ` (${entry.serviceId})`}: ${entry.message}`,
        )),
    "",
    "## Migrated issues",
    "",
    ...(report.issueSources.length === 0
      ? ["None."]
      : report.issueSources.map(
          (issue) => `- ${issue.kind} #${issue.number}: ${issue.url}`,
        )),
    "",
    "## Required workflow changes",
    "",
    ...report.workflowChanges.map((change) => `- ${change}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function createUpptimeMigration(
  snapshot: UpptimeSnapshot,
  source: UpptimeMigrationSource,
): UpptimeMigrationResult {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(source.repository) ||
    !/^[0-9a-f]{40}$/u.test(source.commit)
  ) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid pinned migration source",
    );
  }
  const normalizedSource: UpptimeMigrationSource = {
    ...source,
    committedAt: normalizeTimestamp(source.committedAt, "source commit"),
  };
  const context: MigrationContext = {
    source: normalizedSource,
    omissions: [],
    findings: [],
    requiredSecrets: [],
    usedSecretNames: new Map(),
  };
  const configuration = parseConfiguration(snapshot.configYaml);
  reportUnsupportedConfigurationOptions(configuration, context);
  const summaries = parseSummaryEntries(snapshot.summaryJson);
  const [sourceOwner, sourceRepo] = normalizedSource.repository.split("/") as [
    string,
    string,
  ];
  if (
    (configuration.owner !== null && configuration.owner !== sourceOwner) ||
    (configuration.repo !== null && configuration.repo !== sourceRepo)
  ) {
    finding(
      context,
      "REPOSITORY_METADATA_REPLACED",
      ".upptimerc.yml",
      "The generated configuration uses the repository selected on the command line.",
    );
  }

  const preliminary: Array<{
    site: ParsedSite;
    check: PreparedService["check"];
    summary: ParsedSummary;
    history: ParsedHistory;
  }> = [];
  const supported: Array<{
    site: ParsedSite;
    check: PreparedService["check"];
  }> = [];
  const seenServiceIds = new Set<string>();
  for (const site of configuration.sites) {
    if (seenServiceIds.has(site.id)) {
      throw new UpptimeAdapterError(
        "INVALID_INPUT",
        `Duplicate Upptime service identity ${site.id}`,
      );
    }
    seenServiceIds.add(site.id);
    const check = prepareCheck(site, context);
    if (check === null) continue;
    supported.push({ site, check });
    let summary: ParsedSummary;
    let history: ParsedHistory;
    try {
      summary = parseSummary(summaries.get(site.slug));
    } catch {
      omission(
        context,
        "MALFORMED_SUMMARY",
        "history/summary.json",
        "The service summary is missing or malformed.",
        site.id,
      );
      continue;
    }
    const historySource = snapshot.histories[site.slug];
    if (historySource === undefined) {
      omission(
        context,
        "MISSING_HISTORY",
        `history/${site.slug}.yml`,
        "The service history file is missing.",
        site.id,
      );
      continue;
    }
    try {
      history = parseHistory(historySource, site.slug);
    } catch {
      omission(
        context,
        "MALFORMED_HISTORY",
        `history/${site.slug}.yml`,
        "The service history file is malformed.",
        site.id,
      );
      continue;
    }
    preliminary.push({ site, check, summary, history });
  }
  if (supported.length === 0) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "No supported IPv4 Upptime services can be migrated",
    );
  }

  const generatedAt = latestTimestamp([
    normalizedSource.committedAt,
    ...preliminary.map(({ history }) => history.lastUpdated),
    ...preliminary.flatMap(({ site }) =>
      (snapshot.commits[site.slug] ?? []).map(({ committedAt }) => committedAt),
    ),
  ]);
  const prepared: PreparedService[] = preliminary
    .map(({ site, check, summary, history }) => {
      const response = parseResponseSamples(
        snapshot.commits[site.slug] ?? [],
        site.id,
        context,
        generatedAt,
      );
      return {
        id: site.id,
        name: site.name,
        check,
        summary,
        history,
        responseSamples: response.samples,
        latestStatusCode: response.latestStatusCode,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const monitoringStartedAt = earliestTimestamp([
    normalizedSource.committedAt,
    ...prepared.map(({ history }) => history.startTime),
    ...prepared.flatMap(({ responseSamples }) =>
      responseSamples.map(({ timestamp }) => timestamp),
    ),
  ]);
  const importedDailyAvailability = prepared
    .flatMap((service) =>
      completeAvailabilityDays(
        service,
        normalizedSource,
        generatedAt,
        context,
      ),
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.serviceId.localeCompare(right.serviceId),
    );
  const responseSamples = prepared
    .flatMap(({ responseSamples: samples }) => samples)
    .sort(
      (left, right) =>
        left.timestamp.localeCompare(right.timestamp) ||
        left.serviceId.localeCompare(right.serviceId),
    );
  const supportedServices = [...supported].sort((left, right) =>
    left.site.id.localeCompare(right.site.id),
  );
  const preparedById = new Map(prepared.map((service) => [service.id, service]));
  const currentChecks: MonitorCheckState[] = supportedServices.map(({ site }) => {
    const service = preparedById.get(site.id);
    if (service === undefined) {
      return {
        serviceId: site.id,
        checkId: site.id,
        status: "unavailable",
        confirmedStatus: null,
        confirmedAt: null,
        targetAvailability: "unobserved",
        failureStreak: 0,
        recoveryStreak: 0,
        checkedAt: null,
        responseTimeMs: null,
        statusCode: null,
        failureCode: null,
      };
    }
    const mapped = statusState(service.summary);
    return {
      serviceId: service.id,
      checkId: service.id,
      status: mapped.status,
      confirmedStatus: mapped.confirmedStatus,
      confirmedAt:
        mapped.confirmedStatus === null ? null : service.history.lastUpdated,
      targetAvailability: mapped.targetAvailability,
      failureStreak: mapped.status === "down" ? 2 : mapped.status === "degraded" ? 1 : 0,
      recoveryStreak: 0,
      checkedAt: service.history.lastUpdated,
      responseTimeMs:
        mapped.targetAvailability === "available" ? service.summary.time : null,
      statusCode: service.latestStatusCode,
      failureCode:
        mapped.targetAvailability === "available" ? null : "UNEXPECTED_STATUS",
    };
  });
  const currentServices: MonitorServiceState[] = currentChecks.map((check) => ({
    serviceId: check.serviceId,
    status: check.status,
    targetAvailability: check.targetAvailability,
  }));
  const stateChanges: MonitorPersistentState["stateChanges"] = [];
  const incidentGeneratedAt = latestTimestamp([
    generatedAt,
    ...snapshot.issues.flatMap(({ createdAt, closedAt }) =>
      closedAt === null ? [createdAt] : [createdAt, closedAt],
    ),
  ]);
  const incidentResult = createIncidents(
    snapshot,
    normalizedSource,
    new Set(supported.map(({ site }) => site.id)),
    incidentGeneratedAt,
    context,
  );
  const documentServices = supportedServices.map(({ site }) => ({
    id: site.id,
    name: site.name,
    checks: currentChecks.filter(({ serviceId }) => serviceId === site.id),
  }));
  const status = createStatusDocument({
    generatedAt,
    monitoringStartedAt,
    retentionDays: RETENTION_DAYS,
    services: documentServices,
    stateChanges,
    importedDailyAvailability,
    maintenanceWindows: incidentResult.maintenanceWindows,
  });
  const responseTimes = createResponseTimesDocument({
    generatedAt,
    monitoringStartedAt,
    services: documentServices,
    responseSamples,
  });
  const configurationInput: VelvetConfigurationInput = {
    schemaVersion: 1,
    repository: { owner: sourceOwner, name: sourceRepo },
    statusPage: statusPageInput(configuration, sourceRepo),
    services: supportedServices.map(({ site, check }) => ({
        id: site.id,
        name: site.name,
        checks: [check],
      })),
    incidents: {
      failureThreshold: 2,
      recoveryThreshold: 2,
      incidentLabel: "incident",
      maintenanceLabel: "maintenance",
    },
    history: { retentionDays: RETENTION_DAYS },
  };
  const configurationYaml = dump(configurationInput, {
    schema: JSON_SCHEMA,
    noRefs: true,
    noCompatMode: true,
    lineWidth: -1,
  });
  const parsedVelvetConfiguration = parseVelvetConfiguration(configurationYaml);
  if (!parsedVelvetConfiguration.success) {
    throw new UpptimeAdapterError(
      "CONTRACT_VALIDATION_FAILED",
      `Generated Velvet configuration failed validation: ${JSON.stringify(parsedVelvetConfiguration.errors)}`,
    );
  }
  const state: MonitorPersistentState = {
    schemaVersion: MONITOR_STATE_SCHEMA_VERSION,
    monitoringStartedAt,
    current: { checks: currentChecks, services: currentServices },
    stateChanges,
    importedDailyAvailability,
    maintenanceWindows: incidentResult.maintenanceWindows,
    responseSamples,
    documents: { status, responseTimes },
    processedRuns: [],
  };
  sortedReportEntries(context.omissions);
  sortedReportEntries(context.findings);
  context.requiredSecrets.sort((left, right) =>
    left.environmentVariable.localeCompare(right.environmentVariable),
  );
  incidentResult.issueSources.sort((left, right) => left.number - right.number);
  const documents = {
    status,
    responseTimes,
    incidents: incidentResult.document,
  };
  const report: UpptimeMigrationReport = {
    schemaVersion: 1,
    source: {
      ...normalizedSource,
      issuesDigest: issuesDigest(snapshot.issues),
    },
    summary: {
      migratedServices: supported.length,
      importedAvailabilityDays: importedDailyAvailability.length,
      responseSamples: responseSamples.length,
      incidents: documents.incidents.events.filter(
        ({ kind }) => kind === "incident",
      ).length,
      maintenanceWindows: incidentResult.maintenanceWindows.length,
      omissions: context.omissions.length,
      requiredSecrets: context.requiredSecrets.length,
    },
    omissions: context.omissions,
    findings: context.findings,
    requiredSecrets: context.requiredSecrets,
    issueSources: incidentResult.issueSources,
    workflowChanges: [
      "Add the Velvet status and response monitoring workflows.",
      "Publish the generated Velvet data branch and Pages site.",
      "Disable Upptime workflows only after the Velvet replacement is verified.",
    ],
  };
  return {
    configurationYaml,
    state,
    documents,
    report,
    reportMarkdown: renderUpptimeMigrationReport(report),
  };
}

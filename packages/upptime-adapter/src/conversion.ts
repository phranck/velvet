import {
  CONTRACT_SCHEMA_VERSION,
  type IncidentsDocument,
  type ResponseTimesDocument,
  type StatusDocument,
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";
import { JSON_SCHEMA, load } from "js-yaml";

import { UpptimeAdapterError } from "./errors.js";
import type {
  UpptimeCommit,
  UpptimeSnapshot,
  VelvetDocuments,
} from "./types.js";

interface UpptimeConfig {
  sites?: unknown;
}

interface UpptimeSite {
  name: string;
  slug: string;
  protocol: "ipv4" | "ipv6";
}

interface UpptimeSummary {
  name: string;
  slug: string;
  status: string;
  time: number;
  dailyMinutesDown: Record<string, number>;
}

interface UpptimeHistory {
  lastUpdated: string;
  startTime: string;
}

export interface VelvetDocumentTimestamps {
  status: string;
  responseTimes: string;
  incidents: string;
}

const statusRank = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  outage: 3,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeInputTimestamp(value: string, context: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Invalid timestamp for ${context}`,
    );
  }
  return new Date(timestamp).toISOString();
}

function parseSites(configYaml: string): UpptimeSite[] {
  let config: UpptimeConfig;
  try {
    config = load(configYaml, { schema: JSON_SCHEMA }) as UpptimeConfig;
  } catch (error) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime configuration YAML",
      { cause: error },
    );
  }
  if (!isRecord(config) || !Array.isArray(config.sites)) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime configuration",
    );
  }

  return config.sites.map((value) => {
    if (!isRecord(value) || typeof value.name !== "string") {
      throw new UpptimeAdapterError(
        "INVALID_INPUT",
        "Invalid Upptime site configuration",
      );
    }

    const slug =
      typeof value.slug === "string" ? value.slug : slugify(value.name);
    const protocol =
      value.ipv6 === true || slug.endsWith("-ipv6") ? "ipv6" : "ipv4";
    return { name: value.name, protocol, slug };
  });
}

export function extractUpptimeSiteSlugs(configYaml: string): string[] {
  return parseSites(configYaml).map(({ slug }) => slug);
}

function parseSummaries(summaryJson: string): Map<string, UpptimeSummary> {
  let value: unknown;
  try {
    value = JSON.parse(summaryJson);
  } catch (error) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime summary JSON",
      { cause: error },
    );
  }
  if (!Array.isArray(value)) {
    throw new UpptimeAdapterError("INVALID_INPUT", "Invalid Upptime summary");
  }

  return new Map(
    value.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.name !== "string" ||
        typeof entry.slug !== "string" ||
        typeof entry.status !== "string" ||
        typeof entry.time !== "number" ||
        !isRecord(entry.dailyMinutesDown)
      ) {
        throw new UpptimeAdapterError(
          "INVALID_INPUT",
          "Invalid Upptime summary entry",
        );
      }

      const dailyMinutesDown = Object.fromEntries(
        Object.entries(entry.dailyMinutesDown).map(([date, minutes]) => {
          if (typeof minutes !== "number") {
            throw new UpptimeAdapterError(
              "INVALID_INPUT",
              "Invalid daily downtime entry",
            );
          }
          return [date, minutes];
        }),
      );

      return [
        entry.slug,
        {
          name: entry.name,
          slug: entry.slug,
          status: entry.status,
          time: entry.time,
          dailyMinutesDown,
        },
      ];
    }),
  );
}

function parseHistory(historyYaml: string): UpptimeHistory {
  let value: unknown;
  try {
    value = load(historyYaml, { schema: JSON_SCHEMA });
  } catch (error) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime history YAML",
      { cause: error },
    );
  }
  if (
    !isRecord(value) ||
    typeof value.lastUpdated !== "string" ||
    typeof value.startTime !== "string"
  ) {
    throw new UpptimeAdapterError("INVALID_INPUT", "Invalid Upptime history");
  }
  return {
    lastUpdated: normalizeInputTimestamp(
      value.lastUpdated,
      "history lastUpdated",
    ),
    startTime: normalizeInputTimestamp(value.startTime, "history startTime"),
  };
}

export function deriveVelvetDocumentTimestamps(
  snapshot: UpptimeSnapshot,
): VelvetDocumentTimestamps {
  const monitoringTimestamps = [
    ...Object.values(snapshot.commits).flatMap((commits) =>
      commits.map(({ committedAt }) => committedAt),
    ),
    ...Object.values(snapshot.histories).map(
      (history) => parseHistory(history).lastUpdated,
    ),
  ];
  const incidentTimestamps = snapshot.issues.flatMap(
    ({ createdAt, closedAt }) =>
      closedAt === null ? [createdAt] : [createdAt, closedAt],
  );
  const monitoringTimestamp = latestTimestamp(monitoringTimestamps);
  if (monitoringTimestamp === undefined) {
    throw new UpptimeAdapterError(
      "PARTIAL_UPSTREAM_DATA",
      "Upptime source has no usable snapshot timestamp",
    );
  }
  const incidentsTimestamp = latestTimestamp([
    ...monitoringTimestamps,
    ...incidentTimestamps,
  ]);
  const monitoringGeneratedAt = new Date(monitoringTimestamp).toISOString();
  return {
    status: monitoringGeneratedAt,
    responseTimes: monitoringGeneratedAt,
    incidents: new Date(incidentsTimestamp ?? monitoringTimestamp).toISOString(),
  };
}

function latestTimestamp(values: string[]): number | undefined {
  const timestamp = Math.max(...values.map((value) => Date.parse(value)));
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function mapStatus(status: string): keyof typeof statusRank {
  switch (status) {
    case "up":
      return "operational";
    case "degraded":
      return "degraded";
    case "down":
      return "outage";
    default:
      return "unknown";
  }
}

function serviceIdFor(site: UpptimeSite, allSlugs: Set<string>): string {
  if (site.protocol === "ipv6") {
    const baseSlug = site.slug.replace(/-ipv6$/, "");
    if (allSlugs.has(baseSlug)) {
      return baseSlug;
    }
  }
  return site.slug;
}

function monitoredSecondsForDate(
  date: string,
  startsAt: number,
  generatedAt: number,
): number {
  const dayStartsAt = Date.parse(`${date}T00:00:00.000Z`);
  const dayEndsAt = dayStartsAt + 86_400_000;
  return Math.floor(
    Math.max(0, Math.min(dayEndsAt, generatedAt) - Math.max(dayStartsAt, startsAt)) /
      1_000,
  );
}

function datesBetween(startsAt: string, generatedAt: string): string[] {
  const dates: string[] = [];
  const firstDay = Date.parse(`${startsAt.slice(0, 10)}T00:00:00.000Z`);
  const lastDay = Date.parse(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  for (let day = firstDay; day <= lastDay; day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

function parseResponseSample(commit: UpptimeCommit) {
  if (!commit.message.includes("[upptime]")) {
    return null;
  }

  const match = commit.message.match(
    / is (up|down|degraded) \([^)]* in (\d+) ms\).*\[upptime\]$/u,
  );
  if (match === null) {
    throw new UpptimeAdapterError(
      "MALFORMED_HISTORY_COMMIT",
      `Malformed Upptime history commit ${commit.sha}`,
    );
  }

  return {
    timestamp: normalizeInputTimestamp(
      commit.committedAt,
      `history commit ${commit.sha}`,
    ),
    responseTimeMs: match[1] === "down" ? null : Number(match[2]),
  };
}

export function validateVelvetDocuments(
  documents: VelvetDocuments,
): VelvetDocuments {
  const results = [
    validateStatusDocument(documents.status),
    validateResponseTimesDocument(documents.responseTimes),
    validateIncidentsDocument(documents.incidents),
  ];
  const invalid = results.find((result) => !result.success);
  if (invalid !== undefined && !invalid.success) {
    throw new UpptimeAdapterError(
      "CONTRACT_VALIDATION_FAILED",
      `Velvet contract validation failed: ${JSON.stringify(invalid.errors)}`,
    );
  }
  return documents;
}

function sanitizeIssueSummary(body: string): string {
  const sections = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim()
    .split(/\n\s*\n/);
  if (sections[0]?.startsWith("In [") && sections[0].includes(" was **")) {
    sections.shift();
  }

  return sections
    .join("\n\n")
    .replace(/\[([^\]]+)]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/\(https?:\/\/[^)]+\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

function maintenanceMetadata(body: string): {
  startsAt: string;
  endsAt: string;
  affectedSlugs: string[];
} {
  const metadataSource = body.match(/<!--([\s\S]*?)-->/)?.[1];
  let metadata: unknown;
  try {
    metadata = metadataSource
      ? load(metadataSource, { schema: JSON_SCHEMA })
      : undefined;
  } catch (error) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime maintenance metadata",
      { cause: error },
    );
  }
  if (
    !isRecord(metadata) ||
    typeof metadata.start !== "string" ||
    typeof metadata.end !== "string"
  ) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      "Invalid Upptime maintenance metadata",
    );
  }

  const affectedSlugs = [metadata.expectedDown, metadata.expectedDegraded]
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    startsAt: normalizeInputTimestamp(metadata.start, "maintenance start"),
    endsAt: normalizeInputTimestamp(metadata.end, "maintenance end"),
    affectedSlugs,
  };
}

export function convertUpptimeSnapshot(
  snapshot: UpptimeSnapshot,
  options: { generatedAt: string | VelvetDocumentTimestamps },
): VelvetDocuments {
  const generatedAt =
    typeof options.generatedAt === "string"
      ? {
          status: options.generatedAt,
          responseTimes: options.generatedAt,
          incidents: options.generatedAt,
        }
      : options.generatedAt;
  const sites = parseSites(snapshot.configYaml);
  const summaries = parseSummaries(snapshot.summaryJson);
  const allSlugs = new Set(sites.map(({ slug }) => slug));
  const histories = new Map(
    sites.map((site) => {
      const history = snapshot.histories[site.slug];
      if (history === undefined) {
        throw new UpptimeAdapterError(
          "MISSING_HISTORY",
          `Missing Upptime history for ${site.slug}`,
        );
      }
      return [site.slug, parseHistory(history)];
    }),
  );
  const samplesBySlug = new Map(
    sites.map((site) => [
      site.slug,
      (snapshot.commits[site.slug] ?? [])
        .map(parseResponseSample)
        .filter((sample) => sample !== null)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    ]),
  );
  const monitoringStartedAt = [
    ...[...histories.values()].map(({ startTime }) => startTime),
    ...[...samplesBySlug.values()].flatMap((samples) =>
      samples.map(({ timestamp }) => timestamp),
    ),
  ]
    .sort()[0];
  if (monitoringStartedAt === undefined) {
    throw new UpptimeAdapterError("MISSING_HISTORY", "No Upptime history found");
  }

  const groupedSites = new Map<string, UpptimeSite[]>();
  for (const site of sites) {
    const serviceId = serviceIdFor(site, allSlugs);
    groupedSites.set(serviceId, [...(groupedSites.get(serviceId) ?? []), site]);
  }

  const services: StatusDocument["services"] = [...groupedSites.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([serviceId, serviceSites]) => {
      const orderedSites = [...serviceSites].sort((left, right) =>
        left.protocol.localeCompare(right.protocol),
      );
      const serviceStartsAt = [
        ...orderedSites.map((site) => histories.get(site.slug)!.startTime),
        ...orderedSites.flatMap((site) =>
          (samplesBySlug.get(site.slug) ?? []).map(({ timestamp }) => timestamp),
        ),
      ].sort()[0]!;
      const checks = orderedSites.map((site) => {
        const summary = summaries.get(site.slug);
        if (summary === undefined) {
          throw new UpptimeAdapterError(
            "PARTIAL_UPSTREAM_DATA",
            `Missing Upptime summary for ${site.slug}`,
          );
        }
        const history = histories.get(site.slug)!;
        return {
          id: site.protocol,
          protocol: site.protocol,
          status: mapStatus(summary.status),
          checkedAt: history.lastUpdated,
          responseTimeMs: summary.time,
        };
      });
      const dailyAvailability = datesBetween(serviceStartsAt, generatedAt.status)
        .map((date) => ({
          date,
          monitoredSeconds: monitoredSecondsForDate(
            date,
            Date.parse(serviceStartsAt),
            Date.parse(generatedAt.status),
          ),
          unavailableSeconds:
            Math.max(
              ...orderedSites.map(
                (site) => summaries.get(site.slug)?.dailyMinutesDown[date] ?? 0,
              ),
            ) * 60,
        }))
        .filter(({ monitoredSeconds }) => monitoredSeconds > 0);
      const status = checks.reduce(
        (current, check) =>
          statusRank[check.status] > statusRank[current] ? check.status : current,
        "operational" as keyof typeof statusRank,
      );
      const primary =
        orderedSites.find(({ protocol }) => protocol === "ipv4") ??
        orderedSites[0]!;

      return {
        id: serviceId,
        name: primary.name.replace(/ IPv6$/, ""),
        status,
        checks,
        dailyAvailability,
      };
    });

  const series: ResponseTimesDocument["series"] = sites
    .map((site) => ({
      serviceId: serviceIdFor(site, allSlugs),
      checkId: site.protocol,
      protocol: site.protocol,
      samples: samplesBySlug.get(site.slug) ?? [],
    }))
    .sort((left, right) =>
      `${left.serviceId}:${left.checkId}`.localeCompare(
        `${right.serviceId}:${right.checkId}`,
      ),
    );

  const status: StatusDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: generatedAt.status,
    monitoringStartedAt,
    services,
  };
  const responseTimes: ResponseTimesDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: generatedAt.responseTimes,
    monitoringStartedAt,
    series,
  };
  const serviceIdsForSlugs = (slugs: string[]) => [
    ...new Set(
      slugs
        .filter((slug) => allSlugs.has(slug))
        .map((slug) =>
          serviceIdFor(
            sites.find((site) => site.slug === slug)!,
            allSlugs,
          ),
        ),
    ),
  ].sort();
  const events: IncidentsDocument["events"] = snapshot.issues
    .flatMap((issue): IncidentsDocument["events"] => {
      if (issue.labels.includes("maintenance")) {
        const metadata = maintenanceMetadata(issue.body);
        const generatedAtTimestamp = Date.parse(generatedAt.incidents);
        const startsAt = Date.parse(metadata.startsAt);
        const endsAt = Date.parse(metadata.endsAt);
        const state =
          generatedAtTimestamp < startsAt
            ? "scheduled"
            : generatedAtTimestamp < endsAt
              ? "active"
              : "completed";
        return [
          {
            id: `maintenance-${issue.number}`,
            kind: "maintenance",
            state,
            title: issue.title,
            summary: sanitizeIssueSummary(issue.body),
            affectedServiceIds: serviceIdsForSlugs(metadata.affectedSlugs),
            startsAt: metadata.startsAt,
            endsAt: metadata.endsAt,
          },
        ];
      }

      if (!issue.labels.includes("status")) {
        return [];
      }
      return [
        {
          id: `incident-${issue.number}`,
          kind: "incident",
          state: issue.state === "open" ? "open" : "resolved",
          title: issue.title,
          summary: sanitizeIssueSummary(issue.body),
          affectedServiceIds: serviceIdsForSlugs(issue.labels),
          startsAt: normalizeInputTimestamp(
            issue.createdAt,
            `incident ${issue.number} start`,
          ),
          endsAt:
            issue.state === "open" || issue.closedAt === null
              ? null
              : normalizeInputTimestamp(
                  issue.closedAt,
                  `incident ${issue.number} end`,
                ),
        },
      ];
    })
    .sort((left, right) =>
      `${left.startsAt}:${left.id}`.localeCompare(`${right.startsAt}:${right.id}`),
    );
  const incidents: IncidentsDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: generatedAt.incidents,
    events,
  };

  return validateVelvetDocuments({ status, responseTimes, incidents });
}

import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  parseVelvetConfiguration,
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";

import * as adapter from "../src/index.js";
import type { UpptimeSnapshot } from "../src/index.js";
import { statusLmaaSpaceSnapshot } from "./fixtures/status-lmaa-space.js";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

type MigrationSource = {
  repository: string;
  ref: string;
  commit: string;
  committedAt: string;
};

type MigrationResult = {
  configurationYaml: string;
  state: {
    schemaVersion: number;
    monitoringStartedAt: string;
    current: {
      checks: Array<{
        serviceId: string;
        checkId: string;
        status: string;
        checkedAt: string | null;
      }>;
      services: unknown[];
    };
    importedDailyAvailability: Array<{
      serviceId: string;
      date: string;
      monitoredSeconds: number;
      unavailableSeconds: number;
      source: {
        kind: string;
        repository: string;
        commit: string;
        path: string;
      };
    }>;
    maintenanceWindows: Array<{
      id: string;
      affectedServiceIds: string[];
      startsAt: string;
      endsAt: string;
    }>;
    stateChanges: unknown[];
    responseSamples: unknown[];
    documents: {
      status: unknown;
      responseTimes: unknown;
    };
    processedRuns: unknown[];
  };
  documents: {
    status: {
      services: Array<{
        id: string;
        status: string;
        checks: Array<{
          id: string;
          protocol: string;
          status: string;
          checkedAt: string | null;
        }>;
      }>;
    };
    responseTimes: {
      series: Array<{ protocol: string }>;
    };
    incidents: { events: unknown[] };
  };
  report: {
    source: {
      repository: string;
      commit: string;
      issuesDigest: string;
    };
    summary: {
      migratedServices: number;
      importedAvailabilityDays: number;
      responseSamples: number;
      incidents: number;
      maintenanceWindows: number;
      omissions: number;
      requiredSecrets: number;
    };
    omissions: Array<{
      code: string;
      source: string;
      serviceId?: string;
    }>;
    findings: Array<{ code: string; source: string }>;
    requiredSecrets: Array<{
      environmentVariable: string;
      githubSecret: string;
      workflowValue: string;
      serviceId: string;
      header: string;
      sourceSecretNames: string[];
    }>;
    issueSources: Array<{
      number: number;
      url: string;
      kind: string;
    }>;
  };
  reportMarkdown: string;
};

type CreateMigration = (
  snapshot: UpptimeSnapshot,
  source: MigrationSource,
) => MigrationResult;

function createMigration(
  snapshot: UpptimeSnapshot,
  source: Partial<MigrationSource> = {},
): MigrationResult {
  const candidate = Reflect.get(adapter, "createUpptimeMigration");
  if (typeof candidate !== "function") {
    assert.fail("@velvet/upptime-adapter must export createUpptimeMigration");
  }
  return (candidate as CreateMigration)(snapshot, {
    repository: "example/status",
    ref: "main",
    commit: SOURCE_COMMIT,
    committedAt: "2026-07-29T12:00:00.000Z",
    ...source,
  });
}

function simpleSnapshot(configSite = ""): UpptimeSnapshot {
  return {
    configYaml: `
owner: example
repo: status
sites:
  - name: Website
    slug: website
    url: https://example.invalid/health
${configSite}
status-website:
  name: Example Status
`,
    summaryJson: JSON.stringify([
      {
        name: "Website",
        slug: "website",
        status: "up",
        time: 125,
        dailyMinutesDown: { "2026-07-28": 10 },
      },
    ]),
    histories: {
      website: `
status: up
responseTime: 125
lastUpdated: 2026-07-29T11:59:00.000Z
startTime: 2026-07-27T12:00:00.000Z
`,
    },
    commits: {
      website: [
        {
          sha: "history-1",
          committedAt: "2026-07-29T11:59:00.000Z",
          message: "Website is up (200 in 125 ms) [skip ci] [upptime]",
        },
      ],
    },
    issues: [
      {
        number: 7,
        title: "Website is down",
        body: "Investigating the outage.",
        state: "closed",
        createdAt: "2026-07-28T10:00:00.000Z",
        closedAt: "2026-07-28T10:15:00.000Z",
        labels: ["status", "website"],
      },
    ],
  };
}

test("creates a validated IPv4 migration bundle with provenance", () => {
  const result = createMigration(simpleSnapshot());
  const configuration = parseVelvetConfiguration(result.configurationYaml);

  assert.equal(configuration.success, true);
  if (!configuration.success) return;
  assert.equal(configuration.data.repository.owner, "example");
  assert.equal(configuration.data.repository.name, "status");
  assert.equal(configuration.data.statusPage.name, "Example Status");
  assert.deepEqual(
    configuration.data.services.map(({ id }) => id),
    ["website"],
  );
  assert.equal(result.state.schemaVersion, 3);
  assert.equal(
    validateStatusDocument(result.documents.status).success,
    true,
  );
  assert.equal(
    validateResponseTimesDocument(result.documents.responseTimes).success,
    true,
  );
  assert.equal(
    validateIncidentsDocument(result.documents.incidents).success,
    true,
  );
  assert.deepEqual(result.state.importedDailyAvailability, [
    {
      serviceId: "website",
      date: "2026-07-27",
      monitoredSeconds: 43_200,
      unavailableSeconds: 0,
      source: {
        kind: "upptime",
        repository: "example/status",
        commit: SOURCE_COMMIT,
        path: "history/website.yml",
      },
    },
    {
      serviceId: "website",
      date: "2026-07-28",
      monitoredSeconds: 86_400,
      unavailableSeconds: 600,
      source: {
        kind: "upptime",
        repository: "example/status",
        commit: SOURCE_COMMIT,
        path: "history/website.yml",
      },
    },
  ]);
  assert.equal(result.state.current.checks[0]?.checkId, "website");
  assert.deepEqual(result.state.stateChanges, []);
  assert.deepEqual(result.state.processedRuns, []);
  assert.equal(result.state.responseSamples.length, 1);
  assert.deepEqual(result.report.issueSources, [
    {
      number: 7,
      url: "https://github.com/example/status/issues/7",
      kind: "incident",
    },
  ]);
  assert.match(result.report.source.issuesDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.reportMarkdown, /Velvet Upptime migration/u);
  assert.match(result.reportMarkdown, /https:\/\/github\.com\/example\/status\/issues\/7/u);
});

test("omits all legacy IPv6 and Globalping services from active output", () => {
  const result = createMigration(statusLmaaSpaceSnapshot, {
    repository: "phranck/status.lmaa.space",
    committedAt: "2026-07-25T23:30:00.000Z",
  });

  assert.equal(result.documents.status.services.length, 5);
  assert.equal(
    result.documents.status.services.every(
      (service) =>
        service.checks.length === 1 &&
        service.checks[0]?.protocol === "ipv4",
    ),
    true,
  );
  assert.equal(
    result.documents.responseTimes.series.every(
      ({ protocol }) => protocol === "ipv4",
    ),
    true,
  );
  assert.equal(
    result.report.omissions.filter(
      ({ code }) => code === "IPV6_OR_GLOBALPING_OMITTED",
    ).length,
    5,
  );
  assert.equal(result.report.summary.migratedServices, 5);
  assert.equal(JSON.stringify(result.state).includes("-ipv6"), false);
  assert.equal(result.configurationYaml.includes("globalping"), false);
});

test("maps request headers to secret names without copying values", () => {
  const snapshot = simpleSnapshot(`    expectedStatusCodes: [200, 204]
    headers:
      - "Authorization: Bearer $API_TOKEN"
      - "X-Api-Key: literal-do-not-copy"
  - name: Unsupported Writer
    slug: unsupported-writer
    url: https://example.invalid/write
    method: POST`);
  snapshot.summaryJson = JSON.stringify([
    ...JSON.parse(snapshot.summaryJson),
    {
      name: "Unsupported Writer",
      slug: "unsupported-writer",
      status: "up",
      time: 100,
      dailyMinutesDown: {},
    },
  ]);
  snapshot.histories["unsupported-writer"] = `
status: up
responseTime: 100
lastUpdated: 2026-07-29T11:58:00.000Z
startTime: 2026-07-27T12:00:00.000Z
`;
  snapshot.commits["unsupported-writer"] = [];

  const result = createMigration(snapshot);
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("literal-do-not-copy"), false);
  assert.equal(serialized.includes("Bearer $API_TOKEN"), false);
  assert.deepEqual(result.report.requiredSecrets, [
    {
      environmentVariable: "VELVET_WEBSITE_AUTHORIZATION",
      githubSecret: "VELVET_WEBSITE_AUTHORIZATION",
      workflowValue:
        "${{ secrets.VELVET_WEBSITE_AUTHORIZATION }}",
      serviceId: "website",
      header: "Authorization",
      sourceSecretNames: ["API_TOKEN"],
    },
    {
      environmentVariable: "VELVET_WEBSITE_X_API_KEY",
      githubSecret: "VELVET_WEBSITE_X_API_KEY",
      workflowValue: "${{ secrets.VELVET_WEBSITE_X_API_KEY }}",
      serviceId: "website",
      header: "X-Api-Key",
      sourceSecretNames: [],
    },
  ]);
  assert.match(result.configurationYaml, /VELVET_WEBSITE_AUTHORIZATION/u);
  assert.match(result.configurationYaml, /VELVET_WEBSITE_X_API_KEY/u);
  assert.equal(
    result.report.findings.some(
      ({ code }) => code === "PLAINTEXT_HEADER_CREDENTIAL",
    ),
    true,
  );
  assert.equal(
    result.report.omissions.some(
      ({ code, serviceId }) =>
        code === "UNSUPPORTED_METHOD" &&
        serviceId === "unsupported-writer",
    ),
    true,
  );
  assert.match(result.reportMarkdown, /## Findings/u);
  assert.match(
    result.reportMarkdown,
    /source contains a literal request-header value/u,
  );
  assert.match(
    result.reportMarkdown,
    /Velvet supports GET and HEAD checks only/u,
  );
});

test("omits checks with unsupported behavioral options and reports each option", () => {
  const snapshot = simpleSnapshot(`  - name: Slow API
    slug: slow-api
    url: https://slow.example.invalid
    maxResponseTime: 5000
  - name: Insecure API
    slug: insecure-api
    url: https://insecure.example.invalid
    __dangerous__insecure: true`);
  snapshot.summaryJson = JSON.stringify([
    ...JSON.parse(snapshot.summaryJson),
    ...["slow-api", "insecure-api"].map((slug) => ({
      name: slug,
      slug,
      status: "up",
      time: 100,
      dailyMinutesDown: {},
    })),
  ]);
  for (const slug of ["slow-api", "insecure-api"]) {
    snapshot.histories[slug] = `
status: up
responseTime: 100
lastUpdated: 2026-07-29T11:58:00.000Z
startTime: 2026-07-27T12:00:00.000Z
`;
    snapshot.commits[slug] = [];
  }

  const result = createMigration(snapshot);
  const configuration = parseVelvetConfiguration(result.configurationYaml);

  assert.equal(configuration.success, true);
  if (!configuration.success) return;
  assert.deepEqual(
    configuration.data.services.map(({ id }) => id),
    ["website"],
  );
  assert.deepEqual(
    result.report.omissions
      .filter(({ code }) => code === "UNSUPPORTED_SITE_OPTION")
      .map(({ serviceId }) => serviceId),
    ["insecure-api", "slow-api"],
  );
});

test("reports unmapped repository and status-page options without copying values", () => {
  const snapshot = simpleSnapshot();
  snapshot.configYaml += `
workflowSchedule:
  uptime: "*/5 * * * *"
`;
  snapshot.configYaml = snapshot.configYaml.replace(
    "  name: Example Status\n",
    "  name: Example Status\n  theme: secret-theme-value\n",
  );

  const result = createMigration(snapshot);
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("secret-theme-value"), false);
  assert.deepEqual(
    result.report.findings
      .filter(({ code }) => code.startsWith("UNSUPPORTED_CONFIGURATION_OPTION"))
      .map(({ source }) => source),
    [
      ".upptimerc.yml#status-website/theme",
      ".upptimerc.yml#workflowSchedule",
    ],
  );
});

test("produces byte-stable normalized output for an unchanged source", () => {
  const first = createMigration(simpleSnapshot());
  const second = createMigration(simpleSnapshot());

  assert.deepEqual(second, first);
});

test("keeps an Upptime connection failure with status code zero", () => {
  const snapshot = simpleSnapshot();
  snapshot.summaryJson = JSON.stringify([
    {
      name: "Website",
      slug: "website",
      status: "down",
      time: 0,
      dailyMinutesDown: { "2026-07-28": 10 },
    },
  ]);
  snapshot.commits.website = [
    {
      sha: "connection-failure",
      committedAt: "2026-07-29T11:59:00.000Z",
      message: "Website is down (0 in 0 ms) [skip ci] [upptime]",
    },
  ];

  const result = createMigration(snapshot);
  const currentCheck = result.state.current.checks[0] as
    | { statusCode: number | null }
    | undefined;
  const responseSample = result.state.responseSamples[0] as
    | { responseTimeMs: number | null }
    | undefined;

  assert.equal(
    result.report.findings.some(
      ({ code }) => code === "MALFORMED_HISTORY_COMMIT",
    ),
    false,
  );
  assert.equal(currentCheck?.statusCode, null);
  assert.equal(responseSample?.responseTimeMs, null);
});

test("migrates evidenced maintenance into public and private history", () => {
  const snapshot = simpleSnapshot();
  snapshot.issues = [
    {
      number: 8,
      title: "Database maintenance",
      body: "<!--\nstart: 2026-07-28T10:00:00.000Z\nend: 2026-07-28T11:00:00.000Z\nexpectedDown: website\n-->\n\nPlanned work.",
      state: "closed",
      createdAt: "2026-07-27T10:00:00.000Z",
      closedAt: "2026-07-28T10:45:00.000Z",
      labels: ["maintenance"],
    },
  ];

  const result = createMigration(snapshot);
  const maintenance = result.documents.incidents.events[0] as
    | { kind: string; endsAt: string }
    | undefined;

  assert.equal(maintenance?.kind, "maintenance");
  assert.equal(maintenance?.endsAt, "2026-07-28T10:45:00.000Z");
  assert.deepEqual(result.state.maintenanceWindows, [
    {
      id: "maintenance-8",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-28T10:00:00.000Z",
      endsAt: "2026-07-28T10:45:00.000Z",
    },
  ]);
  assert.deepEqual(result.report.issueSources, [
    {
      number: 8,
      url: "https://github.com/example/status/issues/8",
      kind: "maintenance",
    },
  ]);
});

test("rejects an empty Upptime installation without producing invalid Velvet output", () => {
  const snapshot = simpleSnapshot();
  snapshot.configYaml = "owner: example\nrepo: status\nsites: []\n";
  snapshot.summaryJson = "[]";
  snapshot.histories = {};
  snapshot.commits = {};
  snapshot.issues = [];

  assert.throws(
    () => createMigration(snapshot),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_INPUT",
  );
});

test("keeps valid services when another summary is missing", () => {
  const snapshot = simpleSnapshot(`  - name: Partial API
    slug: partial-api
    url: https://partial.example.invalid`);
  snapshot.histories["partial-api"] = `
status: up
responseTime: 100
lastUpdated: 2026-07-29T11:58:00.000Z
startTime: 2026-07-27T12:00:00.000Z
`;
  snapshot.commits["partial-api"] = [];

  const result = createMigration(snapshot);
  const configuration = parseVelvetConfiguration(result.configurationYaml);

  assert.equal(configuration.success, true);
  if (!configuration.success) return;
  assert.deepEqual(
    configuration.data.services.map(({ id }) => id),
    ["partial-api", "website"],
  );
  assert.deepEqual(
    result.documents.status.services.map(({ id }) => id),
    ["partial-api", "website"],
  );
  const partialService = result.documents.status.services.find(
    ({ id }) => id === "partial-api",
  );
  assert.equal(partialService?.status, "unknown");
  assert.equal(partialService?.checks[0]?.checkedAt, null);
  assert.equal(
    result.state.current.checks.find(
      ({ serviceId }) => serviceId === "partial-api",
    )?.checkedAt,
    null,
  );
  assert.equal(result.report.summary.migratedServices, 2);
  assert.equal(
    result.report.omissions.some(
      ({ code, serviceId }) =>
        code === "MALFORMED_SUMMARY" && serviceId === "partial-api",
    ),
    true,
  );
});

test("does not turn an unknown Upptime status into a Velvet state", () => {
  const snapshot = simpleSnapshot();
  snapshot.summaryJson = JSON.stringify([
    {
      name: "Website",
      slug: "website",
      status: "paused",
      time: 125,
      dailyMinutesDown: {},
    },
  ]);

  const result = createMigration(snapshot);
  const configuration = parseVelvetConfiguration(result.configurationYaml);

  assert.equal(configuration.success, true);
  if (!configuration.success) return;
  assert.deepEqual(
    configuration.data.services.map(({ id }) => id),
    ["website"],
  );
  assert.equal(result.documents.status.services[0]?.status, "unknown");
  assert.equal(
    result.documents.status.services[0]?.checks[0]?.checkedAt,
    null,
  );
  assert.equal(
    result.report.omissions.some(
      ({ code, serviceId }) =>
        code === "MALFORMED_SUMMARY" && serviceId === "website",
    ),
    true,
  );
});

test("omits a service with malformed optional history and reports it", () => {
  const snapshot = simpleSnapshot(`  - name: Broken API
    slug: broken-api
    url: https://broken.example.invalid`);
  snapshot.summaryJson = JSON.stringify([
    ...JSON.parse(snapshot.summaryJson),
    {
      name: "Broken API",
      slug: "broken-api",
      status: "up",
      time: 100,
      dailyMinutesDown: {},
    },
  ]);
  snapshot.histories["broken-api"] = "status: up";
  snapshot.commits["broken-api"] = [];

  const result = createMigration(snapshot);
  const configuration = parseVelvetConfiguration(result.configurationYaml);

  assert.equal(configuration.success, true);
  if (!configuration.success) return;
  assert.deepEqual(
    configuration.data.services.map(({ id }) => id),
    ["broken-api", "website"],
  );
  assert.deepEqual(
    result.documents.status.services.map(({ id }) => id),
    ["broken-api", "website"],
  );
  assert.equal(
    result.documents.status.services.find(({ id }) => id === "broken-api")
      ?.checks[0]?.checkedAt,
    null,
  );
  assert.equal(
    result.report.omissions.some(
      ({ code, source, serviceId }) =>
        code === "MALFORMED_HISTORY" &&
        source === "history/broken-api.yml" &&
        serviceId === "broken-api",
    ),
    true,
  );
});

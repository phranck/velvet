import assert from "node:assert/strict";
import test from "node:test";

import * as adapter from "../src/index.js";
import {
  convertUpptimeSnapshot,
  type UpptimeSnapshot,
} from "../src/index.js";
import { statusLmaaSpaceSnapshot } from "./fixtures/status-lmaa-space.js";

function createSingleSiteSnapshot(): UpptimeSnapshot {
  return {
    configYaml: `
sites:
  - name: Website
    url: https://example.invalid/health/website
`,
    summaryJson: JSON.stringify([
      {
        name: "Website",
        slug: "website",
        status: "up",
        time: 420,
        dailyMinutesDown: {},
      },
    ]),
    histories: {
      website: `
status: up
responseTime: 500
lastUpdated: 2026-07-06T12:00:00.000Z
startTime: 2026-07-05T10:00:00.000Z
`,
    },
    commits: {
      website: [
        {
          sha: "ipv4-1",
          committedAt: "2026-07-06T12:00:00.000Z",
          message: "Website is up (200 in 500 ms) [skip ci] [upptime]",
        },
      ],
    },
    issues: [],
  };
}

test("folds an IPv6 sibling into one Velvet service", () => {
  const documents = convertUpptimeSnapshot(
    {
      configYaml: `
sites:
  - name: Website
    url: https://example.invalid/health/website
  - name: Website IPv6
    slug: website-ipv6
    url: https://example.invalid/health/website
    type: globalping
    ipv6: true
`,
      summaryJson: JSON.stringify([
        {
          name: "Website",
          slug: "website",
          status: "up",
          time: 420,
          dailyMinutesDown: { "2026-07-05": 12 },
        },
        {
          name: "Website IPv6",
          slug: "website-ipv6",
          status: "up",
          time: 84,
          dailyMinutesDown: { "2026-07-05": 3 },
        },
      ]),
      histories: {
        website: `
status: up
responseTime: 500
lastUpdated: 2026-07-06T12:00:00.000Z
startTime: 2026-07-05T10:00:00.000Z
`,
        "website-ipv6": `
status: up
responseTime: 90
lastUpdated: 2026-07-06T12:01:00.000Z
startTime: 2026-07-05T10:01:00.000Z
`,
      },
      commits: {
        website: [
          {
            sha: "ipv4-1",
            committedAt: "2026-07-06T12:00:00.000Z",
            message: "Website is up (200 in 500 ms) [skip ci] [upptime]",
          },
        ],
        "website-ipv6": [
          {
            sha: "ipv6-1",
            committedAt: "2026-07-06T12:01:00.000Z",
            message: "Website IPv6 is up (200 in 90 ms) [skip ci] [upptime]",
          },
        ],
      },
      issues: [],
    },
    { generatedAt: "2026-07-06T13:00:00.000Z" },
  );

  assert.equal(documents.status.services.length, 1);
  assert.deepEqual(
    documents.status.services[0]?.checks.map(({ protocol }) => protocol),
    ["ipv4", "ipv6"],
  );
  assert.equal(documents.status.services[0]?.dailyAvailability[0]?.unavailableSeconds, 720);
  assert.equal(documents.responseTimes.series.length, 2);
  assert.equal(JSON.stringify(documents).includes("example.invalid"), false);
});

test("reports missing history with a stable error code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.histories = {};

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "MISSING_HISTORY",
  );
});

test("converts a fresh repository into an unknown no-history snapshot", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.historyState = "absent";
  snapshot.summaryJson = "[]";
  snapshot.histories = {};
  snapshot.commits = {};
  snapshot.issues = [
    {
      number: 42,
      title: "Website is down",
      body: "Investigating the outage.",
      state: "open",
      createdAt: "2026-07-06T12:00:00.000Z",
      closedAt: null,
      labels: ["status", "website"],
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  assert.deepEqual(documents.status, {
    schemaVersion: 1,
    generatedAt: "2026-07-06T13:00:00.000Z",
    monitoringStartedAt: "2026-07-06T13:00:00.000Z",
    services: [
      {
        id: "website",
        name: "Website",
        status: "unknown",
        checks: [
          {
            id: "ipv4",
            protocol: "ipv4",
            status: "unknown",
            checkedAt: null,
            responseTimeMs: null,
          },
        ],
        dailyAvailability: [],
      },
    ],
  });
  assert.deepEqual(documents.responseTimes, {
    schemaVersion: 1,
    generatedAt: "2026-07-06T13:00:00.000Z",
    monitoringStartedAt: "2026-07-06T13:00:00.000Z",
    series: [],
  });
  assert.deepEqual(documents.incidents.events, [
    {
      id: "incident-42",
      kind: "incident",
      state: "open",
      title: "Website is down",
      summary: "Investigating the outage.",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-06T12:00:00.000Z",
      endsAt: null,
    },
  ]);
});

test("reports malformed Upptime commits with a stable error code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.commits.website = [
    {
      sha: "broken-commit",
      committedAt: "2026-07-06T12:00:00.000Z",
      message: "Unexpected response history [upptime]",
    },
  ];

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "MALFORMED_HISTORY_COMMIT",
  );
});

test("reports incomplete upstream summaries with a stable error code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.summaryJson = "[]";

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "PARTIAL_UPSTREAM_DATA",
  );
});

test("reports invalid Upptime input with a stable error code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.configYaml = "sites: invalid";

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "INVALID_INPUT",
  );
});

test("reports malformed Upptime YAML with the invalid-input code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.configYaml = "sites: [";

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "INVALID_INPUT",
  );
});

test("reports malformed summary JSON with the invalid-input code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.summaryJson = "{";

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "INVALID_INPUT",
  );
});

test("reports malformed current history with the invalid-input code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.histories.website = "status: up";

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "INVALID_INPUT",
  );
});

test("preserves a failed response check as an unavailable sample", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.commits.website = [
    {
      sha: "down-1",
      committedAt: "2026-07-06T11:00:00.000Z",
      message: "Website is down (500 in 120 ms) [skip ci] [upptime]",
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  assert.equal(documents.responseTimes.series[0]?.samples[0]?.responseTimeMs, null);
});

test("derives monitoring start from history commits older than the current history file", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.histories.website = `
status: up
responseTime: 500
lastUpdated: 2026-07-06T12:00:00.000Z
startTime: 2026-07-06T11:00:00.000Z
`;
  snapshot.commits.website = [
    {
      sha: "older-than-history",
      committedAt: "2026-07-05T10:00:00.000Z",
      message: "Website is down (500 in 120 ms) [skip ci] [upptime]",
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  assert.equal(documents.status.monitoringStartedAt, "2026-07-05T10:00:00.000Z");
  assert.equal(
    documents.responseTimes.monitoringStartedAt,
    "2026-07-05T10:00:00.000Z",
  );
  assert.deepEqual(
    documents.status.services[0]?.dailyAvailability.map(({ date }) => date),
    ["2026-07-05", "2026-07-06"],
  );
});

test("converts an Upptime status issue without exposing its endpoint URL", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.issues = [
    {
      number: 42,
      title: "Website is down",
      body: "In [abc](https://github.com/example/commit/abc), Website (https://example.invalid/health/website) was **down**:\n- HTTP code: 500\n- Response time: 120 ms\n\nInvestigating the outage.",
      state: "closed",
      createdAt: "2026-07-06T10:00:00.000Z",
      closedAt: "2026-07-06T10:30:00.000Z",
      labels: ["status", "website"],
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  assert.deepEqual(documents.incidents.events, [
    {
      id: "incident-42",
      kind: "incident",
      state: "resolved",
      title: "Website is down",
      summary: "Investigating the outage.",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-06T10:00:00.000Z",
      endsAt: "2026-07-06T10:30:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(documents.incidents).includes("example.invalid"), false);
});

test("converts scheduled maintenance metadata into a Velvet event", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.issues = [
    {
      number: 43,
      title: "Scheduled maintenance",
      body: "<!--\nstart: 2026-07-06T14:00:00+00:00\nend: 2026-07-06T15:00:00+00:00\nexpectedDown: website\n-->\n\nDatabase maintenance.",
      state: "open",
      createdAt: "2026-07-05T12:00:00.000Z",
      closedAt: null,
      labels: ["maintenance"],
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  assert.deepEqual(documents.incidents.events, [
    {
      id: "maintenance-43",
      kind: "maintenance",
      state: "scheduled",
      title: "Scheduled maintenance",
      summary: "Database maintenance.",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-06T14:00:00.000Z",
      endsAt: "2026-07-06T15:00:00.000Z",
    },
  ]);
});

test("completes maintenance when its issue closes before the planned end", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.issues = [
    {
      number: 43,
      title: "Scheduled maintenance",
      body: "<!--\nstart: 2026-07-06T14:00:00+00:00\nend: 2026-07-06T15:00:00+00:00\nexpectedDown: website\n-->\n\nDatabase maintenance.",
      state: "closed",
      createdAt: "2026-07-05T12:00:00.000Z",
      closedAt: "2026-07-06T14:30:00.000Z",
      labels: ["maintenance"],
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T14:30:00.000Z",
  });

  assert.equal(documents.incidents.events[0]?.state, "completed");
  assert.equal(
    documents.incidents.events[0]?.endsAt,
    "2026-07-06T14:30:00.000Z",
  );
});

test("omits maintenance that is canceled before its planned start", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.issues = [
    {
      number: 43,
      title: "Scheduled maintenance",
      body: "<!--\nstart: 2026-07-06T14:00:00+00:00\nend: 2026-07-06T15:00:00+00:00\nexpectedDown: website\n-->\n\nDatabase maintenance.",
      state: "closed",
      createdAt: "2026-07-05T12:00:00.000Z",
      closedAt: "2026-07-06T13:30:00.000Z",
      labels: ["maintenance"],
    },
  ];

  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: "2026-07-06T13:30:00.000Z",
  });

  assert.deepEqual(documents.incidents.events, []);
});

test("reports malformed maintenance metadata with the invalid-input code", () => {
  const snapshot = createSingleSiteSnapshot();
  snapshot.issues = [
    {
      number: 43,
      title: "Scheduled maintenance",
      body: "Missing maintenance metadata",
      state: "open",
      createdAt: "2026-07-05T12:00:00.000Z",
      closedAt: null,
      labels: ["maintenance"],
    },
  ];

  assert.throws(
    () =>
      convertUpptimeSnapshot(snapshot, {
        generatedAt: "2026-07-06T13:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "INVALID_INPUT",
  );
});

test("serializes identical documents into byte-stable JSON files", () => {
  const documents = convertUpptimeSnapshot(createSingleSiteSnapshot(), {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  const first = adapter.serializeVelvetDocuments(documents);
  const second = adapter.serializeVelvetDocuments(documents);

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "status.json",
    "response-times.json",
    "incidents.json",
  ]);
  assert.equal(first["status.json"]?.endsWith("\n"), true);
});

test("refuses to serialize invalid output with a stable validation error", () => {
  const documents = convertUpptimeSnapshot(createSingleSiteSnapshot(), {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });
  documents.status.generatedAt = "invalid";

  assert.throws(
    () => adapter.serializeVelvetDocuments(documents),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "CONTRACT_VALIDATION_FAILED",
  );
});

test("converts the sanitized lmaa.space capture into five dual-stack services", () => {
  const documents = convertUpptimeSnapshot(statusLmaaSpaceSnapshot, {
    generatedAt: "2026-07-25T23:30:00.000Z",
  });

  assert.equal(documents.status.services.length, 5);
  assert.equal(
    documents.status.services.every(
      (service) =>
        service.checks.length === 2 &&
        service.checks[0]?.protocol === "ipv4" &&
        service.checks[1]?.protocol === "ipv6",
    ),
    true,
  );
  assert.equal(documents.responseTimes.series.length, 10);
  assert.equal(documents.incidents.events.length, 2);
  assert.equal(
    JSON.stringify(documents).match(/url|slug|dailyMinutesDown|generator|upptime/gi),
    null,
  );
});

test("preserves a service when no IPv6 sibling exists", () => {
  const documents = convertUpptimeSnapshot(createSingleSiteSnapshot(), {
    generatedAt: "2026-07-06T13:00:00.000Z",
  });

  assert.deepEqual(documents.status.services[0]?.checks, [
    {
      id: "ipv4",
      protocol: "ipv4",
      status: "operational",
      checkedAt: "2026-07-06T12:00:00.000Z",
      responseTimeMs: 420,
    },
  ]);
});

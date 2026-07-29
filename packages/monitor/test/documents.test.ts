import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";

type TestCheckState = {
  serviceId: string;
  checkId: string;
  status: "up" | "degraded" | "down" | "unavailable";
  confirmedStatus: "up" | "down" | null;
  targetAvailability: "available" | "unavailable" | "unobserved";
  failureStreak: number;
  recoveryStreak: number;
  checkedAt: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: string | null;
};

type TestStateChange = {
  runId: string;
  serviceId: string;
  changedAt: string;
  status: TestCheckState["status"];
  targetAvailability: TestCheckState["targetAvailability"];
};

type TestResponseSample = {
  serviceId: string;
  checkId: string;
  timestamp: string;
  responseTimeMs: number | null;
};

type DailyAvailability = {
  date: string;
  monitoredSeconds: number;
  unavailableSeconds: number;
};

type ImportedDailyAvailability = DailyAvailability & {
  serviceId: string;
  source: {
    kind: "upptime";
    repository: string;
    commit: string;
    path: string;
  };
};

type TestDocumentInput = {
  generatedAt: string;
  monitoringStartedAt: string;
  retentionDays: number;
  services: Array<{
    id: string;
    name: string;
    checks: TestCheckState[];
  }>;
  stateChanges: TestStateChange[];
  importedDailyAvailability?: ImportedDailyAvailability[];
  maintenanceWindows: Array<{
    id: string;
    affectedServiceIds: string[];
    startsAt: string;
    endsAt: string;
  }>;
  responseSamples: TestResponseSample[];
};

type CreateMonitorDocuments = (input: TestDocumentInput) => {
  status: unknown;
  responseTimes: unknown;
};

type CreateResponseTimesDocument = (
  input: Pick<
    TestDocumentInput,
    "generatedAt" | "monitoringStartedAt" | "services" | "responseSamples"
  >,
) => unknown;

const documentsModule = import("../src/index.js").catch(() => ({}));

async function documentFunctions(): Promise<{
  createMonitorDocuments: CreateMonitorDocuments;
}> {
  const module = (await documentsModule) as Record<string, unknown>;
  if (typeof module.createMonitorDocuments !== "function") {
    assert.fail("@velvet/monitor must export createMonitorDocuments");
  }
  return {
    createMonitorDocuments:
      module.createMonitorDocuments as CreateMonitorDocuments,
  };
}

async function responseDocumentFunctions(): Promise<{
  createResponseTimesDocument: CreateResponseTimesDocument;
}> {
  const module = (await documentsModule) as Record<string, unknown>;
  if (typeof module.createResponseTimesDocument !== "function") {
    assert.fail("@velvet/monitor must export createResponseTimesDocument");
  }
  return {
    createResponseTimesDocument:
      module.createResponseTimesDocument as CreateResponseTimesDocument,
  };
}

function checkState(
  checkId: string,
  overrides: Partial<TestCheckState> = {},
): TestCheckState {
  return {
    serviceId: "website",
    checkId,
    status: "up",
    confirmedStatus: "up",
    targetAvailability: "available",
    failureStreak: 0,
    recoveryStreak: 0,
    checkedAt: "2026-07-29T01:59:00.000Z",
    responseTimeMs: 125,
    statusCode: 200,
    failureCode: null,
    ...overrides,
  };
}

test("creates contract-valid status and response-time documents", async () => {
  const { createMonitorDocuments } = await documentFunctions();
  const documents = createMonitorDocuments({
    generatedAt: "2026-07-29T02:00:00.000Z",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    retentionDays: 365,
    services: [
      {
        id: "website",
        name: "Website",
        checks: [
          checkState("primary"),
          checkState("secondary", {
            status: "unavailable",
            confirmedStatus: null,
            targetAvailability: "unobserved",
            responseTimeMs: null,
            statusCode: null,
            failureCode: "SECRET_NOT_FOUND",
          }),
        ],
      },
    ],
    stateChanges: [
      {
        runId: "run-1",
        serviceId: "website",
        changedAt: "2026-07-29T00:00:00.000Z",
        status: "up",
        targetAvailability: "available",
      },
      {
        runId: "run-2",
        serviceId: "website",
        changedAt: "2026-07-29T01:00:00.000Z",
        status: "degraded",
        targetAvailability: "unavailable",
      },
      {
        runId: "run-3",
        serviceId: "website",
        changedAt: "2026-07-29T01:00:30.000Z",
        status: "up",
        targetAvailability: "available",
      },
    ],
    maintenanceWindows: [],
    responseSamples: [
      {
        serviceId: "website",
        checkId: "primary",
        timestamp: "2026-07-29T01:58:00.000Z",
        responseTimeMs: 120,
      },
      {
        serviceId: "website",
        checkId: "secondary",
        timestamp: "2026-07-29T01:58:01.000Z",
        responseTimeMs: null,
      },
    ],
  });

  assert.equal(validateStatusDocument(documents.status).success, true);
  assert.equal(
    validateResponseTimesDocument(documents.responseTimes).success,
    true,
  );
  assert.deepEqual(documents.status, {
    schemaVersion: 1,
    generatedAt: "2026-07-29T02:00:00.000Z",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    services: [
      {
        id: "website",
        name: "Website",
        status: "degraded",
        checks: [
          {
            id: "primary",
            protocol: "ipv4",
            status: "operational",
            checkedAt: "2026-07-29T01:59:00.000Z",
            responseTimeMs: 125,
          },
          {
            id: "secondary",
            protocol: "ipv4",
            status: "unknown",
            checkedAt: "2026-07-29T01:59:00.000Z",
            responseTimeMs: null,
          },
        ],
        dailyAvailability: [
          {
            date: "2026-07-29",
            monitoredSeconds: 7_200,
            unavailableSeconds: 30,
          },
        ],
      },
    ],
  });
  assert.deepEqual(documents.responseTimes, {
    schemaVersion: 1,
    generatedAt: "2026-07-29T02:00:00.000Z",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    series: [
      {
        serviceId: "website",
        checkId: "primary",
        protocol: "ipv4",
        samples: [
          {
            timestamp: "2026-07-29T01:58:00.000Z",
            responseTimeMs: 120,
          },
        ],
      },
      {
        serviceId: "website",
        checkId: "secondary",
        protocol: "ipv4",
        samples: [
          {
            timestamp: "2026-07-29T01:58:01.000Z",
            responseTimeMs: null,
          },
        ],
      },
    ],
  });
});

test("passes the configured retention period to status history", async () => {
  const { createMonitorDocuments } = await documentFunctions();
  const documents = createMonitorDocuments({
    generatedAt: "2026-07-29T12:00:00.000Z",
    monitoringStartedAt: "2026-07-27T00:00:00.000Z",
    retentionDays: 1,
    services: [
      {
        id: "website",
        name: "Website",
        checks: [
          checkState("primary", {
            checkedAt: "2026-07-29T11:59:00.000Z",
          }),
        ],
      },
    ],
    stateChanges: [
      {
        runId: "run-1",
        serviceId: "website",
        changedAt: "2026-07-27T00:00:00.000Z",
        status: "up",
        targetAvailability: "available",
      },
    ],
    maintenanceWindows: [],
    responseSamples: [],
  }) as {
    status: { services: Array<{ dailyAvailability: DailyAvailability[] }> };
  };

  assert.deepEqual(documents.status.services[0]?.dailyAvailability, [
    {
      date: "2026-07-28",
      monitoredSeconds: 43_200,
      unavailableSeconds: 0,
    },
    {
      date: "2026-07-29",
      monitoredSeconds: 43_200,
      unavailableSeconds: 0,
    },
  ]);
});

test("keeps imported daily availability and prefers native history for overlapping days", async () => {
  const { createMonitorDocuments } = await documentFunctions();
  const documents = createMonitorDocuments({
    generatedAt: "2026-07-29T12:00:00.000Z",
    monitoringStartedAt: "2026-07-27T00:00:00.000Z",
    retentionDays: 365,
    services: [
      {
        id: "website",
        name: "Website",
        checks: [
          checkState("primary", {
            checkedAt: "2026-07-29T11:59:00.000Z",
          }),
        ],
      },
    ],
    stateChanges: [
      {
        runId: "run-1",
        serviceId: "website",
        changedAt: "2026-07-28T00:00:00.000Z",
        status: "up",
        targetAvailability: "available",
      },
    ],
    importedDailyAvailability: [
      {
        serviceId: "website",
        date: "2026-07-27",
        monitoredSeconds: 86_400,
        unavailableSeconds: 600,
        source: {
          kind: "upptime",
          repository: "example/status",
          commit: "0123456789abcdef0123456789abcdef01234567",
          path: "history/website.yml",
        },
      },
      {
        serviceId: "website",
        date: "2026-07-28",
        monitoredSeconds: 86_400,
        unavailableSeconds: 1_200,
        source: {
          kind: "upptime",
          repository: "example/status",
          commit: "0123456789abcdef0123456789abcdef01234567",
          path: "history/website.yml",
        },
      },
    ],
    maintenanceWindows: [],
    responseSamples: [],
  }) as {
    status: { services: Array<{ dailyAvailability: DailyAvailability[] }> };
  };

  assert.deepEqual(documents.status.services[0]?.dailyAvailability, [
    {
      date: "2026-07-27",
      monitoredSeconds: 86_400,
      unavailableSeconds: 600,
    },
    {
      date: "2026-07-28",
      monitoredSeconds: 86_400,
      unavailableSeconds: 0,
    },
    {
      date: "2026-07-29",
      monitoredSeconds: 43_200,
      unavailableSeconds: 0,
    },
  ]);
});

test("drops imported daily availability outside retention", async () => {
  const { createMonitorDocuments } = await documentFunctions();
  const source = {
    kind: "upptime" as const,
    repository: "example/status",
    commit: "0123456789abcdef0123456789abcdef01234567",
    path: "history/website.yml",
  };
  const documents = createMonitorDocuments({
    generatedAt: "2026-07-29T12:00:00.000Z",
    monitoringStartedAt: "2025-07-28T00:00:00.000Z",
    retentionDays: 365,
    services: [
      {
        id: "website",
        name: "Website",
        checks: [
          checkState("primary", {
            checkedAt: "2026-07-29T11:59:00.000Z",
          }),
        ],
      },
    ],
    stateChanges: [],
    importedDailyAvailability: [
      {
        serviceId: "website",
        date: "2025-07-29",
        monitoredSeconds: 86_400,
        unavailableSeconds: 60,
        source,
      },
      {
        serviceId: "website",
        date: "2025-07-30",
        monitoredSeconds: 86_400,
        unavailableSeconds: 120,
        source,
      },
    ],
    maintenanceWindows: [],
    responseSamples: [],
  }) as {
    status: { services: Array<{ dailyAvailability: DailyAvailability[] }> };
  };

  assert.deepEqual(documents.status.services[0]?.dailyAvailability, [
    {
      date: "2025-07-30",
      monitoredSeconds: 86_400,
      unavailableSeconds: 120,
    },
  ]);
});

test("rejects generated documents that fail the public contract", async () => {
  const { createMonitorDocuments } = await documentFunctions();

  assert.throws(
    () =>
      createMonitorDocuments({
        generatedAt: "2026-07-29T02:00:00.000Z",
        monitoringStartedAt: "2026-07-29T00:00:00.000Z",
        retentionDays: 365,
        services: [
          {
            id: "invalid service id",
            name: "Website",
            checks: [checkState("primary")],
          },
        ],
        stateChanges: [],
        maintenanceWindows: [],
        responseSamples: [],
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_STATUS_DOCUMENT",
  );
});

test("creates a response-time document without an uptime-state update", async () => {
  const { createResponseTimesDocument } = await responseDocumentFunctions();
  const services = [
    {
      id: "website",
      name: "Website",
      checks: [checkState("primary")],
    },
  ];
  const originalServices = structuredClone(services);
  const responseTimes = createResponseTimesDocument({
    generatedAt: "2026-07-29T02:00:00.000Z",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    services,
    responseSamples: [
      {
        serviceId: "website",
        checkId: "primary",
        timestamp: "2026-07-29T01:59:00.000Z",
        responseTimeMs: 125,
      },
    ],
  });

  assert.equal(validateResponseTimesDocument(responseTimes).success, true);
  assert.deepEqual(services, originalServices);
});

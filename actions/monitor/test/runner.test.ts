import assert from "node:assert/strict";
import { test } from "bun:test";

import type { IncidentsDocument } from "@velvet/contracts";
import type {
  MonitorObservation,
  MonitorPersistentState,
  MonitorStateContent,
} from "@velvet/monitor";

type RunnerInput = {
  mode: string;
  runId: string;
  repository: string;
  configurationSource: string;
  currentState: MonitorPersistentState | null;
  currentIncidents: IncidentsDocument | null;
};

type RunnerSummary = {
  mode: "status" | "response";
  outcome: "prepared" | "duplicate" | "stale";
  availableChecks: number;
  unavailableChecks: number;
  incidentResult: "reconciled" | "unchanged";
};

type RunnerResult =
  | {
      outcome: "prepared";
      run: {
        id: string;
        kind: "uptime" | "response";
        startedAt: string;
        completedAt: string;
      };
      content: MonitorStateContent;
      incidents: IncidentsDocument;
      summary: RunnerSummary;
    }
  | {
      outcome: "duplicate" | "stale";
      summary: RunnerSummary;
    };

type RunMonitorAction = (
  input: RunnerInput,
  dependencies: {
    now: () => Date;
    executeChecks: () => Promise<MonitorObservation[]>;
    reconcileIncidents?: (input: Record<string, unknown>) => Promise<{
      document: IncidentsDocument;
    }>;
    writeSummary: (summary: RunnerSummary) => Promise<void>;
  },
) => Promise<RunnerResult>;

const runnerModule = import("../src/runner.js").catch(() => ({}));

async function runnerFunction(): Promise<RunMonitorAction> {
  const module = (await runnerModule) as Record<string, unknown>;
  if (typeof module.runMonitorAction !== "function") {
    assert.fail("@velvet/monitor-action must export runMonitorAction");
  }
  return module.runMonitorAction as RunMonitorAction;
}

function configuration(extra = ""): string {
  return `
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: Website, url: https://example.com }
incidents: { failureThreshold: 1, recoveryThreshold: 1 }
history: { retentionDays: 30 }
${extra}`;
}

function observation(
  targetAvailability: "available" | "unavailable",
): MonitorObservation {
  return {
    serviceId: "website",
    checkId: "website",
    checkedAt: "2026-07-29T12:00:00.500Z",
    targetAvailability,
    responseTimeMs: targetAvailability === "available" ? 125 : null,
    statusCode: targetAvailability === "available" ? 200 : 503,
    failureCode:
      targetAvailability === "available" ? null : "UNEXPECTED_STATUS",
    attempts: targetAvailability === "available" ? 1 : 2,
  };
}

test("prepares a status snapshot only after its status document is valid", async () => {
  const runMonitorAction = await runnerFunction();
  const timestamps = [
    new Date("2026-07-29T12:00:00.000Z"),
    new Date("2026-07-29T12:00:01.000Z"),
  ];
  const reconciledInputs: Array<Record<string, unknown>> = [];
  const summaries: RunnerSummary[] = [];
  const incidents: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:01.000Z",
    events: [
      {
        id: "incident-1",
        kind: "incident",
        state: "open",
        title: "Website is unavailable",
        summary: "Website reported a confirmed outage.",
        affectedServiceIds: ["website"],
        startsAt: "2026-07-29T12:00:00.500Z",
        endsAt: null,
      },
    ],
  };

  const result = await runMonitorAction(
    {
      mode: "status",
      runId: "123:status",
      repository: "example/status",
      configurationSource: configuration(),
      currentState: null,
      currentIncidents: null,
    },
    {
      now: () => timestamps.shift()!,
      executeChecks: async () => [observation("unavailable")],
      reconcileIncidents: async (input) => {
        reconciledInputs.push(input);
        return { document: incidents };
      },
      writeSummary: async (summary) => {
        summaries.push(summary);
      },
    },
  );

  assert.equal(result.outcome, "prepared");
  if (result.outcome !== "prepared") return;
  assert.equal(result.run.kind, "uptime");
  assert.equal(result.content.current.checks[0]?.status, "down");
  assert.equal(result.content.current.checks[0]?.confirmedStatus, "down");
  assert.equal(result.content.stateChanges.length, 1);
  assert.deepEqual(result.content.importedDailyAvailability, []);
  assert.equal(result.content.documents.status.services[0]?.status, "outage");
  assert.equal(
    (reconciledInputs[0]?.checkStates as Array<{ status: string }>)[0]
      ?.status,
    "down",
  );
  assert.deepEqual(result.incidents, incidents);
  assert.deepEqual(summaries, [result.summary]);
  assert.deepEqual(result.summary, {
    mode: "status",
    outcome: "prepared",
    availableChecks: 0,
    unavailableChecks: 1,
    incidentResult: "reconciled",
  });
});

test("keeps the later incident generation time after GitHub closes an issue", async () => {
  const runMonitorAction = await runnerFunction();
  const timestamps = [
    new Date("2026-07-29T12:00:00.000Z"),
    new Date("2026-07-29T12:00:01.000Z"),
  ];
  const incidents: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:02.000Z",
    events: [
      {
        id: "incident-1",
        kind: "incident",
        state: "resolved",
        title: "Website was unavailable",
        summary: "Website recovered.",
        affectedServiceIds: ["website"],
        startsAt: "2026-07-29T11:59:00.000Z",
        endsAt: "2026-07-29T12:00:02.000Z",
      },
    ],
  };

  const result = await runMonitorAction(
    {
      mode: "status",
      runId: "123-recovery:status",
      repository: "example/status",
      configurationSource: configuration(),
      currentState: null,
      currentIncidents: null,
    },
    {
      now: () => timestamps.shift()!,
      executeChecks: async () => [observation("available")],
      reconcileIncidents: async () => ({ document: incidents }),
      writeSummary: async () => undefined,
    },
  );

  assert.equal(result.outcome, "prepared");
  if (result.outcome !== "prepared") return;
  assert.equal(result.incidents.generatedAt, incidents.generatedAt);
  assert.deepEqual(result.incidents.events, incidents.events);
});

test("adds response samples without changing uptime state or incidents", async () => {
  const runMonitorAction = await runnerFunction();
  const firstTimestamps = [
    new Date("2026-07-29T12:00:00.000Z"),
    new Date("2026-07-29T12:00:01.000Z"),
  ];
  const emptyIncidents: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:01.000Z",
    events: [],
  };
  const first = await runMonitorAction(
    {
      mode: "status",
      runId: "123:status",
      repository: "example/status",
      configurationSource: configuration(),
      currentState: null,
      currentIncidents: null,
    },
    {
      now: () => firstTimestamps.shift()!,
      executeChecks: async () => [observation("available")],
      reconcileIncidents: async () => ({ document: emptyIncidents }),
      writeSummary: async () => undefined,
    },
  );
  assert.equal(first.outcome, "prepared");
  if (first.outcome !== "prepared") return;
  const currentState: MonitorPersistentState = {
    ...first.content,
    schemaVersion: 4,
    processedRuns: [first.run],
  };
  const responseTimestamps = [
    new Date("2026-07-29T18:00:00.000Z"),
    new Date("2026-07-29T18:00:01.000Z"),
  ];
  const summaries: RunnerSummary[] = [];
  let reconciled = false;

  const response = await runMonitorAction(
    {
      mode: "response",
      runId: "124:response",
      repository: "example/status",
      configurationSource: configuration(),
      currentState,
      currentIncidents: emptyIncidents,
    },
    {
      now: () => responseTimestamps.shift()!,
      executeChecks: async () => [
        {
          ...observation("unavailable"),
          checkedAt: "2026-07-29T18:00:00.500Z",
        },
      ],
      reconcileIncidents: async () => {
        reconciled = true;
        return { document: emptyIncidents };
      },
      writeSummary: async (summary) => {
        summaries.push(summary);
      },
    },
  );

  assert.equal(response.outcome, "prepared");
  if (response.outcome !== "prepared") return;
  assert.equal(response.run.kind, "response");
  assert.deepEqual(response.content.current, currentState.current);
  assert.deepEqual(response.content.stateChanges, currentState.stateChanges);
  assert.deepEqual(
    response.content.documents.status,
    currentState.documents.status,
  );
  assert.deepEqual(response.incidents, emptyIncidents);
  assert.equal(reconciled, false);
  assert.deepEqual(response.content.responseSamples, [
    {
      serviceId: "website",
      checkId: "website",
      timestamp: "2026-07-29T18:00:00.500Z",
      responseTimeMs: null,
    },
  ]);
  assert.deepEqual(summaries, [
    {
      mode: "response",
      outcome: "prepared",
      availableChecks: 0,
      unavailableChecks: 1,
      incidentResult: "unchanged",
    },
  ]);
});

test("rejects invalid configuration before checks or incident changes", async () => {
  const runMonitorAction = await runnerFunction();
  let sideEffect = false;

  await assert.rejects(
    runMonitorAction(
      {
        mode: "status",
        runId: "125:status",
        repository: "example/status",
        configurationSource: configuration("history: { retentionDays: 366 }"),
        currentState: null,
        currentIncidents: null,
      },
      {
        now: () => new Date("2026-07-29T12:00:00.000Z"),
        executeChecks: async () => {
          sideEffect = true;
          return [];
        },
        reconcileIncidents: async () => {
          sideEffect = true;
          return {
            document: {
              schemaVersion: 1,
              generatedAt: "2026-07-29T12:00:00.000Z",
              events: [],
            },
          };
        },
        writeSummary: async () => undefined,
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_CONFIGURATION",
  );

  assert.equal(sideEffect, false);
});

test("redacts unexpected check-executor failures", async () => {
  const runMonitorAction = await runnerFunction();
  const secret = "Bearer do-not-expose";

  await assert.rejects(
    runMonitorAction(
      {
        mode: "response",
        runId: "126:response",
        repository: "example/status",
        configurationSource: configuration(),
        currentState: null,
        currentIncidents: null,
      },
      {
        now: () => new Date("2026-07-29T12:00:00.000Z"),
        executeChecks: async () => Promise.reject(new Error(secret)),
        writeSummary: async () => undefined,
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INTERNAL_FAILURE" &&
      "errorId" in error &&
      typeof error.errorId === "string" &&
      !error.message.includes(secret),
  );
});

test("drops retained history for services removed from configuration", async () => {
  const runMonitorAction = await runnerFunction();
  const emptyIncidents: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:01.000Z",
    events: [],
  };
  const firstTimestamps = [
    new Date("2026-07-29T12:00:00.000Z"),
    new Date("2026-07-29T12:00:01.000Z"),
  ];
  const first = await runMonitorAction(
    {
      mode: "status",
      runId: "127:status",
      repository: "example/status",
      configurationSource: `
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: Website, url: https://example.com }
  - { name: API, url: https://api.example.com }
incidents: { failureThreshold: 1, recoveryThreshold: 1 }
`,
      currentState: null,
      currentIncidents: null,
    },
    {
      now: () => firstTimestamps.shift()!,
      executeChecks: async () => [
        observation("available"),
        {
          ...observation("available"),
          serviceId: "api",
          checkId: "api",
        },
      ],
      reconcileIncidents: async () => ({ document: emptyIncidents }),
      writeSummary: async () => undefined,
    },
  );
  assert.equal(first.outcome, "prepared");
  if (first.outcome !== "prepared") return;
  const currentState: MonitorPersistentState = {
    ...first.content,
    schemaVersion: 4,
    processedRuns: [first.run],
  };
  const secondTimestamps = [
    new Date("2026-07-29T12:05:00.000Z"),
    new Date("2026-07-29T12:05:01.000Z"),
  ];

  const second = await runMonitorAction(
    {
      mode: "status",
      runId: "128:status",
      repository: "example/status",
      configurationSource: configuration(),
      currentState,
      currentIncidents: emptyIncidents,
    },
    {
      now: () => secondTimestamps.shift()!,
      executeChecks: async () => [
        {
          ...observation("available"),
          checkedAt: "2026-07-29T12:05:00.500Z",
        },
      ],
      reconcileIncidents: async () => ({ document: emptyIncidents }),
      writeSummary: async () => undefined,
    },
  );

  assert.equal(second.outcome, "prepared");
  if (second.outcome !== "prepared") return;
  assert.equal(
    second.content.stateChanges.every(
      ({ serviceId }) => serviceId === "website",
    ),
    true,
  );
});

test("retains imported daily availability across native status runs", async () => {
  const runMonitorAction = await runnerFunction();
  const firstTimestamps = [
    new Date("2026-07-29T12:00:00.000Z"),
    new Date("2026-07-29T12:00:01.000Z"),
  ];
  const emptyIncidents: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:01.000Z",
    events: [],
  };
  const first = await runMonitorAction(
    {
      mode: "status",
      runId: "129:status",
      repository: "example/status",
      configurationSource: configuration(),
      currentState: null,
      currentIncidents: null,
    },
    {
      now: () => firstTimestamps.shift()!,
      executeChecks: async () => [observation("available")],
      reconcileIncidents: async () => ({ document: emptyIncidents }),
      writeSummary: async () => undefined,
    },
  );
  assert.equal(first.outcome, "prepared");
  if (first.outcome !== "prepared") return;
  const currentState: MonitorPersistentState = {
    ...first.content,
    monitoringStartedAt: "2026-07-27T00:00:00.000Z",
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
    ],
    schemaVersion: 4,
    processedRuns: [first.run],
  };
  const secondTimestamps = [
    new Date("2026-07-29T12:05:00.000Z"),
    new Date("2026-07-29T12:05:01.000Z"),
  ];

  const second = await runMonitorAction(
    {
      mode: "status",
      runId: "130:status",
      repository: "example/status",
      configurationSource: configuration(),
      currentState,
      currentIncidents: emptyIncidents,
    },
    {
      now: () => secondTimestamps.shift()!,
      executeChecks: async () => [
        {
          ...observation("available"),
          checkedAt: "2026-07-29T12:05:00.500Z",
        },
      ],
      reconcileIncidents: async () => ({ document: emptyIncidents }),
      writeSummary: async () => undefined,
    },
  );

  assert.equal(second.outcome, "prepared");
  if (second.outcome !== "prepared") return;
  assert.deepEqual(
    second.content.importedDailyAvailability,
    currentState.importedDailyAvailability,
  );
  assert.deepEqual(
    second.content.documents.status.services[0]?.dailyAvailability[0],
    {
      date: "2026-07-27",
      monitoredSeconds: 86_400,
      unavailableSeconds: 600,
    },
  );
});

test("retains imported incident history when native incidents are reconciled", async () => {
  const runMonitorAction = await runnerFunction();
  const migrationConfiguration = configuration().replace(
    "retentionDays: 30",
    "retentionDays: 365",
  );
  const expiredEvent = {
    id: "incident-6",
    kind: "incident" as const,
    state: "resolved" as const,
    title: "Expired incident",
    summary: "Older than the configured retention period.",
    affectedServiceIds: ["website"],
    startsAt: "2025-07-27T10:00:00.000Z",
    endsAt: "2025-07-28T10:15:00.000Z",
  };
  const importedEvent = {
    id: "incident-7",
    kind: "incident" as const,
    state: "resolved" as const,
    title: "Website was unavailable",
    summary: "Imported from the previous monitor.",
    affectedServiceIds: ["website"],
    startsAt: "2026-07-28T10:00:00.000Z",
    endsAt: "2026-07-28T10:15:00.000Z",
  };
  const importedIncidents: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:01.000Z",
    events: [expiredEvent, importedEvent],
  };
  const firstTimestamps = [
    new Date("2026-07-29T12:00:00.000Z"),
    new Date("2026-07-29T12:00:01.000Z"),
  ];
  const first = await runMonitorAction(
    {
      mode: "status",
      runId: "131:status",
      repository: "example/status",
      configurationSource: migrationConfiguration,
      currentState: null,
      currentIncidents: null,
    },
    {
      now: () => firstTimestamps.shift()!,
      executeChecks: async () => [observation("available")],
      reconcileIncidents: async () => ({
        document: {
          schemaVersion: 1,
          generatedAt: "2026-07-29T12:00:01.000Z",
          events: [],
        },
      }),
      writeSummary: async () => undefined,
    },
  );
  assert.equal(first.outcome, "prepared");
  if (first.outcome !== "prepared") return;
  const currentState = {
    ...first.content,
    importedEvents: [
      {
        event: expiredEvent,
        source: {
          kind: "upptime",
          repository: "example/status",
          commit: "0123456789abcdef0123456789abcdef01234567",
          issueUrl: "https://github.com/example/status/issues/6",
        },
      },
      {
        event: importedEvent,
        source: {
          kind: "upptime",
          repository: "example/status",
          commit: "0123456789abcdef0123456789abcdef01234567",
          issueUrl: "https://github.com/example/status/issues/7",
        },
      },
    ],
    schemaVersion: 4,
    processedRuns: [first.run],
  } as MonitorPersistentState;
  const secondTimestamps = [
    new Date("2026-07-29T12:05:00.000Z"),
    new Date("2026-07-29T12:05:01.000Z"),
  ];

  const second = await runMonitorAction(
    {
      mode: "status",
      runId: "132:status",
      repository: "example/status",
      configurationSource: migrationConfiguration,
      currentState,
      currentIncidents: importedIncidents,
    },
    {
      now: () => secondTimestamps.shift()!,
      executeChecks: async () => [
        {
          ...observation("available"),
          checkedAt: "2026-07-29T12:05:00.500Z",
        },
      ],
      reconcileIncidents: async () => ({
        document: {
          schemaVersion: 1,
          generatedAt: "2026-07-29T12:05:01.000Z",
          events: [],
        },
      }),
      writeSummary: async () => undefined,
    },
  );

  assert.equal(second.outcome, "prepared");
  if (second.outcome !== "prepared") return;
  assert.deepEqual(second.incidents.events, [importedEvent]);
  assert.deepEqual(
    second.content.importedEvents.map(({ event }) => event.id),
    ["incident-7"],
  );

  const nativeEvent = {
    ...importedEvent,
    state: "open" as const,
    title: "Native incident",
    startsAt: "2026-07-29T12:09:00.000Z",
    endsAt: null,
  };
  const thirdTimestamps = [
    new Date("2026-07-29T12:10:00.000Z"),
    new Date("2026-07-29T12:10:01.000Z"),
  ];
  const third = await runMonitorAction(
    {
      mode: "status",
      runId: "133:status",
      repository: "example/status",
      configurationSource: migrationConfiguration,
      currentState: {
        ...second.content,
        schemaVersion: 4,
        processedRuns: [first.run, second.run],
      },
      currentIncidents: second.incidents,
    },
    {
      now: () => thirdTimestamps.shift()!,
      executeChecks: async () => [
        {
          ...observation("available"),
          checkedAt: "2026-07-29T12:10:00.500Z",
        },
      ],
      reconcileIncidents: async () => ({
        document: {
          schemaVersion: 1,
          generatedAt: "2026-07-29T12:10:01.000Z",
          events: [nativeEvent],
        },
      }),
      writeSummary: async () => undefined,
    },
  );

  assert.equal(third.outcome, "prepared");
  if (third.outcome !== "prepared") return;
  assert.deepEqual(third.incidents.events, [nativeEvent]);
  assert.deepEqual(third.content.importedEvents, []);

  const fourthTimestamps = [
    new Date("2026-07-29T12:15:00.000Z"),
    new Date("2026-07-29T12:15:01.000Z"),
  ];
  const fourth = await runMonitorAction(
    {
      mode: "status",
      runId: "134:status",
      repository: "example/status",
      configurationSource: migrationConfiguration,
      currentState: {
        ...third.content,
        schemaVersion: 4,
        processedRuns: [first.run, second.run, third.run],
      },
      currentIncidents: third.incidents,
    },
    {
      now: () => fourthTimestamps.shift()!,
      executeChecks: async () => [
        {
          ...observation("available"),
          checkedAt: "2026-07-29T12:15:00.500Z",
        },
      ],
      reconcileIncidents: async () => ({
        document: {
          schemaVersion: 1,
          generatedAt: "2026-07-29T12:15:01.000Z",
          events: [],
        },
      }),
      writeSummary: async () => undefined,
    },
  );

  assert.equal(fourth.outcome, "prepared");
  if (fourth.outcome !== "prepared") return;
  assert.deepEqual(fourth.incidents.events, []);
});

test("advances imported maintenance through its lifecycle and retention", async () => {
  const runMonitorAction = await runnerFunction();
  const maintenanceConfiguration = configuration().replace(
    "retentionDays: 30",
    "retentionDays: 1",
  );
  const importedMaintenance = {
    id: "maintenance-8",
    kind: "maintenance" as const,
    state: "scheduled" as const,
    title: "Database maintenance",
    summary: "Imported planned work.",
    affectedServiceIds: ["website"],
    startsAt: "2026-07-29T12:05:00.000Z",
    endsAt: "2026-07-29T12:10:00.000Z",
  };
  const runStatus = async (
    runId: string,
    startedAt: string,
    completedAt: string,
    currentState: MonitorPersistentState | null,
    currentIncidents: IncidentsDocument | null,
    nativeEvents: IncidentsDocument["events"],
  ): Promise<RunnerResult> => {
    const timestamps = [new Date(startedAt), new Date(completedAt)];
    return runMonitorAction(
      {
        mode: "status",
        runId,
        repository: "example/status",
        configurationSource: maintenanceConfiguration,
        currentState,
        currentIncidents,
      },
      {
        now: () => timestamps.shift()!,
        executeChecks: async () => [
          {
            ...observation("available"),
            checkedAt: new Date(Date.parse(startedAt) + 500).toISOString(),
          },
        ],
        reconcileIncidents: async () => ({
          document: {
            schemaVersion: 1,
            generatedAt: completedAt,
            events: nativeEvents,
          },
        }),
        writeSummary: async () => undefined,
      },
    );
  };

  const initial = await runStatus(
    "135:status",
    "2026-07-29T12:00:00.000Z",
    "2026-07-29T12:00:01.000Z",
    null,
    null,
    [],
  );
  assert.equal(initial.outcome, "prepared");
  if (initial.outcome !== "prepared") return;
  const seededState: MonitorPersistentState = {
    ...initial.content,
    importedEvents: [
      {
        event: importedMaintenance,
        source: {
          kind: "upptime",
          repository: "example/status",
          commit: "0123456789abcdef0123456789abcdef01234567",
          issueUrl: "https://github.com/example/status/issues/8",
        },
      },
    ],
    schemaVersion: 4,
    processedRuns: [initial.run],
  };
  const importedDocument: IncidentsDocument = {
    schemaVersion: 1,
    generatedAt: "2026-07-29T12:00:01.000Z",
    events: [importedMaintenance],
  };

  const scheduled = await runStatus(
    "136:status",
    "2026-07-29T12:04:00.000Z",
    "2026-07-29T12:04:01.000Z",
    seededState,
    importedDocument,
    [],
  );
  assert.equal(scheduled.outcome, "prepared");
  if (scheduled.outcome !== "prepared") return;
  assert.equal(scheduled.incidents.events[0]?.state, "scheduled");

  const active = await runStatus(
    "137:status",
    "2026-07-29T12:06:00.000Z",
    "2026-07-29T12:06:01.000Z",
    {
      ...scheduled.content,
      schemaVersion: 4,
      processedRuns: [initial.run, scheduled.run],
    },
    scheduled.incidents,
    [],
  );
  assert.equal(active.outcome, "prepared");
  if (active.outcome !== "prepared") return;
  assert.equal(active.incidents.events[0]?.state, "active");

  const nativeMaintenance = {
    id: "maintenance-9",
    kind: "maintenance" as const,
    state: "active" as const,
    title: "Native maintenance",
    summary: "Created through Velvet.",
    affectedServiceIds: ["website"],
    startsAt: "2026-07-29T12:10:00.000Z",
    endsAt: "2026-07-29T12:20:00.000Z",
  };
  const completed = await runStatus(
    "138:status",
    "2026-07-29T12:11:00.000Z",
    "2026-07-29T12:11:01.000Z",
    {
      ...active.content,
      schemaVersion: 4,
      processedRuns: [initial.run, scheduled.run, active.run],
    },
    active.incidents,
    [nativeMaintenance],
  );
  assert.equal(completed.outcome, "prepared");
  if (completed.outcome !== "prepared") return;
  assert.deepEqual(
    completed.incidents.events.map(({ id, state }) => ({ id, state })),
    [
      { id: "maintenance-8", state: "completed" },
      { id: "maintenance-9", state: "active" },
    ],
  );

  const expired = await runStatus(
    "139:status",
    "2026-07-31T12:11:00.000Z",
    "2026-07-31T12:11:01.000Z",
    {
      ...completed.content,
      schemaVersion: 4,
      processedRuns: [
        initial.run,
        scheduled.run,
        active.run,
        completed.run,
      ],
    },
    completed.incidents,
    [],
  );
  assert.equal(expired.outcome, "prepared");
  if (expired.outcome !== "prepared") return;
  assert.deepEqual(expired.content.importedEvents, []);
  assert.deepEqual(expired.incidents.events, []);
});

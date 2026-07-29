import assert from "node:assert/strict";
import { test } from "bun:test";

type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: string[];
};

type GitHubComment = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type GitHubIssuesClient = {
  listIssues(label: string): Promise<GitHubIssue[]>;
  listComments(issueNumber: number): Promise<GitHubComment[]>;
  ensureLabel(input: {
    name: string;
    color: string;
    description: string;
  }): Promise<void>;
  createIssue(input: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<GitHubIssue>;
  updateIssue(
    issueNumber: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ): Promise<GitHubIssue>;
  createComment(issueNumber: number, body: string): Promise<GitHubComment>;
};

type TestCheckState = {
  serviceId: string;
  checkId: string;
  status: "up" | "degraded" | "down" | "unavailable";
  confirmedStatus: "up" | "down" | null;
  confirmedAt: string | null;
  targetAvailability: "available" | "unavailable" | "unobserved";
  failureStreak: number;
  recoveryStreak: number;
  checkedAt: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: string | null;
};

type TestService = {
  id: string;
  name: string;
  checks: Array<{ id: string; name: string }>;
};

type ReconcileInput = {
  generatedAt: string;
  services: TestService[];
  checkStates: TestCheckState[];
  incidentLabel: string;
  maintenanceLabel: string;
};

type ReconcileResult = {
  document: {
    generatedAt: string;
    events: Array<Record<string, unknown>>;
  };
};

const reconciliationModule = import("../src/index.js").catch(() => ({}));

async function reconciliationFunctions(): Promise<{
  reconcileGitHubIncidents: (
    input: ReconcileInput,
    dependencies: {
      client: GitHubIssuesClient;
      logger?: (record: Record<string, unknown>) => void;
    },
  ) => Promise<ReconcileResult>;
  createIncidentsDocument: (input: {
    generatedAt: string;
    services: TestService[];
    issues: GitHubIssue[];
  }) => { events: Array<Record<string, unknown>> };
  serializeVelvetMetadata: (metadata: Record<string, unknown>) => string;
  parseVelvetMetadata: (body: string) => Record<string, unknown> | null;
  createMaintenanceIssueForm: (
    services: TestService[],
    maintenanceLabel: string,
  ) => string;
  GitHubIncidentsError: new (
    code: string,
    options?: { errorId?: string; status?: number; cause?: unknown },
  ) => Error;
}> {
  const module = (await reconciliationModule) as Record<string, unknown>;
  for (const name of [
    "reconcileGitHubIncidents",
    "createIncidentsDocument",
    "serializeVelvetMetadata",
    "parseVelvetMetadata",
    "GitHubIncidentsError",
  ]) {
    if (typeof module[name] !== "function") {
      assert.fail(`@velvet/github-incidents must export ${name}`);
    }
  }
  return module as Awaited<ReturnType<typeof reconciliationFunctions>>;
}

class MemoryGitHubIssuesClient implements GitHubIssuesClient {
  readonly labels = new Set<string>();
  readonly comments = new Map<number, GitHubComment[]>();
  failure: Error | null = null;
  now: string;

  constructor(
    readonly issues: GitHubIssue[],
    now = "2026-07-29T12:30:00.000Z",
  ) {
    this.now = now;
  }

  async listIssues(label: string): Promise<GitHubIssue[]> {
    return structuredClone(
      this.issues.filter(({ labels }) => labels.includes(label)),
    );
  }

  async listComments(issueNumber: number): Promise<GitHubComment[]> {
    return structuredClone(this.comments.get(issueNumber) ?? []);
  }

  async ensureLabel(input: { name: string }): Promise<void> {
    this.labels.add(input.name);
  }

  async createIssue(input: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<GitHubIssue> {
    if (this.failure !== null) throw this.failure;
    const issue: GitHubIssue = {
      number: Math.max(0, ...this.issues.map(({ number }) => number)) + 1,
      title: input.title,
      body: input.body,
      state: "open",
      createdAt: this.now,
      updatedAt: this.now,
      closedAt: null,
      labels: [...input.labels],
    };
    this.issues.push(issue);
    return structuredClone(issue);
  }

  async updateIssue(
    issueNumber: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ): Promise<GitHubIssue> {
    const issue = this.issues.find(({ number }) => number === issueNumber);
    assert.ok(issue);
    if (input.title !== undefined) issue.title = input.title;
    if (input.body !== undefined) issue.body = input.body;
    if (input.state !== undefined) {
      issue.state = input.state;
      issue.closedAt = input.state === "closed" ? this.now : null;
    }
    issue.updatedAt = this.now;
    return structuredClone(issue);
  }

  async createComment(
    issueNumber: number,
    body: string,
  ): Promise<GitHubComment> {
    const issueComments = this.comments.get(issueNumber) ?? [];
    const comment: GitHubComment = {
      id: issueNumber * 1_000 + issueComments.length + 1,
      body,
      createdAt: this.now,
      updatedAt: this.now,
    };
    issueComments.push(comment);
    this.comments.set(issueNumber, issueComments);
    return structuredClone(comment);
  }
}

const services: TestService[] = [
  {
    id: "api",
    name: "Public API",
    checks: [
      { id: "readiness", name: "Readiness" },
      { id: "version", name: "Version" },
    ],
  },
  {
    id: "website",
    name: "Website",
    checks: [{ id: "homepage", name: "Homepage" }],
  },
];

function checkState(
  serviceId: string,
  checkId: string,
  confirmedStatus: "up" | "down",
  confirmedAt: string,
): TestCheckState {
  const down = confirmedStatus === "down";
  return {
    serviceId,
    checkId,
    status: down ? "down" : "up",
    confirmedStatus,
    confirmedAt,
    targetAvailability: down ? "unavailable" : "available",
    failureStreak: down ? 2 : 0,
    recoveryStreak: 0,
    checkedAt: "2026-07-29T12:29:00.000Z",
    responseTimeMs: down ? null : 100,
    statusCode: down ? 503 : 200,
    failureCode: down ? "UNEXPECTED_STATUS" : null,
  };
}

function issue(
  number: number,
  title: string,
  body: string,
  label: string,
  overrides: Partial<GitHubIssue> = {},
): GitHubIssue {
  return {
    number,
    title,
    body,
    state: "open",
    createdAt: "2026-07-29T12:01:00.000Z",
    updatedAt: "2026-07-29T12:01:00.000Z",
    closedAt: null,
    labels: [label],
    ...overrides,
  };
}

function input(checkStates: TestCheckState[], generatedAt: string): ReconcileInput {
  return {
    generatedAt,
    services,
    checkStates,
    incidentLabel: "incident",
    maintenanceLabel: "maintenance",
  };
}

function maintenanceBody(): string {
  return "### Affected services and checks\n\n- Public API / Readiness [api/readiness]\n\n### Starts at\n\n2026-07-29T12:00:00Z\n\n### Ends at\n\n2026-07-29T13:00:00Z\n\n### Summary\n\nDatabase upgrade.";
}

test("creates one incident for a confirmed transition and stays duplicate-free", async () => {
  const { parseVelvetMetadata, reconcileGitHubIncidents } =
    await reconciliationFunctions();
  const client = new MemoryGitHubIssuesClient([]);
  const reconciliationInput = input(
    [checkState("api", "readiness", "down", "2026-07-29T12:01:00.000Z")],
    "2026-07-29T12:30:00.000Z",
  );
  const originalInput = structuredClone(reconciliationInput);

  const first = await reconcileGitHubIncidents(reconciliationInput, { client });
  const second = await reconcileGitHubIncidents(reconciliationInput, { client });

  assert.deepEqual(reconciliationInput, originalInput);
  assert.equal(client.issues.length, 1);
  assert.equal(client.issues[0]?.title, "Public API / Readiness is unavailable");
  assert.deepEqual(parseVelvetMetadata(client.issues[0]!.body), {
    schemaVersion: 1,
    kind: "incident",
    serviceId: "api",
    checkId: "readiness",
    transitionAt: "2026-07-29T12:01:00.000Z",
    startedAt: "2026-07-29T12:01:00.000Z",
  });
  assert.equal(first.document.events.length, 1);
  assert.equal(second.document.events.length, 1);
  assert.equal(first.document.events[0]?.kind, "incident");
  assert.equal(first.document.events[0]?.state, "open");
});

test("comments once and closes only incidents for a confirmed recovery", async () => {
  const { reconcileGitHubIncidents, serializeVelvetMetadata } =
    await reconciliationFunctions();
  const apiIncident = issue(
    12,
    "Public API / Readiness is unavailable",
    serializeVelvetMetadata({
      schemaVersion: 1,
      kind: "incident",
      serviceId: "api",
      checkId: "readiness",
      transitionAt: "2026-07-29T12:01:00.000Z",
      startedAt: "2026-07-29T12:01:00.000Z",
    }),
    "incident",
  );
  const websiteIncident = issue(
    13,
    "Website is unavailable",
    serializeVelvetMetadata({
      schemaVersion: 1,
      kind: "incident",
      serviceId: "website",
      checkId: "homepage",
      transitionAt: "2026-07-29T12:10:00.000Z",
      startedAt: "2026-07-29T12:10:00.000Z",
    }),
    "incident",
  );
  const manualIssue = issue(14, "Manual incident", "No Velvet marker", "incident");
  const client = new MemoryGitHubIssuesClient([
    apiIncident,
    websiteIncident,
    manualIssue,
  ]);
  const reconciliationInput = input(
    [checkState("api", "readiness", "up", "2026-07-29T12:20:00.000Z")],
    "2026-07-29T12:30:00.000Z",
  );

  await reconcileGitHubIncidents(reconciliationInput, { client });
  await reconcileGitHubIncidents(reconciliationInput, { client });

  assert.equal(client.issues.find(({ number }) => number === 12)?.state, "closed");
  assert.equal(client.issues.find(({ number }) => number === 13)?.state, "open");
  assert.equal(client.issues.find(({ number }) => number === 14)?.state, "open");
  assert.equal(client.comments.get(12)?.length, 1);
  assert.match(client.comments.get(12)?.[0]?.body ?? "", /confirmed recovery/i);
});

test("reopens a matching transition that was closed while still down", async () => {
  const { reconcileGitHubIncidents, serializeVelvetMetadata } =
    await reconciliationFunctions();
  const closedIncident = issue(
    15,
    "Public API / Readiness is unavailable",
    serializeVelvetMetadata({
      schemaVersion: 1,
      kind: "incident",
      serviceId: "api",
      checkId: "readiness",
      transitionAt: "2026-07-29T12:01:00.000Z",
      startedAt: "2026-07-29T12:01:00.000Z",
    }),
    "incident",
    {
      state: "closed",
      closedAt: "2026-07-29T12:20:00.000Z",
      updatedAt: "2026-07-29T12:20:00.000Z",
    },
  );
  const client = new MemoryGitHubIssuesClient([closedIncident]);
  const reconciliationInput = input(
    [checkState("api", "readiness", "down", "2026-07-29T12:01:00.000Z")],
    "2026-07-29T12:30:00.000Z",
  );

  await reconcileGitHubIncidents(reconciliationInput, { client });
  await reconcileGitHubIncidents(reconciliationInput, { client });

  assert.equal(client.issues.length, 1);
  assert.equal(client.issues[0]?.state, "open");
  assert.equal(client.comments.get(15)?.length, 1);
  assert.match(client.comments.get(15)?.[0]?.body ?? "", /still confirms/i);
});

test("keeps one primary issue when duplicate transition markers already exist", async () => {
  const { reconcileGitHubIncidents, serializeVelvetMetadata } =
    await reconciliationFunctions();
  const marker = serializeVelvetMetadata({
    schemaVersion: 1,
    kind: "incident",
    serviceId: "api",
    checkId: "readiness",
    transitionAt: "2026-07-29T12:01:00.000Z",
    startedAt: "2026-07-29T12:01:00.000Z",
  });
  const client = new MemoryGitHubIssuesClient([
    issue(16, "Primary incident", marker, "incident"),
    issue(17, "Duplicate incident", marker, "incident"),
  ]);
  const reconciliationInput = input(
    [checkState("api", "readiness", "down", "2026-07-29T12:01:00.000Z")],
    "2026-07-29T12:30:00.000Z",
  );

  await reconcileGitHubIncidents(reconciliationInput, { client });
  await reconcileGitHubIncidents(reconciliationInput, { client });

  assert.equal(client.issues.find(({ number }) => number === 16)?.state, "open");
  assert.equal(client.issues.find(({ number }) => number === 17)?.state, "closed");
  assert.equal(client.comments.get(17)?.length, 1);
  assert.match(client.comments.get(17)?.[0]?.body ?? "", /duplicate/i);
});

test("publishes the open primary when an older duplicate is already closed", async () => {
  const { createIncidentsDocument, serializeVelvetMetadata } =
    await reconciliationFunctions();
  const marker = serializeVelvetMetadata({
    schemaVersion: 1,
    kind: "incident",
    serviceId: "api",
    checkId: "readiness",
    transitionAt: "2026-07-29T12:01:00.000Z",
    startedAt: "2026-07-29T12:01:00.000Z",
  });

  const document = createIncidentsDocument({
    generatedAt: "2026-07-29T12:30:00.000Z",
    services,
    issues: [
      issue(16, "Closed duplicate", marker, "incident", {
        state: "closed",
        closedAt: "2026-07-29T12:20:00.000Z",
      }),
      issue(17, "Open primary", marker, "incident"),
    ],
  });

  assert.deepEqual(document.events, [
    {
      id: "incident-17",
      kind: "incident",
      state: "open",
      title: "Open primary",
      summary: "Readiness for Public API reported a confirmed outage.",
      affectedServiceIds: ["api"],
      startsAt: "2026-07-29T12:01:00.000Z",
      endsAt: null,
    },
  ]);
});

test("publishes a recovery even when GitHub closes the issue after the run timestamp", async () => {
  const { reconcileGitHubIncidents, serializeVelvetMetadata } =
    await reconciliationFunctions();
  const apiIncident = issue(
    18,
    "Public API / Readiness is unavailable",
    serializeVelvetMetadata({
      schemaVersion: 1,
      kind: "incident",
      serviceId: "api",
      checkId: "readiness",
      transitionAt: "2026-07-29T12:01:00.000Z",
      startedAt: "2026-07-29T12:01:00.000Z",
    }),
    "incident",
  );
  const client = new MemoryGitHubIssuesClient(
    [apiIncident],
    "2026-07-29T12:30:01.000Z",
  );

  const result = await reconcileGitHubIncidents(
    input(
      [checkState("api", "readiness", "up", "2026-07-29T12:20:00.000Z")],
      "2026-07-29T12:30:00.000Z",
    ),
    { client },
  );

  assert.equal(result.document.generatedAt, "2026-07-29T12:30:01.000Z");
  assert.equal(result.document.events[0]?.state, "resolved");
  assert.equal(result.document.events[0]?.endsAt, "2026-07-29T12:30:01.000Z");
});

test("suppresses exact maintenance targets, expires them, and preserves history", async () => {
  const { parseVelvetMetadata, reconcileGitHubIncidents } =
    await reconciliationFunctions();
  const maintenance = issue(
    20,
    "[Maintenance] Database upgrade",
    maintenanceBody(),
    "maintenance",
  );
  const client = new MemoryGitHubIssuesClient([maintenance]);
  const states = [
    checkState("api", "readiness", "down", "2026-07-29T12:15:00.000Z"),
    checkState("api", "version", "down", "2026-07-29T12:15:00.000Z"),
  ];

  const active = await reconcileGitHubIncidents(
    input(states, "2026-07-29T12:30:00.000Z"),
    { client },
  );

  assert.equal(client.issues.some(({ title }) => title.includes("Readiness is unavailable")), false);
  assert.equal(client.issues.some(({ title }) => title.includes("Version is unavailable")), true);
  assert.equal(parseVelvetMetadata(client.issues[0]!.body)?.kind, "maintenance");
  assert.equal(
    active.document.events.find(({ kind }) => kind === "maintenance")?.state,
    "active",
  );

  client.now = "2026-07-29T13:01:00.000Z";
  const completed = await reconcileGitHubIncidents(
    input(states, "2026-07-29T13:01:00.000Z"),
    { client },
  );
  const readiness = client.issues.find(({ title }) =>
    title.includes("Readiness is unavailable"),
  );

  assert.equal(client.issues.find(({ number }) => number === 20)?.state, "closed");
  assert.equal(client.comments.get(20)?.length, 1);
  assert.ok(readiness);
  assert.equal(parseVelvetMetadata(readiness.body)?.startedAt, "2026-07-29T13:00:00.000Z");
  assert.equal(
    completed.document.events.find(({ kind }) => kind === "maintenance")?.state,
    "completed",
  );
});

test("invalid maintenance never suppresses incidents and receives one useful comment", async () => {
  const { reconcileGitHubIncidents } = await reconciliationFunctions();
  const maintenance = issue(
    30,
    "[Maintenance] Invalid schedule",
    maintenanceBody().replace("api/readiness", "unknown/readiness"),
    "maintenance",
  );
  const client = new MemoryGitHubIssuesClient([maintenance]);
  const reconciliationInput = input(
    [checkState("api", "readiness", "down", "2026-07-29T12:15:00.000Z")],
    "2026-07-29T12:30:00.000Z",
  );

  await reconcileGitHubIncidents(reconciliationInput, { client });
  await reconcileGitHubIncidents(reconciliationInput, { client });

  assert.equal(client.issues.some(({ labels }) => labels.includes("incident")), true);
  assert.equal(client.comments.get(30)?.length, 1);
  assert.match(client.comments.get(30)?.[0]?.body ?? "", /not configured/i);
});

test("returns contract-valid public data without raw issue bodies", async () => {
  const { createIncidentsDocument, serializeVelvetMetadata } =
    await reconciliationFunctions();
  const secretBody = `Authorization: Bearer secret-token\n\n${serializeVelvetMetadata({
    schemaVersion: 1,
    kind: "incident",
    serviceId: "api",
    checkId: "readiness",
    transitionAt: "2026-07-29T12:01:00.000Z",
    startedAt: "2026-07-29T12:01:00.000Z",
  })}`;
  const incidents = createIncidentsDocument({
    generatedAt: "2026-07-29T12:30:00.000Z",
    services,
    issues: [
      issue(40, "Public API / Readiness is unavailable", secretBody, "incident"),
      issue(41, "Old Upptime issue", "raw historical data", "incident"),
    ],
  });

  assert.equal(incidents.events.length, 1);
  assert.equal(JSON.stringify(incidents).includes("secret-token"), false);
  assert.match(String(incidents.events[0]?.summary), /Public API/);
});

test("logs GitHub failures safely without changing monitor input", async () => {
  const { GitHubIncidentsError, reconcileGitHubIncidents } =
    await reconciliationFunctions();
  const client = new MemoryGitHubIssuesClient([]);
  client.failure = new GitHubIncidentsError("GITHUB_REQUEST_FAILED", {
    errorId: "error-reconcile",
    status: 502,
    cause: new Error("Authorization: Bearer secret-token"),
  });
  const reconciliationInput = input(
    [checkState("api", "readiness", "down", "2026-07-29T12:15:00.000Z")],
    "2026-07-29T12:30:00.000Z",
  );
  const originalInput = structuredClone(reconciliationInput);
  const logs: Array<Record<string, unknown>> = [];

  await assert.rejects(
    reconcileGitHubIncidents(reconciliationInput, {
      client,
      logger: (record) => logs.push(record),
    }),
    (error: unknown) =>
      error instanceof Error &&
      "errorId" in error &&
      error.errorId === "error-reconcile",
  );

  assert.deepEqual(reconciliationInput, originalInput);
  assert.deepEqual(logs, [
    {
      operation: "create-issue",
      result: "failed",
      code: "GITHUB_REQUEST_FAILED",
      errorId: "error-reconcile",
      status: 502,
    },
  ]);
  assert.equal(JSON.stringify(logs).includes("secret-token"), false);
});

import assert from "node:assert/strict";
import { test } from "bun:test";
import { load } from "js-yaml";

type TestService = {
  id: string;
  name: string;
  checks: Array<{ id: string; name: string }>;
};

type MaintenanceMetadata = {
  schemaVersion: 1;
  kind: "maintenance";
  targets: Array<{ serviceId: string; checkId: string | null }>;
  startsAt: string;
  endsAt: string;
  summary: string;
};

type MaintenanceParseResult =
  | { success: true; data: MaintenanceMetadata }
  | {
      success: false;
      errors: Array<{ code: string; field: string; message: string }>;
    };

const maintenanceModule = import("../src/index.js").catch(() => ({}));

async function maintenanceFunctions(): Promise<{
  createMaintenanceIssueForm: (
    services: TestService[],
    maintenanceLabel: string,
  ) => string;
  parseMaintenanceIssueBody: (
    body: string,
    services: TestService[],
  ) => MaintenanceParseResult;
  resolveMaintenanceWindow: (
    metadata: MaintenanceMetadata,
    issue: { state: "open" | "closed"; closedAt: string | null },
  ) => MaintenanceMetadata | null;
  maintenanceCovers: (
    metadata: MaintenanceMetadata,
    serviceId: string,
    checkId: string,
    at: string,
  ) => boolean;
}> {
  const module = (await maintenanceModule) as Record<string, unknown>;
  for (const name of [
    "createMaintenanceIssueForm",
    "parseMaintenanceIssueBody",
    "resolveMaintenanceWindow",
    "maintenanceCovers",
  ]) {
    if (typeof module[name] !== "function") {
      assert.fail(`@velvet/github-incidents must export ${name}`);
    }
  }
  return module as Awaited<ReturnType<typeof maintenanceFunctions>>;
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

function issueBody(overrides: Partial<Record<string, string>> = {}): string {
  const values = {
    targets:
      "- Public API / Readiness [api/readiness]\n- Website (all checks) [website/*]",
    startsAt: "2026-08-01T22:00:00+02:00",
    endsAt: "2026-08-01T23:30:00+02:00",
    summary: "Database and application updates.",
    ...overrides,
  };
  return `### Affected services and checks\n\n${values.targets}\n\n### Starts at\n\n${values.startsAt}\n\n### Ends at\n\n${values.endsAt}\n\n### Summary\n\n${values.summary}`;
}

test("generates a reusable GitHub Issue Form from public service names", async () => {
  const { createMaintenanceIssueForm } = await maintenanceFunctions();
  const yaml = createMaintenanceIssueForm(services, "maintenance");
  const form = load(yaml) as {
    name: string;
    title: string;
    labels: string[];
    body: Array<{
      type: string;
      id?: string;
      attributes: Record<string, unknown>;
      validations?: { required: boolean };
    }>;
  };

  assert.equal(form.name, "Planned maintenance");
  assert.equal(form.title, "[Maintenance] ");
  assert.deepEqual(form.labels, ["maintenance"]);
  const targets = form.body.find(({ id }) => id === "affected-targets");
  assert.equal(targets?.type, "dropdown");
  assert.equal(targets?.attributes.multiple, true);
  assert.deepEqual(targets?.attributes.options, [
    "Public API (all checks) [api/*]",
    "Public API / Readiness [api/readiness]",
    "Public API / Version [api/version]",
    "Website (all checks) [website/*]",
    "Website / Homepage [website/homepage]",
  ]);
  assert.equal(targets?.validations?.required, true);
  assert.equal(yaml.includes("https://"), false);
});

test("parses rendered form fields and normalizes explicit time zones", async () => {
  const { parseMaintenanceIssueBody } = await maintenanceFunctions();

  const result = parseMaintenanceIssueBody(issueBody(), services);

  assert.deepEqual(result, {
    success: true,
    data: {
      schemaVersion: 1,
      kind: "maintenance",
      targets: [
        { serviceId: "api", checkId: "readiness" },
        { serviceId: "website", checkId: null },
      ],
      startsAt: "2026-08-01T20:00:00.000Z",
      endsAt: "2026-08-01T21:30:00.000Z",
      summary: "Database and application updates.",
    },
  });
});

test("does not treat target-like text in display names as another selection", async () => {
  const { parseMaintenanceIssueBody } = await maintenanceFunctions();
  const servicesWithTargetText: TestService[] = [
    {
      id: "api",
      name: "Public [website/homepage] API",
      checks: [{ id: "readiness", name: "Readiness" }],
    },
    {
      id: "website",
      name: "Website",
      checks: [{ id: "homepage", name: "Homepage" }],
    },
  ];

  const result = parseMaintenanceIssueBody(
    issueBody({
      targets:
        "- Public [website/homepage] API / Readiness [api/readiness]",
    }),
    servicesWithTargetText,
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.targets, [
    { serviceId: "api", checkId: "readiness" },
  ]);
});

test("rejects unknown targets, ambiguous timestamps, and invalid windows", async () => {
  const { parseMaintenanceIssueBody } = await maintenanceFunctions();

  const unknownTarget = parseMaintenanceIssueBody(
    issueBody({ targets: "Unknown [private-api/readiness]" }),
    services,
  );
  const ambiguousTime = parseMaintenanceIssueBody(
    issueBody({ startsAt: "2026-08-01 22:00" }),
    services,
  );
  const backwards = parseMaintenanceIssueBody(
    issueBody({ endsAt: "2026-08-01T21:00:00+02:00" }),
    services,
  );

  assert.deepEqual(
    unknownTarget.success
      ? []
      : unknownTarget.errors.map(({ code, field }) => ({ code, field })),
    [{ code: "UNKNOWN_MAINTENANCE_TARGET", field: "affected-targets" }],
  );
  assert.deepEqual(
    ambiguousTime.success
      ? []
      : ambiguousTime.errors.map(({ code, field }) => ({ code, field })),
    [{ code: "INVALID_MAINTENANCE_TIMESTAMP", field: "starts-at" }],
  );
  assert.deepEqual(
    backwards.success
      ? []
      : backwards.errors.map(({ code, field }) => ({ code, field })),
    [{ code: "INVALID_MAINTENANCE_WINDOW", field: "ends-at" }],
  );
});

test("applies maintenance only to exact targets and the configured time", async () => {
  const { maintenanceCovers, parseMaintenanceIssueBody } =
    await maintenanceFunctions();
  const result = parseMaintenanceIssueBody(issueBody(), services);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(
    maintenanceCovers(
      result.data,
      "api",
      "readiness",
      "2026-08-01T20:30:00.000Z",
    ),
    true,
  );
  assert.equal(
    maintenanceCovers(
      result.data,
      "api",
      "version",
      "2026-08-01T20:30:00.000Z",
    ),
    false,
  );
  assert.equal(
    maintenanceCovers(
      result.data,
      "website",
      "homepage",
      "2026-08-01T20:30:00.000Z",
    ),
    true,
  );
  assert.equal(
    maintenanceCovers(
      result.data,
      "website",
      "homepage",
      "2026-08-01T21:30:00.000Z",
    ),
    false,
  );
});

test("cancels maintenance closed before start and shortens an active window", async () => {
  const { resolveMaintenanceWindow } = await maintenanceFunctions();
  const metadata: MaintenanceMetadata = {
    schemaVersion: 1,
    kind: "maintenance",
    targets: [{ serviceId: "website", checkId: null }],
    startsAt: "2026-08-01T20:00:00.000Z",
    endsAt: "2026-08-01T22:00:00.000Z",
    summary: "Database upgrade.",
  };

  assert.equal(
    resolveMaintenanceWindow(metadata, {
      state: "closed",
      closedAt: "2026-08-01T19:30:00.000Z",
    }),
    null,
  );
  assert.deepEqual(
    resolveMaintenanceWindow(metadata, {
      state: "closed",
      closedAt: "2026-08-01T21:00:00.000Z",
    }),
    { ...metadata, endsAt: "2026-08-01T21:00:00.000Z" },
  );
  assert.deepEqual(
    resolveMaintenanceWindow(metadata, { state: "open", closedAt: null }),
    metadata,
  );
});

import assert from "node:assert/strict";
import { test } from "bun:test";

type TestCheck = {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  expectedStatusCodes: number[];
  maxRedirects: number;
  timeoutMs: number;
  headers: Array<{ name: string; secret: string }>;
  jsonAssertions: Array<{
    path: string;
    equals: string | number | boolean | null;
  }>;
};

type TestService = {
  id: string;
  name: string;
  checks: TestCheck[];
};

type TestObservation = {
  serviceId: string;
  checkId: string;
  checkedAt: string;
  targetAvailability: "available" | "unavailable" | "unobserved";
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: string | null;
  attempts: 1 | 2;
};

type ExecuteMonitorChecks = (
  services: TestService[],
  dependencies?: Record<string, unknown>,
) => Promise<TestObservation[]>;

const orchestratorModule = import("../src/index.js").catch(() => ({}));

async function orchestrator(): Promise<ExecuteMonitorChecks> {
  const module = (await orchestratorModule) as Record<string, unknown>;
  const executeMonitorChecks = module.executeMonitorChecks;
  if (typeof executeMonitorChecks !== "function") {
    assert.fail("@velvet/monitor must export executeMonitorChecks");
  }
  return executeMonitorChecks as ExecuteMonitorChecks;
}

function check(id: string, url: string): TestCheck {
  return {
    id,
    name: id,
    url,
    method: "GET",
    expectedStatusCodes: [200],
    maxRedirects: 5,
    timeoutMs: 10_000,
    headers: [],
    jsonAssertions: [],
  };
}

function service(url: string): TestService {
  return {
    id: "website",
    name: "Website",
    checks: [check("website", url)],
  };
}

test("recovers one failed check with one immediate retry", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      requests += 1;
      return new Response(null, { status: requests === 1 ? 503 : 200 });
    },
  });
  try {
    const executeMonitorChecks = await orchestrator();
    const observations = await executeMonitorChecks([
      service(`http://127.0.0.1:${server.port}`),
    ]);

    assert.equal(requests, 2);
    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.serviceId, "website");
    assert.equal(observations[0]?.checkId, "website");
    assert.equal(observations[0]?.targetAvailability, "available");
    assert.equal(observations[0]?.attempts, 2);
    assert.equal(observations[0]?.statusCode, 200);
    assert.equal(observations[0]?.failureCode, null);
    assert.equal((observations[0]?.responseTimeMs ?? -1) >= 0, true);
    assert.equal("url" in observations[0]!, false);
  } finally {
    await server.stop(true);
  }
});

test("executes every configured check in deterministic service order", async () => {
  const paths: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      paths.push(new URL(request.url).pathname);
      return new Response(null, { status: 200 });
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  try {
    const executeMonitorChecks = await orchestrator();
    const observations = await executeMonitorChecks([
      {
        id: "api",
        name: "API",
        checks: [
          check("readiness", `${baseUrl}/ready`),
          check("version", `${baseUrl}/version`),
        ],
      },
      {
        id: "website",
        name: "Website",
        checks: [check("homepage", `${baseUrl}/home`)],
      },
    ]);

    assert.deepEqual(paths, ["/ready", "/version", "/home"]);
    assert.deepEqual(
      observations.map(({ serviceId, checkId, attempts }) => ({
        serviceId,
        checkId,
        attempts,
      })),
      [
        { serviceId: "api", checkId: "readiness", attempts: 1 },
        { serviceId: "api", checkId: "version", attempts: 1 },
        { serviceId: "website", checkId: "homepage", attempts: 1 },
      ],
    );
  } finally {
    await server.stop(true);
  }
});

test("does not retry a check that cannot resolve its configured secret", async () => {
  const executeMonitorChecks = await orchestrator();
  const configuredService = service("http://127.0.0.1:1");
  configuredService.checks[0]!.headers = [
    { name: "Authorization", secret: "HEALTH_TOKEN" },
  ];

  const observations = await executeMonitorChecks([configuredService], {
    resolveSecret: () => undefined,
  });

  assert.equal(observations[0]?.targetAvailability, "unobserved");
  assert.equal(observations[0]?.attempts, 1);
  assert.equal(observations[0]?.failureCode, "SECRET_NOT_FOUND");
  assert.equal(observations[0]?.responseTimeMs, null);
});

test("returns a target failure after the bounded retry is exhausted", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      requests += 1;
      return new Response(null, { status: 503 });
    },
  });
  try {
    const executeMonitorChecks = await orchestrator();
    const observations = await executeMonitorChecks([
      service(`http://127.0.0.1:${server.port}`),
    ]);

    assert.equal(requests, 2);
    assert.equal(observations[0]?.targetAvailability, "unavailable");
    assert.equal(observations[0]?.attempts, 2);
    assert.equal(observations[0]?.statusCode, 503);
    assert.equal(observations[0]?.failureCode, "UNEXPECTED_STATUS");
    assert.equal(observations[0]?.responseTimeMs, null);
  } finally {
    await server.stop(true);
  }
});

test("does not retry a cancelled monitor run", async () => {
  const controller = new AbortController();
  controller.abort();
  const executeMonitorChecks = await orchestrator();
  const observations = await executeMonitorChecks(
    [service("http://127.0.0.1:1")],
    { signal: controller.signal },
  );

  assert.equal(observations[0]?.targetAvailability, "unobserved");
  assert.equal(observations[0]?.attempts, 1);
  assert.equal(observations[0]?.failureCode, "CANCELLED");
});

test("emits structured check logs without endpoint or secret details", async () => {
  const executeMonitorChecks = await orchestrator();
  const configuredService = service(
    "https://private-host.example.invalid/secret-path",
  );
  configuredService.checks[0]!.headers = [
    { name: "Authorization", secret: "PRIVATE_HEALTH_TOKEN" },
  ];
  const records: unknown[] = [];

  await executeMonitorChecks([configuredService], {
    executeCheck: async (configuredCheck: TestCheck) => ({
      checkId: configuredCheck.id,
      checkedAt: "2026-07-29T12:00:00.000Z",
      outcome: "failure",
      latencyMs: 0,
      statusCode: null,
      error: {
        code: "SECRET_NOT_FOUND",
        message: "Configured request secret is unavailable",
      },
    }),
    logger: (record: unknown) => records.push(record),
  });

  assert.deepEqual(records, [
    {
      operation: "check",
      serviceId: "website",
      checkId: "website",
      result: "unobserved",
      statusCode: null,
      failureCode: "SECRET_NOT_FOUND",
      attempts: 1,
    },
  ]);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes("private-host"), false);
  assert.equal(serialized.includes("secret-path"), false);
  assert.equal(serialized.includes("PRIVATE_HEALTH_TOKEN"), false);
});

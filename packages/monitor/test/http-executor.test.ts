import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

const TEST_TLS_CERTIFICATE = readFileSync(
  new URL("./fixtures/test-certificate.pem", import.meta.url),
  "utf8",
);
const TEST_TLS_PRIVATE_KEY = [
  "-----BEGIN PRIVATE KEY-----",
  readFileSync(
    new URL("./fixtures/test-private-key-body.txt", import.meta.url),
    "utf8",
  ).trim(),
  "-----END PRIVATE KEY-----",
].join("\n");

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

type TestResult = {
  checkId: string;
  checkedAt: string;
  outcome: "success" | "failure";
  latencyMs: number;
  statusCode: number | null;
  error: null | { code: string; message: string };
};

type TestDependencies = {
  signal?: AbortSignal;
  resolveSecret?: (name: string) => string | undefined;
  lookup?: (...args: unknown[]) => unknown;
  monotonicNow?: () => number;
  wallNow?: () => Date;
};

type ExecuteHttpCheck = (
  check: TestCheck,
  dependencies?: TestDependencies,
) => Promise<TestResult>;

const executorModule = import("../src/index.js").catch(() => ({}));

async function executor(): Promise<ExecuteHttpCheck> {
  const module = (await executorModule) as Record<string, unknown>;
  const executeHttpCheck = module.executeHttpCheck;
  if (typeof executeHttpCheck !== "function") {
    assert.fail("@velvet/monitor must export executeHttpCheck");
  }
  return executeHttpCheck as ExecuteHttpCheck;
}

function check(url: string, overrides: Partial<TestCheck> = {}): TestCheck {
  return {
    id: "website",
    name: "Website",
    url,
    method: "GET",
    expectedStatusCodes: [200],
    maxRedirects: 5,
    timeoutMs: 10_000,
    headers: [],
    jsonAssertions: [],
    ...overrides,
  };
}

function startServer(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: handler,
  });
  return {
    server,
    url: `http://127.0.0.1:${server.port}`,
  };
}

function startHttpsServer(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: {
      cert: TEST_TLS_CERTIFICATE,
      key: TEST_TLS_PRIVATE_KEY,
    },
    fetch: handler,
  });
  return {
    server,
    url: `https://127.0.0.1:${server.port}`,
  };
}

async function stopServer(server: ReturnType<typeof Bun.serve>): Promise<void> {
  await server.stop(true);
}

function assertFailure(
  result: TestResult,
  code: string,
  statusCode: number | null = null,
): void {
  assert.equal(result.outcome, "failure");
  assert.equal(result.statusCode, statusCode);
  assert.equal(result.error?.code, code);
  assert.equal(result.error?.message.length ? true : false, true);
  assert.equal("url" in result, false);
}

test("default GET succeeds on 200 without parsing the response body", async () => {
  const fixture = startServer(
    () => new Response("not-json", { status: 200 }),
  );
  try {
    const executeHttpCheck = await executor();
    const result = await executeHttpCheck(check(fixture.url), {
      wallNow: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    assert.equal(result.checkId, "website");
    assert.equal(result.checkedAt, "2026-07-29T12:00:00.000Z");
    assert.equal(result.outcome, "success");
    assert.equal(result.statusCode, 200);
    assert.equal(result.error, null);
    assert.equal(result.latencyMs >= 0, true);
    assert.equal("url" in result, false);
    assert.equal("upptime" in result, false);
  } finally {
    await stopServer(fixture.server);
  }
});

test("HEAD and configured final status codes are supported", async () => {
  let receivedMethod = "";
  const fixture = startServer((request) => {
    receivedMethod = request.method;
    return new Response(null, { status: 204 });
  });
  try {
    const executeHttpCheck = await executor();
    const result = await executeHttpCheck(
      check(fixture.url, {
        method: "HEAD",
        expectedStatusCodes: [204],
      }),
    );

    assert.equal(receivedMethod, "HEAD");
    assert.equal(result.outcome, "success");
    assert.equal(result.statusCode, 204);
  } finally {
    await stopServer(fixture.server);
  }
});

test("relative redirects reach and evaluate the final response", async () => {
  const fixture = startServer((request) =>
    new URL(request.url).pathname === "/start"
      ? new Response(null, { status: 302, headers: { location: "/final" } })
      : new Response(null, { status: 200 }),
  );
  try {
    const executeHttpCheck = await executor();
    const result = await executeHttpCheck(check(`${fixture.url}/start`));

    assert.equal(result.outcome, "success");
    assert.equal(result.statusCode, 200);
  } finally {
    await stopServer(fixture.server);
  }
});

test("redirect bounds and invalid locations return stable failures", async () => {
  const looping = startServer(
    () => new Response(null, { status: 302, headers: { location: "/loop" } }),
  );
  const invalid = startServer(
    () => new Response(null, { status: 302, headers: { location: "ftp://example.com" } }),
  );
  try {
    const executeHttpCheck = await executor();
    assertFailure(
      await executeHttpCheck(
        check(`${looping.url}/loop`, { maxRedirects: 1 }),
      ),
      "TOO_MANY_REDIRECTS",
      302,
    );
    assertFailure(
      await executeHttpCheck(check(invalid.url)),
      "INVALID_REDIRECT",
      302,
    );
  } finally {
    await Promise.all([
      stopServer(looping.server),
      stopServer(invalid.server),
    ]);
  }
});

test("unexpected final status returns a redacted actionable failure", async () => {
  const fixture = startServer(() => new Response("private", { status: 503 }));
  try {
    const executeHttpCheck = await executor();
    const result = await executeHttpCheck(check(`${fixture.url}/secret-path`));

    assertFailure(result, "UNEXPECTED_STATUS", 503);
    assert.equal(JSON.stringify(result).includes("secret-path"), false);
    assert.equal(JSON.stringify(result).includes("private"), false);
  } finally {
    await stopServer(fixture.server);
  }
});

test("JSON assertions distinguish healthy and unhealthy 200 responses", async () => {
  const fixture = startServer(
    () => Response.json({ status: "ok", dependencies: { database: true } }),
  );
  try {
    const executeHttpCheck = await executor();
    const healthy = await executeHttpCheck(
      check(fixture.url, {
        jsonAssertions: [
          { path: "/status", equals: "ok" },
          { path: "/dependencies/database", equals: true },
        ],
      }),
    );
    const unhealthy = await executeHttpCheck(
      check(fixture.url, {
        jsonAssertions: [{ path: "/status", equals: "degraded" }],
      }),
    );

    assert.equal(healthy.outcome, "success");
    assertFailure(unhealthy, "ASSERTION_MISMATCH", 200);
  } finally {
    await stopServer(fixture.server);
  }
});

test("malformed and oversized JSON responses return bounded failures", async () => {
  const malformed = startServer(
    () => new Response("{", { headers: { "content-type": "application/json" } }),
  );
  const oversized = startServer(
    () => Response.json({ value: "x".repeat(65_536) }),
  );
  try {
    const executeHttpCheck = await executor();
    const assertions = [{ path: "/status", equals: "ok" }];
    assertFailure(
      await executeHttpCheck(check(malformed.url, { jsonAssertions: assertions })),
      "INVALID_JSON",
      200,
    );
    assertFailure(
      await executeHttpCheck(check(oversized.url, { jsonAssertions: assertions })),
      "RESPONSE_BODY_TOO_LARGE",
      200,
    );
  } finally {
    await Promise.all([
      stopServer(malformed.server),
      stopServer(oversized.server),
    ]);
  }
});

test("secret headers are resolved before timing and never returned", async () => {
  let receivedAuthorization = "";
  const events: string[] = [];
  const fixture = startServer((request) => {
    receivedAuthorization = request.headers.get("authorization") ?? "";
    return new Response(null, { status: 200 });
  });
  try {
    const executeHttpCheck = await executor();
    const result = await executeHttpCheck(
      check(fixture.url, {
        headers: [{ name: "Authorization", secret: "HEALTH_TOKEN" }],
      }),
      {
        resolveSecret: () => {
          events.push("secret");
          return "Bearer super-secret";
        },
        monotonicNow: () => {
          events.push("clock");
          return performance.now();
        },
      },
    );

    assert.equal(receivedAuthorization, "Bearer super-secret");
    assert.equal(events[0], "secret");
    assert.equal(JSON.stringify(result).includes("super-secret"), false);
    assert.equal(JSON.stringify(result).includes("HEALTH_TOKEN"), false);
  } finally {
    await stopServer(fixture.server);
  }
});

test("cross-origin redirects do not forward configured secret headers", async () => {
  let targetAuthorization: string | null = "not-called";
  const target = startServer((request) => {
    targetAuthorization = request.headers.get("authorization");
    return new Response(null, { status: 200 });
  });
  const source = startServer(
    () => new Response(null, { status: 302, headers: { location: target.url } }),
  );
  try {
    const executeHttpCheck = await executor();
    const result = await executeHttpCheck(
      check(source.url, {
        headers: [{ name: "Authorization", secret: "HEALTH_TOKEN" }],
      }),
      { resolveSecret: () => "Bearer super-secret" },
    );

    assert.equal(result.outcome, "success");
    assert.equal(targetAuthorization, null);
  } finally {
    await Promise.all([stopServer(source.server), stopServer(target.server)]);
  }
});

test("missing or failing secret resolution is redacted", async () => {
  const executeHttpCheck = await executor();
  const secretValue = "DO_NOT_LOG_ME";
  const result = await executeHttpCheck(
    check("http://127.0.0.1:1", {
      headers: [{ name: "Authorization", secret: "HEALTH_TOKEN" }],
    }),
    {
      resolveSecret: () => {
        throw new Error(secretValue);
      },
    },
  );

  assertFailure(result, "SECRET_NOT_FOUND");
  assert.equal(JSON.stringify(result).includes(secretValue), false);
  assert.equal(JSON.stringify(result).includes("HEALTH_TOKEN"), false);
});

test("invalid resolved header values fail without exposing the secret", async () => {
  const executeHttpCheck = await executor();
  const secretValue = "Bearer super-secret\r\nx-leak: yes";
  const result = await executeHttpCheck(
    check("http://127.0.0.1:1", {
      headers: [{ name: "Authorization", secret: "HEALTH_TOKEN" }],
    }),
    { resolveSecret: () => secretValue },
  );

  assertFailure(result, "INVALID_REQUEST_HEADER");
  assert.equal(JSON.stringify(result).includes(secretValue), false);
  assert.equal(JSON.stringify(result).includes("super-secret"), false);
});

test("absolute timeout and external cancellation return distinct failures", async () => {
  const fixture = startServer(async () => {
    await Bun.sleep(500);
    return new Response(null, { status: 200 });
  });
  try {
    const executeHttpCheck = await executor();
    assertFailure(
      await executeHttpCheck(check(fixture.url, { timeoutMs: 100 })),
      "TIMEOUT",
    );

    const controller = new AbortController();
    const pending = executeHttpCheck(check(fixture.url), {
      signal: controller.signal,
    });
    controller.abort();
    assertFailure(await pending, "CANCELLED");
  } finally {
    await stopServer(fixture.server);
  }
});

test("one absolute timeout covers every redirect hop", async () => {
  const fixture = startServer(async (request) => {
    await Bun.sleep(70);
    return new URL(request.url).pathname === "/start"
      ? new Response(null, { status: 302, headers: { location: "/final" } })
      : new Response(null, { status: 200 });
  });
  try {
    const executeHttpCheck = await executor();
    assertFailure(
      await executeHttpCheck(
        check(`${fixture.url}/start`, { timeoutMs: 100 }),
      ),
      "TIMEOUT",
    );
  } finally {
    await stopServer(fixture.server);
  }
});

test("cancellation closes the active response resource", async () => {
  let markStarted!: () => void;
  let markAborted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const aborted = new Promise<void>((resolve) => {
    markAborted = resolve;
  });
  const fixture = startServer(
    (request) =>
      new Promise<Response>((resolve) => {
        markStarted();
        request.signal.addEventListener(
          "abort",
          () => {
            markAborted();
            resolve(new Response(null, { status: 499 }));
          },
          { once: true },
        );
      }),
  );
  try {
    const executeHttpCheck = await executor();
    const controller = new AbortController();
    const pending = executeHttpCheck(check(fixture.url), {
      signal: controller.signal,
    });
    await started;
    controller.abort();

    assertFailure(await pending, "CANCELLED");
    assert.equal(
      await Promise.race([
        aborted.then(() => true),
        Bun.sleep(1_000).then(() => false),
      ]),
      true,
    );
  } finally {
    await stopServer(fixture.server);
  }
});

test("forces IPv4 DNS resolution for direct HTTP checks", async () => {
  const fixture = startServer(() => new Response(null, { status: 200 }));
  let requestedFamily: number | undefined;
  const lookup = (...args: unknown[]) => {
    const options = args[1] as { all?: boolean; family?: number };
    const callback = args.at(-1) as (
      error: null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void;
    requestedFamily = options.family;
    if (options.all) {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
    } else {
      callback(null, "127.0.0.1", 4);
    }
  };
  try {
    const executeHttpCheck = await executor();
    const url = fixture.url.replace("127.0.0.1", "fixture.invalid");
    const result = await executeHttpCheck(check(url), { lookup });

    assert.equal(result.outcome, "success");
    assert.equal(requestedFamily, 4);
  } finally {
    await stopServer(fixture.server);
  }
});

test("DNS, connection, and TLS errors have stable redacted codes", async () => {
  const executeHttpCheck = await executor();
  const dnsError = Object.assign(new Error("secret DNS details"), {
    code: "ENOTFOUND",
  });
  const lookup = (...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error) => void;
    callback(dnsError);
  };
  assertFailure(
    await executeHttpCheck(check("http://unresolvable.invalid"), { lookup }),
    "DNS_ERROR",
  );

  const closed = startServer(() => new Response(null, { status: 200 }));
  const closedUrl = closed.url;
  await stopServer(closed.server);
  assertFailure(
    await executeHttpCheck(check(closedUrl, { timeoutMs: 500 })),
    "CONNECTION_ERROR",
  );

  const selfSignedHttps = startHttpsServer(
    () => new Response(null, { status: 200 }),
  );
  try {
    assertFailure(
      await executeHttpCheck(
        check(selfSignedHttps.url, { timeoutMs: 500 }),
      ),
      "TLS_ERROR",
    );
  } finally {
    await stopServer(selfSignedHttps.server);
  }
});

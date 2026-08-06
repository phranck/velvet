import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "bun:test";

import {
  createInstallationSerialCounter,
  parseSerialRepository,
} from "../src/serial.js";

/**
 * The counter's whole purpose is that two installations finishing together
 * cannot receive the same number, so the conflict path carries most of these
 * assertions. Everything is driven through a stubbed fetch, since the real
 * behaviour under test is which requests are made and how a rejected write is
 * answered.
 */

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const OPTIONS = {
  appId: "1234",
  privateKey: privateKey as unknown as string,
  repository: "phranck/velvet-registry",
  path: "registry.json",
  userAgent: "velvet-setup-test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function contentsResponse(
  issued: number,
  sha: string,
  installations: unknown[] = [],
): Response {
  return jsonResponse({
    sha,
    content: Buffer.from(
      `${JSON.stringify({ schemaVersion: 1, issued, installations }, null, 2)}\n`,
      "utf8",
    ).toString("base64"),
  });
}

/** What onboarding hands over when it claims a serial. */
const INSTALLATION = {
  repository: "example/status",
  statusPageName: "Example Status",
  url: "https://example.github.io/status/",
  listed: false,
};

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/**
 * Answers the two identity lookups a claim performs before it can write.
 *
 * @returns A responder for the fixed part of every claim, or `null` when the
 *   request is not one of them.
 */
function identityResponse(url: string): Response | null {
  if (url.endsWith("/installation")) return jsonResponse({ id: 55 });
  if (url.endsWith("/access_tokens")) return jsonResponse({ token: "installation-token" });
  if (url.endsWith("/repos/phranck/velvet-registry")) return jsonResponse({ id: 909 });
  return null;
}

test("the repository reference must name exactly one owner and repository", () => {
  assert.deepEqual(parseSerialRepository("phranck/velvet-registry"), {
    owner: "phranck",
    name: "velvet-registry",
  });
  for (const invalid of ["velvet-registry", "a/b/c", "", "  ", "/name", "owner/"]) {
    assert.throws(() => parseSerialRepository(invalid), TypeError, invalid);
  }
});

test("peek reports the next number, authenticated because the counter is private", async () => {
  const seen: { url: string; auth: boolean }[] = [];
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      seen.push({
        url: request.url,
        auth: request.headers.get("Authorization") !== null,
      });
      const identity = identityResponse(request.url);
      if (identity) return identity;
      return contentsResponse(41, "blob-sha");
    },
  });

  assert.equal(await counter.peek(), 42);
  const read = seen.at(-1)!;
  assert.match(read.url, /\/contents\/registry\.json$/u);
  assert.equal(read.auth, true, "a private repository cannot be read anonymously");
  assert.equal(
    seen.some((entry) => entry.url.includes("raw.githubusercontent.com")),
    false,
    "nothing reaches the anonymous raw endpoint any more",
  );
});

test("peek treats a counter that does not exist yet as the first number", async () => {
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      return new Response("", { status: 404 });
    },
  });
  assert.equal(await counter.peek(), 1);
});

test("peek reports nothing rather than a wrong number when the counter is unreadable", async () => {
  const unreadable = [
    () => new Response("", { status: 500 }),
    () => jsonResponse({ sha: "blob-sha", content: Buffer.from('{"issued":"many"}').toString("base64") }),
    () => jsonResponse({ sha: "blob-sha", content: Buffer.from("{}").toString("base64") }),
    () => jsonResponse({ sha: "blob-sha", content: Buffer.from('{"issued":-3}').toString("base64") }),
    () => jsonResponse({ sha: "blob-sha" }),
  ];
  for (const response of unreadable) {
    const counter = createInstallationSerialCounter({
      ...OPTIONS,
      fetch: async (request) => identityResponse(request.url) ?? response(),
    });
    assert.equal(await counter.peek(), null);
  }
});

test("peek reports nothing when Velvet is not installed on the counter repository", async () => {
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) =>
      request.url.endsWith("/installation")
        ? new Response("", { status: 404 })
        : jsonResponse({ token: "installation-token" }),
  });
  assert.equal(await counter.peek(), null);
});

test("the token is minted once and reused until it nears expiry", async () => {
  let mints = 0;
  let seconds = 1_000;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    nowSeconds: () => seconds,
    fetch: async (request) => {
      if (request.url.endsWith("/installation")) return jsonResponse({ id: 55 });
      if (request.url.endsWith("/access_tokens")) {
        mints += 1;
        return jsonResponse({ token: `token-${mints}` });
      }
      if (request.url.endsWith("/repos/phranck/velvet-registry")) {
        return jsonResponse({ id: 909 });
      }
      return contentsResponse(41, "blob-sha");
    },
  });

  await counter.peek();
  await counter.peek();
  // Two mints so far: the broad one that resolves the repository id, and the
  // scoped one that is then cached.
  assert.equal(mints, 2, "the second read reuses the cached token");

  seconds += 3_500;
  await counter.peek();
  assert.equal(mints, 3, "a token close to expiry is replaced");
});

test("claim increments the counter and writes it back against its own SHA", async () => {
  const recorded: Recorded[] = [];
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    nowSeconds: () => 1_000,
    fetch: async (request) => {
      recorded.push({
        method: request.method,
        url: request.url,
        body: request.method === "PUT" ? await request.text() : null,
      });
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(41, "blob-sha");
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim(INSTALLATION), 42);

  const write = recorded.find((entry) => entry.method === "PUT");
  assert.ok(write, "the claim writes the counter back");
  const payload = JSON.parse(write!.body!) as {
    sha?: string;
    content: string;
    message: string;
  };
  assert.equal(payload.sha, "blob-sha", "the write is conditional on the SHA it read");
  assert.match(payload.message, /serial 42 to example\/status/u);
  const written = JSON.parse(
    Buffer.from(payload.content, "base64").toString("utf8"),
  ) as { issued: number; installations: Record<string, unknown>[] };
  assert.equal(written.issued, 42);
  assert.equal(written.installations.length, 1);
  assert.deepEqual(written.installations[0], {
    serial: 42,
    repository: "example/status",
    statusPageName: "Example Status",
    url: "https://example.github.io/status/",
    issuedAt: new Date(1_000 * 1_000).toISOString(),
  });
  assert.equal(
    "customDomain" in written.installations[0]!,
    false,
    "an absent custom domain is left out rather than written as empty",
  );
});

test("claim keeps the records already there and appends to them", async () => {
  let written: { issued: number; installations: { serial: number }[] } | null = null;
  const existing = [
    {
      serial: 1,
      repository: "someone/status",
      statusPageName: "Someone",
      url: "https://someone.github.io/status/",
      issuedAt: "2026-07-01T00:00:00.000Z",
    },
  ];
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    nowSeconds: () => 1_000,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(1, "blob-sha", existing);
      const payload = JSON.parse(await request.text()) as { content: string };
      written = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim({ ...INSTALLATION, customDomain: "status.example.com" }), 2);
  assert.deepEqual(
    written!.installations.map((entry) => entry.serial),
    [1, 2],
  );
  assert.equal(
    (written!.installations[1] as { customDomain?: string }).customDomain,
    "status.example.com",
  );
});

test("claim creates the counter without a SHA when the file is absent", async () => {
  let payload: { sha?: string; content: string } | null = null;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return new Response("", { status: 404 });
      payload = JSON.parse(await request.text()) as { sha?: string; content: string };
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim(INSTALLATION), 1);
  assert.equal(payload!.sha, undefined, "a create carries no precondition");
  const created = JSON.parse(
    Buffer.from(payload!.content, "base64").toString("utf8"),
  ) as { issued: number; installations: { serial: number }[] };
  assert.equal(created.issued, 1);
  assert.deepEqual(created.installations.map((entry) => entry.serial), [1]);
});

test("a rejected write is retried against the value the winner left behind", async () => {
  // This is the case the whole design exists for: another installation claimed
  // 42 between this one's read and its write, so the retry must yield 43 rather
  // than reissue 42.
  let issued = 41;
  let writes = 0;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(issued, `sha-${issued}`);
      writes += 1;
      if (writes === 1) {
        // The competing claim lands, which is what makes the SHA stale.
        issued = 42;
        return new Response("", { status: 409 });
      }
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim(INSTALLATION), 43);
  assert.equal(writes, 2);
});

test("claim gives up rather than duplicate a number under sustained contention", async () => {
  let writes = 0;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    maxAttempts: 3,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(41, "blob-sha");
      writes += 1;
      return new Response("", { status: 409 });
    },
  });

  await assert.rejects(() => counter.claim(INSTALLATION), /after 3 attempts/u);
  assert.equal(writes, 3);
});

test("a failure other than contention is not retried", async () => {
  let writes = 0;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(41, "blob-sha");
      writes += 1;
      return new Response("", { status: 403 });
    },
  });

  await assert.rejects(() => counter.claim(INSTALLATION));
  assert.equal(writes, 1, "a permission failure is not contention");
});

test("the write token is scoped to the counter repository alone", async () => {
  let scopedRequest: { repository_ids?: number[]; permissions?: unknown } | null = null;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      if (request.url.endsWith("/installation")) return jsonResponse({ id: 55 });
      if (request.url.endsWith("/access_tokens")) {
        const body = JSON.parse(await request.text()) as {
          repository_ids?: number[];
          permissions?: unknown;
        };
        if (body.repository_ids) scopedRequest = body;
        return jsonResponse({ token: "installation-token" });
      }
      if (request.url.endsWith("/repos/phranck/velvet-registry")) {
        return jsonResponse({ id: 909 });
      }
      if (request.method === "GET") return contentsResponse(0, "blob-sha");
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  await counter.claim(INSTALLATION);
  assert.deepEqual(scopedRequest!.repository_ids, [909]);
  assert.deepEqual(scopedRequest!.permissions, { contents: "write" });
});

test("the repository identity is resolved once and reused across claims", async () => {
  let identityLookups = 0;
  let issued = 0;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      if (request.url.endsWith("/installation")) {
        identityLookups += 1;
        return jsonResponse({ id: 55 });
      }
      if (request.url.endsWith("/access_tokens")) {
        return jsonResponse({ token: "installation-token" });
      }
      if (request.url.endsWith("/repos/phranck/velvet-registry")) {
        return jsonResponse({ id: 909 });
      }
      if (request.method === "GET") return contentsResponse(issued, `sha-${issued}`);
      issued += 1;
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim(INSTALLATION), 1);
  assert.equal(await counter.claim(INSTALLATION), 2);
  assert.equal(identityLookups, 1);
});

test("records consent with the number rather than an hour later", async () => {
  // Setup writes `gallery.listed` into the installation's own configuration
  // and therefore knows the answer. Leaving it to the pass that visits every
  // installation left a page that had consented out of the gallery until that
  // pass next ran, which is up to an hour after it went live.
  let written: { installations: Record<string, unknown>[] } | null = null;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    nowSeconds: () => 1_000,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(0, "blob-sha", []);
      const payload = JSON.parse(await request.text()) as { content: string };
      written = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim({ ...INSTALLATION, listed: true }), 1);
  assert.equal(written!.installations[0]!.listed, true);
});

test("records no consent where none was given", async () => {
  let written: { installations: Record<string, unknown>[] } | null = null;
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    nowSeconds: () => 1_000,
    fetch: async (request) => {
      const identity = identityResponse(request.url);
      if (identity) return identity;
      if (request.method === "GET") return contentsResponse(0, "blob-sha", []);
      const payload = JSON.parse(await request.text()) as { content: string };
      written = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  await counter.claim(INSTALLATION);
  assert.equal(
    "listed" in written!.installations[0]!,
    false,
    "silence is not consent, and is not written as one",
  );
});

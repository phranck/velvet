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
  repository: "phranck/velvet-serials",
  path: "serials.json",
  userAgent: "velvet-setup-test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function contentsResponse(issued: number, sha: string): Response {
  return jsonResponse({
    sha,
    content: Buffer.from(
      `${JSON.stringify({ schemaVersion: 1, issued }, null, 2)}\n`,
      "utf8",
    ).toString("base64"),
  });
}

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
  if (url.endsWith("/repos/phranck/velvet-serials")) return jsonResponse({ id: 909 });
  return null;
}

test("the repository reference must name exactly one owner and repository", () => {
  assert.deepEqual(parseSerialRepository("phranck/velvet-serials"), {
    owner: "phranck",
    name: "velvet-serials",
  });
  for (const invalid of ["velvet-serials", "a/b/c", "", "  ", "/name", "owner/"]) {
    assert.throws(() => parseSerialRepository(invalid), TypeError, invalid);
  }
});

test("peek reports the next number without spending a token", async () => {
  const seen: string[] = [];
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async (request) => {
      seen.push(request.url);
      assert.equal(request.headers.get("Authorization"), null);
      return jsonResponse({ schemaVersion: 1, issued: 41 });
    },
  });

  assert.equal(await counter.peek(), 42);
  assert.equal(seen.length, 1);
  assert.match(seen[0]!, /^https:\/\/raw\.githubusercontent\.com\/phranck\/velvet-serials\/HEAD\/serials\.json$/u);
});

test("peek treats a counter that does not exist yet as the first number", async () => {
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
    fetch: async () => new Response("", { status: 404 }),
  });
  assert.equal(await counter.peek(), 1);
});

test("peek reports nothing rather than a wrong number when the counter is unreadable", async () => {
  for (const response of [
    () => new Response("", { status: 500 }),
    () => jsonResponse({ schemaVersion: 1, issued: "many" }),
    () => jsonResponse({ schemaVersion: 1 }),
    () => jsonResponse({ schemaVersion: 1, issued: -3 }),
  ]) {
    const counter = createInstallationSerialCounter({ ...OPTIONS, fetch: async () => response() });
    assert.equal(await counter.peek(), null);
  }
});

test("claim increments the counter and writes it back against its own SHA", async () => {
  const recorded: Recorded[] = [];
  const counter = createInstallationSerialCounter({
    ...OPTIONS,
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

  assert.equal(await counter.claim(), 42);

  const write = recorded.find((entry) => entry.method === "PUT");
  assert.ok(write, "the claim writes the counter back");
  const payload = JSON.parse(write!.body!) as {
    sha?: string;
    content: string;
    message: string;
  };
  assert.equal(payload.sha, "blob-sha", "the write is conditional on the SHA it read");
  assert.match(payload.message, /serial 42/u);
  assert.deepEqual(
    JSON.parse(Buffer.from(payload.content, "base64").toString("utf8")),
    { schemaVersion: 1, issued: 42 },
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

  assert.equal(await counter.claim(), 1);
  assert.equal(payload!.sha, undefined, "a create carries no precondition");
  assert.deepEqual(
    JSON.parse(Buffer.from(payload!.content, "base64").toString("utf8")),
    { schemaVersion: 1, issued: 1 },
  );
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

  assert.equal(await counter.claim(), 43);
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

  await assert.rejects(() => counter.claim(), /after 3 attempts/u);
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

  await assert.rejects(() => counter.claim());
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
      if (request.url.endsWith("/repos/phranck/velvet-serials")) {
        return jsonResponse({ id: 909 });
      }
      if (request.method === "GET") return contentsResponse(0, "blob-sha");
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  await counter.claim();
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
      if (request.url.endsWith("/repos/phranck/velvet-serials")) {
        return jsonResponse({ id: 909 });
      }
      if (request.method === "GET") return contentsResponse(issued, `sha-${issued}`);
      issued += 1;
      return jsonResponse({ commit: { sha: "commit-sha" } });
    },
  });

  assert.equal(await counter.claim(), 1);
  assert.equal(await counter.claim(), 2);
  assert.equal(identityLookups, 1);
});

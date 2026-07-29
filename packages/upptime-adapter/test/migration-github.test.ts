import assert from "node:assert/strict";
import { test } from "bun:test";

import * as adapter from "../src/index.js";
import type { FetchImplementation } from "../src/index.js";

const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567";

function contentResponse(content: string): Response {
  return Response.json({
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  });
}

test("resolves the default branch once and loads every Git source at its commit", async () => {
  const requested: Array<{
    method: string;
    path: string;
    ref: string | null;
    sha: string | null;
  }> = [];
  const mockFetch: FetchImplementation = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requested.push({
      method: request.method,
      path: url.pathname,
      ref: url.searchParams.get("ref"),
      sha: url.searchParams.get("sha"),
    });

    if (url.pathname === "/repos/example/status") {
      return Response.json({ default_branch: "main" });
    }
    if (url.pathname === "/repos/example/status/commits/main") {
      return Response.json({
        sha: SOURCE_COMMIT,
        commit: {
          committer: { date: "2026-07-29T12:00:00.000Z" },
        },
      });
    }
    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse(
        "sites:\n  - name: Website\n    url: https://example.invalid\n",
      );
    }
    if (url.pathname.endsWith("/history/summary.json")) {
      return contentResponse(
        JSON.stringify([
          {
            name: "Website",
            slug: "website",
            status: "up",
            time: 100,
            dailyMinutesDown: {},
          },
        ]),
      );
    }
    if (url.pathname.endsWith("/history/website.yml")) {
      return contentResponse(
        "status: up\nresponseTime: 100\nlastUpdated: 2026-07-29T11:59:00.000Z\nstartTime: 2026-07-28T00:00:00.000Z\n",
      );
    }
    if (url.pathname === "/repos/example/status/commits") {
      return Response.json([
        {
          sha: "history-1",
          commit: {
            message: "Website is up (200 in 100 ms) [upptime]",
            committer: { date: "2026-07-29T11:59:00.000Z" },
          },
        },
      ]);
    }
    if (url.pathname === "/repos/example/status/issues") {
      return Response.json([]);
    }
    return new Response("not found", { status: 404 });
  };
  const candidate = Reflect.get(adapter, "loadUpptimeMigrationSnapshot");
  if (typeof candidate !== "function") {
    assert.fail(
      "@velvet/upptime-adapter must export loadUpptimeMigrationSnapshot",
    );
  }

  const loaded = (await candidate({
    repository: "example/status",
    apiBaseUrl: "https://api.github.test",
    fetch: mockFetch,
  })) as {
    source: {
      repository: string;
      ref: string;
      commit: string;
      committedAt: string;
    };
    snapshot: { histories: Record<string, string> };
  };

  assert.deepEqual(loaded.source, {
    repository: "example/status",
    ref: "main",
    commit: SOURCE_COMMIT,
    committedAt: "2026-07-29T12:00:00.000Z",
  });
  assert.equal(typeof loaded.snapshot.histories.website, "string");
  assert.equal(requested.every(({ method }) => method === "GET"), true);
  assert.equal(
    requested
      .filter(
        ({ path }) =>
          path.includes("/contents/") || path.endsWith("/commits"),
      )
      .every(
        ({ path, ref, sha }) =>
          path.endsWith("/commits")
            ? sha === SOURCE_COMMIT
            : ref === SOURCE_COMMIT,
      ),
    true,
  );
});

test("keeps the migration snapshot when one service history is missing", async () => {
  const mockFetch: FetchImplementation = async (input) => {
    const url = new URL(input.toString());
    if (url.pathname === "/repos/example/status") {
      return Response.json({ default_branch: "main" });
    }
    if (url.pathname === "/repos/example/status/commits/main") {
      return Response.json({
        sha: SOURCE_COMMIT,
        commit: {
          committer: { date: "2026-07-29T12:00:00.000Z" },
        },
      });
    }
    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse(
        "sites:\n  - name: Website\n    slug: website\n    url: https://example.invalid\n  - name: API\n    slug: api\n    url: https://api.example.invalid\n",
      );
    }
    if (url.pathname.endsWith("/history/summary.json")) {
      return contentResponse("[]");
    }
    if (url.pathname.endsWith("/history/api.yml")) {
      return contentResponse(
        "status: up\nresponseTime: 100\nlastUpdated: 2026-07-29T11:59:00.000Z\nstartTime: 2026-07-28T00:00:00.000Z\n",
      );
    }
    if (url.pathname.endsWith("/history/website.yml")) {
      return new Response("not found", { status: 404 });
    }
    if (url.pathname === "/repos/example/status/commits") {
      return Response.json([]);
    }
    if (url.pathname === "/repos/example/status/issues") {
      return Response.json([]);
    }
    return new Response("not found", { status: 404 });
  };
  const candidate = Reflect.get(adapter, "loadUpptimeMigrationSnapshot");
  if (typeof candidate !== "function") {
    assert.fail(
      "@velvet/upptime-adapter must export loadUpptimeMigrationSnapshot",
    );
  }

  const loaded = (await candidate({
    repository: "example/status",
    apiBaseUrl: "https://api.github.test",
    fetch: mockFetch,
  })) as { snapshot: { histories: Record<string, string> } };

  assert.deepEqual(Object.keys(loaded.snapshot.histories), ["api"]);
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { syncVelvetData } from "../src/index.js";

function contentResponse(content: string): Response {
  return Response.json({
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  });
}

test("syncs a validated Velvet snapshot from one GitHub repository ref", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "velvet-sync-"));
  const requestedRefs: Array<string | null> = [];
  const mockFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requestedRefs.push(url.searchParams.get("ref") ?? url.searchParams.get("sha"));

    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse(
        "sites:\n  - name: Website\n    url: https://example.invalid/health\n",
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
        "status: up\nresponseTime: 100\nlastUpdated: 2026-07-06T12:00:00.000Z\nstartTime: 2026-07-05T10:00:00.000Z\n",
      );
    }
    if (url.pathname.endsWith("/commits")) {
      return Response.json([
        {
          sha: "history-1",
          commit: {
            message: "Website is up (200 in 100 ms) [upptime]",
            committer: { date: "2026-07-06T12:00:00.000Z" },
          },
        },
      ]);
    }
    if (url.pathname.endsWith("/issues")) {
      return Response.json([]);
    }
    return new Response("not found", { status: 404 });
  };

  try {
    await syncVelvetData({
      repository: "example/status",
      ref: "source-sha",
      outputDirectory: join(temporaryDirectory, "velvet-data", "v1"),
      generatedAt: "2026-07-06T13:00:00.000Z",
      apiBaseUrl: "https://api.github.test",
      fetch: mockFetch,
    });

    const status = JSON.parse(
      await readFile(
        join(temporaryDirectory, "velvet-data", "v1", "status.json"),
        "utf8",
      ),
    ) as { services: unknown[] };
    assert.equal(status.services.length, 1);
    assert.equal(
      requestedRefs.filter((ref) => ref !== null).every((ref) => ref === "source-sha"),
      true,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

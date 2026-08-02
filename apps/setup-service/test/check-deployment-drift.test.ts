import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  compareDeployment,
  exitCodeFor,
} from "../scripts/check-deployment-drift.js";

const MATCHING = "a".repeat(64);
const DEPLOYED = "b".repeat(64);

/**
 * Runs one comparison against a throwaway service on a free port.
 *
 * The server is stopped on the failure path too, so a failing assertion cannot
 * leave a listener behind for the next test to collide with.
 */
async function withService(
  respond: (request: Request) => Response,
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const server = Bun.serve({ port: 0, fetch: respond });
  try {
    await run(`http://localhost:${server.port}`);
  } finally {
    await server.stop(true);
  }
}

test("passes when the deployed service was built from these sources", async () => {
  const requested: string[] = [];

  await withService(
    (request) => {
      requested.push(new URL(request.url).pathname);
      return Response.json({ status: "ok", fingerprint: MATCHING });
    },
    async (origin) => {
      const report = await compareDeployment(origin, MATCHING);

      assert.equal(report.status, "matching");
      assert.equal(exitCodeFor(report.status), 0);
      assert.deepEqual(requested, ["/healthz"]);
    },
  );
});

test("fails and names the deploy command when the two have drifted", async () => {
  await withService(
    () => Response.json({ status: "ok", fingerprint: DEPLOYED }),
    async (origin) => {
      const report = await compareDeployment(origin, MATCHING);

      assert.equal(report.status, "drifted");
      assert.equal(exitCodeFor(report.status), 1);
      // A report that only says "drifted" leaves the reader to work out what
      // to run, which is the friction that let the last gap sit for days.
      assert.match(report.message, /zcli push/u);
      assert.match(report.message, new RegExp(DEPLOYED.slice(0, 12), "u"));
      assert.match(report.message, new RegExp(MATCHING.slice(0, 12), "u"));
    },
  );
});

test("fails when the deployed service is too old to report a fingerprint", async () => {
  await withService(
    () => Response.json({ status: "ok" }),
    async (origin) => {
      const report = await compareDeployment(origin, MATCHING);

      assert.equal(report.status, "unstamped");
      assert.equal(exitCodeFor(report.status), 1);
      assert.match(report.message, /predates this check/u);
    },
  );
});

test("reports an erroring service as unknown rather than as drift", async () => {
  await withService(
    () => new Response("nope", { status: 503 }),
    async (origin) => {
      const report = await compareDeployment(origin, MATCHING);

      // Saying "drifted" here would be a guess, and a check that guesses gets
      // ignored, which puts the gap back out of sight.
      assert.equal(report.status, "unreachable");
      assert.equal(exitCodeFor(report.status), 0);
      assert.match(report.message, /HTTP 503/u);
    },
  );
});

test("reports an unreachable service as unknown rather than as drift", async () => {
  let closedOrigin = "";
  await withService(
    () => Response.json({ status: "ok" }),
    async (origin) => {
      closedOrigin = origin;
    },
  );

  const report = await compareDeployment(closedOrigin, MATCHING);

  assert.equal(report.status, "unreachable");
  assert.equal(exitCodeFor(report.status), 0);
  assert.match(report.message, new RegExp(closedOrigin, "u"));
});

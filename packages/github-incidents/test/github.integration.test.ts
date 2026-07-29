import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "bun:test";

import {
  createGitHubIssuesClient,
  parseVelvetMetadata,
  reconcileGitHubIncidents,
} from "../src/index.js";
import type { MonitorCheckState } from "@velvet/monitor";

const repository = process.env.VELVET_GITHUB_INTEGRATION_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const explicitlyIsolated =
  process.env.VELVET_GITHUB_INTEGRATION_ISOLATED === "true";

test.skipIf(!repository || !token || !explicitlyIsolated)(
  "creates and closes only its own issue in an isolated GitHub repository",
  async () => {
    assert.ok(repository);
    assert.ok(token);
    assert.match(
      repository,
      /integration/iu,
      "Integration repository name must visibly identify its isolated purpose.",
    );
    const [owner, repo, extra] = repository.split("/");
    assert.ok(owner && repo && extra === undefined);

    const runId = randomUUID().replaceAll("-", "").slice(0, 12);
    const serviceId = `it-${runId}`;
    const incidentLabel = `velvet-it-${runId}-incident`;
    const maintenanceLabel = `velvet-it-${runId}-maintenance`;
    const startedAt = new Date().toISOString();
    const recoveredAt = new Date(Date.parse(startedAt) + 1_000).toISOString();
    const client = createGitHubIssuesClient({ owner, repo, token });
    const services = [
      {
        id: serviceId,
        name: `Velvet integration ${runId}`,
        checks: [{ id: "health", name: "Health" }],
      },
    ];
    const state = (
      confirmedStatus: "up" | "down",
      confirmedAt: string,
    ): MonitorCheckState => ({
      serviceId,
      checkId: "health",
      status: confirmedStatus,
      confirmedStatus,
      confirmedAt,
      targetAvailability:
        confirmedStatus === "down" ? "unavailable" : "available",
      failureStreak: confirmedStatus === "down" ? 2 : 0,
      recoveryStreak: 0,
      checkedAt: confirmedAt,
      responseTimeMs: confirmedStatus === "down" ? null : 1,
      statusCode: confirmedStatus === "down" ? 503 : 200,
      failureCode:
        confirmedStatus === "down" ? "UNEXPECTED_STATUS" : null,
    });

    try {
      await reconcileGitHubIncidents(
        {
          generatedAt: startedAt,
          services,
          checkStates: [state("down", startedAt)],
          incidentLabel,
          maintenanceLabel,
        },
        { client },
      );
      await reconcileGitHubIncidents(
        {
          generatedAt: recoveredAt,
          services,
          checkStates: [state("up", recoveredAt)],
          incidentLabel,
          maintenanceLabel,
        },
        { client },
      );

      const ownedIssues = (await client.listIssues(incidentLabel)).filter(
        ({ body }) => {
          const metadata = parseVelvetMetadata(body);
          return metadata?.kind === "incident" && metadata.serviceId === serviceId;
        },
      );
      assert.equal(ownedIssues.length, 1);
      assert.equal(ownedIssues[0]?.state, "closed");
      assert.equal((await client.listComments(ownedIssues[0]!.number)).length, 1);
    } finally {
      const ownedIssues = (await client.listIssues(incidentLabel)).filter(
        ({ body }) => {
          const metadata = parseVelvetMetadata(body);
          return metadata?.kind === "incident" && metadata.serviceId === serviceId;
        },
      );
      for (const ownedIssue of ownedIssues) {
        if (ownedIssue.state === "open") {
          await client.createComment(
            ownedIssue.number,
            "Closing this isolated Velvet integration-test issue after the test run.",
          );
          await client.updateIssue(ownedIssue.number, { state: "closed" });
        }
      }
    }
  },
);

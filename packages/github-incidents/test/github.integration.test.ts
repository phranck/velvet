import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "bun:test";

import {
  createGitHubIssuesClient,
  parseVelvetMetadata,
  reconcileGitHubIncidents,
  type GitHubIssue,
  type GitHubIssuesClient,
} from "../src/index.js";
import type { MonitorCheckState } from "@velvet/monitor";

const repository = process.env.VELVET_GITHUB_INTEGRATION_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const explicitlyIsolated =
  process.env.VELVET_GITHUB_INTEGRATION_ISOLATED === "true";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findOwnedIssues(
  client: GitHubIssuesClient,
  incidentLabel: string,
  serviceId: string,
): Promise<GitHubIssue[]> {
  return (await client.listIssues(incidentLabel)).filter(({ body }) => {
    const metadata = parseVelvetMetadata(body);
    return metadata?.kind === "incident" && metadata.serviceId === serviceId;
  });
}

async function waitForOwnedIssue(
  client: GitHubIssuesClient,
  incidentLabel: string,
  serviceId: string,
): Promise<GitHubIssue[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ownedIssues = await findOwnedIssues(
      client,
      incidentLabel,
      serviceId,
    );
    if (ownedIssues.length > 0) return ownedIssues;
    await delay(1_000);
  }
  assert.fail("The integration issue did not become visible through GitHub.");
}

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
          retentionDays: 365,
          services,
          checkStates: [state("down", startedAt)],
          incidentLabel,
          maintenanceLabel,
        },
        { client },
      );
      await waitForOwnedIssue(client, incidentLabel, serviceId);
      await reconcileGitHubIncidents(
        {
          generatedAt: startedAt,
          retentionDays: 365,
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
          retentionDays: 365,
          services,
          checkStates: [state("up", recoveredAt)],
          incidentLabel,
          maintenanceLabel,
        },
        { client },
      );

      const ownedIssues = await findOwnedIssues(
        client,
        incidentLabel,
        serviceId,
      );
      assert.equal(ownedIssues.length, 1);
      assert.equal(ownedIssues[0]?.state, "closed");
      assert.equal((await client.listComments(ownedIssues[0]!.number)).length, 1);
    } finally {
      const ownedIssues = await findOwnedIssues(
        client,
        incidentLabel,
        serviceId,
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
  30_000,
);

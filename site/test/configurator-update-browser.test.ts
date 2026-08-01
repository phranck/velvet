import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "bun:test";

import {
  createConfiguratorHarness,
  type ConfiguratorHarness,
} from "./configurator-browser.js";

/**
 * Drives the Configurator's update section against a stubbed Velvet service.
 *
 * The section is the one part of the Configurator that talks to a network, so
 * whether an installation is found, whether an update is offered, and what
 * happens when one is started only exist once a browser has mounted it and let
 * its requests resolve.
 */

const BROWSER_TIMEOUT_MS = 180_000;

const installation = {
  installationId: 7,
  repositoryId: 9,
  owner: "example",
  name: "status",
  htmlUrl: "https://github.com/example/status",
  installedVersion: "2.0.0",
};

const update = {
  repository: installation,
  installedVersion: "2.0.0",
  automaticSecurityUpdates: true,
  availableVersion: "2.1.0",
  releaseType: "feature",
  automaticInstallEligible: false,
  releaseNotes: "# Velvet 2.1.0\n\nA calmer chart.\n",
};

let harness: ConfiguratorHarness;

beforeAll(async () => {
  harness = await createConfiguratorHarness("configurator-update");
});

afterAll(async () => {
  await harness.close();
});

test("connects the update section to an installation and installs from it", async () => {
  const page = await harness.newPage();
  let startCalls = 0;
  // The second answer settles the operation, which is what proves the
  // interface followed it rather than stopping at the first reply.
  const states = ["waiting_for_checks", "succeeded"];

  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true, csrfToken: "S".repeat(43) }),
    }),
  );
  await page.route("**/api/installations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ repositories: [installation], truncated: false }),
    }),
  );
  await page.route("**/api/updates**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(update),
      });
    }
    const state = states[Math.min(startCalls, states.length - 1)]!;
    startCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        operationId: "repository:9:velvet:2.1.0",
        version: "2.1.0",
        state,
      }),
    });
  });

  await harness.openSection(page, "updates");

  await page.getByText("Installed 2.0.0").waitFor();
  await page.getByText("Feature", { exact: true }).waitFor();
  const install = page.getByRole("button", { name: "Install update" }).first();
  await install.waitFor();

  await install.click();
  await page.getByText("Checking the update").waitFor();
  assert.equal(startCalls, 1, "one request starts the update");

  await page.getByText("Update installed").waitFor({ timeout: 30_000 });
  assert.ok(startCalls >= 2, "the operation was followed to its conclusion");
  await page.close();
}, BROWSER_TIMEOUT_MS);

test("says it is not connected rather than claiming an installation is current", async () => {
  // Exactly what a Configurator started with `./config start` sees. Reporting
  // "Up to date" here would tell somebody their status page is current when
  // Velvet has no idea what it is running.
  const page = await harness.newPage();
  await page.route("**/api/**", (route) => route.abort());

  await harness.openSection(page, "updates");

  await page.getByText("not connected to an installation").waitFor();
  assert.equal(
    await page.getByText("Up to date").count(),
    0,
    "an unconnected Configurator cannot know whether anything is current",
  );
  assert.equal(
    await page.getByRole("button", { name: "Install update" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("checkbox").count(),
    0,
    "a preference with nowhere to be stored is not a real choice",
  );
  await page.close();
}, BROWSER_TIMEOUT_MS);

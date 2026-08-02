import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";
import { load } from "js-yaml";

const repositoryRoot = new URL("../", import.meta.url);

test("deploys the bundled setup service as one health-checked Bun container", async () => {
  const document = load(
    await readFile(new URL("zerops.yaml", repositoryRoot), "utf8"),
  );
  const setup = document.zerops.find((entry) => entry.setup === "setup");

  assert.equal(setup.build.base, "bun@1.3");
  assert.deepEqual(setup.build.buildCommands, [
    "bun install --frozen-lockfile",
    "bun run --filter @velvet/setup-service build",
  ]);
  assert.deepEqual(setup.build.deployFiles, ["apps/setup-service/dist"]);
  assert.deepEqual(setup.run.ports, [{ port: 3000, httpSupport: true }]);
  assert.deepEqual(setup.run.envVariables, {
    NODE_ENV: "production",
    PORT: "3000",
  });
  assert.equal(setup.run.start, "bun apps/setup-service/dist/main.js");
  assert.deepEqual(setup.run.healthCheck, {
    httpGet: { port: 3000, path: "/healthz" },
  });

  const serialized = JSON.stringify(setup);
  for (const secret of [
    "GITHUB_APP_ID",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
    "SESSION_SECRET",
  ]) {
    assert.equal(serialized.includes(secret), false, `${secret} belongs in Zerops secrets`);
  }
});

test("imports the setup service with fixed single-container scaling", async () => {
  const document = load(
    (await readFile(
      new URL("deploy/zerops-import.yaml", repositoryRoot),
      "utf8",
    )).replace(/^#yamlPreprocessor=on\n/, ""),
  );
  const service = document.services.find((entry) => entry.hostname === "setup");

  assert.equal(document.project.name, "velvet-setup");
  assert.equal(service.type, "bun@1.3");
  assert.equal(service.minContainers, 1);
  assert.equal(service.maxContainers, 1);
  assert.equal(service.enableSubdomainAccess, true);
  assert.equal(
    service.envSecrets.SESSION_SECRET,
    "<@generateRandomString(<64>)>",
  );
});

test("documents minimum GitHub permissions, secrets, recovery, and rotation", async () => {
  const readme = await readFile(
    // The operational detail moved into the documentation directory;
    // the README says what the service is and points at it.
    new URL("documentation/setup-service.md", repositoryRoot),
    "utf8",
  );

  for (const text of [
    "Administration: Read and write",
    "Contents: Read and write",
    "Actions: Read and write",
    "Pages: Read and write",
    "No organization permissions",
    "No account permissions",
    "/api/auth/callback",
    "/api/auth/installed",
    "GITHUB_APP_PRIVATE_KEY",
    "SESSION_SECRET",
    "Single container",
    "--zerops-yaml-path zerops.yaml",
    "Partial setup recovery",
    "Key rotation",
  ]) {
    assert.equal(readme.includes(text), true, `missing deployment guidance: ${text}`);
  }
});

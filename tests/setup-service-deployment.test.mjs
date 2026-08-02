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

test("stamps the deployed build with the sources it was made from", async () => {
  const setupPackage = JSON.parse(
    await readFile(
      new URL("apps/setup-service/package.json", repositoryRoot),
      "utf8",
    ),
  );

  // Zerops runs this build command, so whatever it produces has to be able to
  // say which sources it came from. Without the stamp there is nothing for the
  // drift check to compare against.
  assert.equal(
    setupPackage.scripts.fingerprint,
    "bun run scripts/deployment-fingerprint.ts",
  );
  assert.equal(
    setupPackage.scripts.build,
    "bun run fingerprint && bun run scripts/build.ts",
  );
  // The stamp is generated rather than committed, so the gates that compile or
  // run the service have to produce it first.
  for (const gate of ["pretest", "pretypecheck"]) {
    assert.match(setupPackage.scripts[gate], /bun run fingerprint$/);
  }
});

test("reports deployment drift on merge without deploying anything", async () => {
  const source = await readFile(
    new URL(".github/workflows/deployment-drift.yml", repositoryRoot),
    "utf8",
  );
  const workflow = load(source);
  const [checkout, runtime, compare] = workflow.jobs.compare.steps;

  assert.deepEqual(workflow.on.push.branches, ["main"]);
  // A deploy can be skipped or fail without anyone merging afterwards, so the
  // comparison also runs on its own rather than only after a push.
  assert.equal(typeof workflow.on.schedule[0].cron, "string");
  assert.equal("workflow_dispatch" in workflow.on, true);
  assert.deepEqual(workflow.permissions, { contents: "read" });

  assert.equal(checkout.uses, "actions/checkout@v7");
  assert.equal(runtime.uses, "oven-sh/setup-bun@v2");
  assert.equal(runtime.with["bun-version-file"], "package.json");
  assert.equal(
    compare.run,
    "bun run apps/setup-service/scripts/check-deployment-drift.ts",
  );

  // The decision on #198. The service holds live sessions, so a failed deploy
  // during somebody's installation is worse than a stale one. The release
  // stays with a person, and this workflow only reports the gap. Deploying
  // from here would also need the App's private key in CI, which it does not
  // have and, under this decision, never will.
  assert.doesNotMatch(source, /zcli|secrets\./);
});

test("spells the deploy command one way, in the documentation and in the report", async () => {
  const documentation = await readFile(
    new URL("documentation/setup-service.md", repositoryRoot),
    "utf8",
  );
  const check = await readFile(
    new URL("apps/setup-service/scripts/check-deployment-drift.ts", repositoryRoot),
    "utf8",
  );

  const documented = documentation.match(/^zcli push .+$/mu);
  assert.notEqual(documented, null, "the documentation must show how to deploy");

  // A deploy documented in one place and reported in another is the same class
  // of gap this check exists to close, so the report quotes the documentation.
  assert.equal(
    check.includes(documented[0]),
    true,
    `the drift report must name the documented command: ${documented[0]}`,
  );
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
    "Deployment drift",
    "Partial setup recovery",
    "Key rotation",
  ]) {
    assert.equal(readme.includes(text), true, `missing deployment guidance: ${text}`);
  }
});

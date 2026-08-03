import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

/**
 * The script that carries a gate's per-workspace commands.
 *
 * `test` is the whole suite and delegates: the part a runner can carry lives in
 * `test:headless`, and the browser part runs no workspace gates of its own. The
 * ordering this file is about is therefore recorded in `test:headless`.
 *
 * @param {string} gate - The gate's name.
 * @returns {string} The script name to read.
 */
function scriptCarrying(gate) {
  return gate === "test" ? "test:headless" : gate;
}

test("builds runtime packages needed by clean typechecking", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageDocument.scripts.pretypecheck,
    "bun run --filter @velvet/contracts build && bun run --filter @velvet/monitor build && bun run --filter @velvet/github-incidents build",
  );
});

test("builds contracts before inspecting the production bundle", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageDocument.scripts["pretest:lockfile"],
    "bun run --filter @velvet/contracts build",
  );
});

test("runs monitor gates after its contracts dependency", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  for (const gate of ["build", "test", "typecheck"]) {
    const script = packageDocument.scripts[scriptCarrying(gate)];
    const contractsCommand = `bun run --filter @velvet/contracts ${gate}`;
    const monitorCommand = `bun run --filter @velvet/monitor ${gate}`;

    assert.equal(typeof script, "string");
    assert.notEqual(script.indexOf(contractsCommand), -1);
    assert.notEqual(script.indexOf(monitorCommand), -1);
    assert.equal(
      script.indexOf(contractsCommand) < script.indexOf(monitorCommand),
      true,
    );
  }
});

test("runs GitHub incident gates after contracts and monitor", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const incidentPackage = JSON.parse(
    await readFile(
      new URL("../packages/github-incidents/package.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(
    incidentPackage.scripts.pretest,
    "bun run --filter @velvet/contracts build && bun run --filter @velvet/monitor build",
  );
  for (const gate of ["build", "test", "typecheck"]) {
    const script = packageDocument.scripts[scriptCarrying(gate)];
    const contractsCommand = `bun run --filter @velvet/contracts ${gate}`;
    const monitorCommand = `bun run --filter @velvet/monitor ${gate}`;
    const incidentsCommand = `bun run --filter @velvet/github-incidents ${gate}`;

    assert.equal(typeof script, "string");
    assert.notEqual(script.indexOf(incidentsCommand), -1);
    assert.equal(
      script.indexOf(contractsCommand) < script.indexOf(incidentsCommand),
      true,
    );
    assert.equal(
      script.indexOf(monitorCommand) < script.indexOf(incidentsCommand),
      true,
    );
  }
});

test("runs the monitor action gates after all runtime dependencies", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const actionPackage = JSON.parse(
    await readFile(
      new URL("../actions/monitor/package.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(
    actionPackage.scripts.pretest,
    "bun run --filter @velvet/contracts build && bun run --filter @velvet/monitor build && bun run --filter @velvet/github-incidents build",
  );
  for (const gate of ["build", "test", "typecheck"]) {
    const script = packageDocument.scripts[scriptCarrying(gate)];
    const actionCommand = `bun run --filter @velvet/monitor-action ${gate}`;
    const dependencyCommands = [
      `bun run --filter @velvet/contracts ${gate}`,
      `bun run --filter @velvet/monitor ${gate}`,
      `bun run --filter @velvet/github-incidents ${gate}`,
    ];

    assert.equal(typeof script, "string");
    assert.notEqual(script.indexOf(actionCommand), -1);
    for (const dependencyCommand of dependencyCommands) {
      assert.equal(
        script.indexOf(dependencyCommand) < script.indexOf(actionCommand),
        true,
      );
    }
  }
});

test("runs managed template-file gates after their contracts dependency", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const templatePackage = JSON.parse(
    await readFile(
      new URL("../packages/template-files/package.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(
    templatePackage.scripts.pretest,
    "bun run --filter @velvet/contracts build",
  );
  for (const gate of ["build", "test", "typecheck"]) {
    const script = packageDocument.scripts[scriptCarrying(gate)];
    const contractsCommand = `bun run --filter @velvet/contracts ${gate}`;
    const templateCommand = `bun run --filter @velvet/template-files ${gate}`;

    assert.equal(typeof script, "string");
    assert.notEqual(script.indexOf(templateCommand), -1);
    assert.equal(
      script.indexOf(contractsCommand) < script.indexOf(templateCommand),
      true,
    );
  }
});

test("runs setup service gates from the root workspace", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const setupPackage = JSON.parse(
    await readFile(
      new URL("../apps/setup-service/package.json", import.meta.url),
      "utf8",
    ),
  );

  // The service hosts both browser applications, so both must be built before
  // its own build copies them into the image it ships.
  assert.equal(
    setupPackage.scripts.prebuild,
    "bun run --filter @velvet/contracts build && bun run --filter @velvet/template-files build && bun run --filter @velvet/site onboarding:build && bun run --filter @velvet/site configurator:build",
  );
  for (const gate of ["build", "test", "typecheck"]) {
    assert.match(
      packageDocument.scripts[scriptCarrying(gate)],
      new RegExp(`bun run --filter @velvet/setup-service ${gate}`),
    );
  }
});

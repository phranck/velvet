import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

test("builds contracts before typechecking dependent workspaces", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageDocument.scripts.pretypecheck,
    "bun run --filter @velvet/contracts build && bun run --filter @velvet/monitor build",
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
    const script = packageDocument.scripts[gate];
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
    const script = packageDocument.scripts[gate];
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
    const script = packageDocument.scripts[gate];
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

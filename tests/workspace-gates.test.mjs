import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

test("builds contracts before typechecking dependent workspaces", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageDocument.scripts.pretypecheck,
    "bun run --filter @velvet/contracts build",
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

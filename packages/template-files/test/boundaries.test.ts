import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

const packageRoot = new URL("../", import.meta.url);

test("template generation stays independent from GitHub and presentation code", () => {
  const packageDocument = JSON.parse(
    readFileSync(new URL("package.json", packageRoot), "utf8"),
  ) as { dependencies?: Record<string, string> };

  assert.deepEqual(Object.keys(packageDocument.dependencies ?? {}).sort(), [
    "@velvet/contracts",
    "js-yaml",
  ]);
  for (const path of ["src/materialize.ts", "src/publication.ts"]) {
    const source = readFileSync(new URL(path, packageRoot), "utf8");
    assert.doesNotMatch(source, /@octokit|svelte|api\.github\.com/u);
  }
});

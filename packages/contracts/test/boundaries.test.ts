import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { test } from "bun:test";

const packageRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".js", ".mjs", ".ts", ".svelte"].includes(extname(entry.name))
      ? [path]
      : [];
  });
}

test("contracts remain independent from presentation, monitor, and GitHub implementations", () => {
  const packageDocument = JSON.parse(
    readFileSync(new URL("package.json", packageRoot), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const dependencies = Object.keys(packageDocument.dependencies ?? {});

  assert.deepEqual(dependencies.sort(), ["@sinclair/typebox", "js-yaml"]);
  assert.equal(
    dependencies.some(
      (dependency) =>
        dependency.includes("svelte") ||
        dependency.includes("github") ||
        dependency.includes("upptime"),
    ),
    false,
  );
});

test("presentation code cannot import monitor or persistence internals", () => {
  const siteSource = new URL("site/src/", repositoryRoot).pathname;
  const forbiddenImport = /@velvet\/(?:monitor|github-persistence|upptime-adapter)/;

  for (const path of sourceFiles(siteSource)) {
    assert.doesNotMatch(readFileSync(path, "utf8"), forbiddenImport, path);
  }
});

test("package boundary documentation defines input, output, and dependencies", () => {
  const readme = readFileSync(new URL("README.md", packageRoot), "utf8");
  for (const heading of [
    "Contracts and configuration",
    "Direct HTTP execution",
    "Monitor orchestration and state",
    "GitHub persistence and incidents",
    "Upptime migration",
    "Browser onboarding and setup API",
    "Svelte presentation",
  ]) {
    assert.equal(readme.includes(heading), true, `missing boundary: ${heading}`);
  }
  assert.match(readme, /\| Boundary \| Input \| Output \| Allowed dependencies \|/);
});

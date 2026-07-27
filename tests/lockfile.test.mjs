import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function findMissingOptionalDependencies(lockfile) {
  const packages = lockfile.packages ?? {};
  const presentDependencies = new Set();

  for (const packagePath of Object.keys(packages)) {
    const nodeModulesIndex = packagePath.lastIndexOf("node_modules/");
    if (nodeModulesIndex >= 0) {
      presentDependencies.add(packagePath.slice(nodeModulesIndex + "node_modules/".length));
    }
  }

  const missingDependencies = new Set();
  for (const packageMetadata of Object.values(packages)) {
    for (const dependency of Object.keys(packageMetadata.optionalDependencies ?? {})) {
      if (!presentDependencies.has(dependency)) {
        missingDependencies.add(dependency);
      }
    }
  }

  return [...missingDependencies].sort();
}

test("detects a missing platform-specific optional dependency", () => {
  const lockfile = {
    packages: {
      "node_modules/rollup": {
        optionalDependencies: {
          "@rollup/rollup-darwin-arm64": "4.62.2",
          "@rollup/rollup-linux-x64-gnu": "4.62.2",
        },
      },
      "node_modules/@rollup/rollup-darwin-arm64": {},
    },
  };

  assert.deepEqual(findMissingOptionalDependencies(lockfile), [
    "@rollup/rollup-linux-x64-gnu",
  ]);
});

test("root lockfile contains every declared optional dependency", async () => {
  const lockfile = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url)));

  assert.deepEqual(findMissingOptionalDependencies(lockfile), []);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { build } from "vite";

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

test("third-party notices cover every package in the production browser bundle", async () => {
  const bundledPackages = new Set();
  const siteRoot = fileURLToPath(new URL("../site", import.meta.url));

  await build({
    root: siteRoot,
    logLevel: "silent",
    build: {
      write: false,
      rollupOptions: {
        plugins: [
          {
            name: "collect-bundled-packages",
            generateBundle(_options, bundle) {
              for (const output of Object.values(bundle)) {
                if (output.type !== "chunk") continue;

                for (const id of Object.keys(output.modules)) {
                  const marker = "/node_modules/";
                  const index = id.lastIndexOf(marker);
                  if (index < 0) continue;

                  const parts = id.slice(index + marker.length).split("/");
                  bundledPackages.add(
                    parts[0].startsWith("@")
                      ? `${parts[0]}/${parts[1]}`
                      : parts[0],
                  );
                }
              }
            },
          },
        ],
      },
    },
  });

  const notices = await readFile(
    new URL("../THIRD_PARTY_NOTICES.md", import.meta.url),
    "utf8",
  );

  for (const packageName of bundledPackages) {
    assert.equal(
      notices.includes(packageName),
      true,
      `Missing distributed-package notice for ${packageName}`,
    );
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";

const { build } = await import(
  import.meta.resolve("vite", new URL("../site/package.json", import.meta.url).href)
);

function findMissingOptionalDependencies(lockfile) {
  const packages = lockfile.packages ?? {};
  const packagePaths = Object.keys(packages);
  const hasDependency = (dependency) =>
    packagePaths.some(
      (packagePath) =>
        packagePath === dependency || packagePath.endsWith(`/${dependency}`),
    );

  const missingDependencies = new Set();
  for (const packageMetadata of Object.values(packages)) {
    for (const dependency of Object.keys(packageMetadata[2]?.optionalDependencies ?? {})) {
      if (!hasDependency(dependency)) {
        missingDependencies.add(dependency);
      }
    }
  }

  return [...missingDependencies].sort();
}

test("detects a missing platform-specific optional dependency", () => {
  const lockfile = {
    packages: {
      rollup: [
        "rollup@4.62.3",
        "",
        {
          optionalDependencies: {
            "@rollup/rollup-darwin-arm64": "4.62.3",
            "@rollup/rollup-linux-x64-gnu": "4.62.3",
          },
        },
      ],
      "@rollup/rollup-darwin-arm64": [
        "@rollup/rollup-darwin-arm64@4.62.3",
        "",
        {
          os: "darwin",
          cpu: "arm64",
        },
      ],
    },
  };

  assert.deepEqual(findMissingOptionalDependencies(lockfile), [
    "@rollup/rollup-linux-x64-gnu",
  ]);
});

test("root lockfile contains every declared optional dependency", async () => {
  const lockfile = Bun.JSONC.parse(
    await readFile(new URL("../bun.lock", import.meta.url), "utf8"),
  );

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

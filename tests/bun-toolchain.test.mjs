import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "bun:test";

const repositoryRoot = new URL("../", import.meta.url);
const supportedBunVersion = "1.3.14";

async function read(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await read(relativePath));
}

test("pins Bun as the only package manager and JavaScript command runner", async () => {
  const rootPackage = await json("package.json");
  const bunfig = await read("bunfig.toml");

  assert.equal(rootPackage.packageManager, `bun@${supportedBunVersion}`);
  assert.deepEqual(rootPackage.engines, { bun: `>=${supportedBunVersion}` });
  assert.match(bunfig, /\[run\][\s\S]*\bbun\s*=\s*true\b/);

  for (const packagePath of [
    "package.json",
    "actions/monitor/package.json",
    "actions/sync-data/package.json",
    "packages/contracts/package.json",
    "packages/upptime-adapter/package.json",
    "site/package.json",
  ]) {
    const packageDocument = await json(packagePath);
    assert.equal(packageDocument.devDependencies?.tsx, undefined, packagePath);

    for (const [scriptName, script] of Object.entries(packageDocument.scripts ?? {})) {
      assert.doesNotMatch(
        script,
        /(^|\s|&&|;)\b(?:npm|npx|node|tsx)\b/,
        `${packagePath}#${scriptName}`,
      );
    }
  }
});

test("keeps bun.lock as the sole package-manager lockfile", async () => {
  await access(new URL("bun.lock", repositoryRoot));
  await assert.rejects(access(new URL("package-lock.json", repositoryRoot)));

  const lockfile = Bun.JSONC.parse(await read("bun.lock"));
  assert.equal(lockfile.packages.tsx, undefined);
});

test("runs local and distributed automation through the pinned Bun toolchain", async () => {
  const files = [
    "action.yml",
    "actions/monitor/action.yml",
    "actions/sync-data/action.yml",
    "actions/sync-data/scripts/sync.sh",
    ".github/workflows/screenshot.yml",
    ".github/workflows/theme-registry.yml",
    "config",
  ];

  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /actions\/setup-node|\bnpm\b|\bnpx\b|package-lock\.json/);
  }

  const screenshotWorkflow = await read(".github/workflows/screenshot.yml");
  assert.match(screenshotWorkflow, /uses: oven-sh\/setup-bun@v2/);
  assert.match(screenshotWorkflow, /uses: actions\/cache@v4/);
  assert.match(screenshotWorkflow, /~\/\.bun\/install\/cache/);
  assert.match(screenshotWorkflow, /hashFiles\('bun\.lock'\)/);

  const configurator = await read("config");
  assert.match(configurator, /^#!\/usr\/bin\/env bun$/m);
  assert.match(configurator, /Run bun run configurator:build first\./);
});

test("passes the working directory to Bun subcommands", async () => {
  const files = [
    "action.yml",
    "actions/monitor/action.yml",
    "actions/sync-data/action.yml",
    "actions/sync-data/scripts/sync.sh",
  ];

  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /\bbun --cwd\b/, file);
  }
});

test("documents the pinned Bun support matrix without obsolete npm guidance", async () => {
  const documentation = await Promise.all(
    [
      "README.md",
      "RELEASING.md",
      "LICENSING.md",
      "THIRD_PARTY_NOTICES.md",
      "packages/contracts/README.md",
    ].map(read),
  );
  const combined = documentation.join("\n");

  assert.match(combined, new RegExp(`Bun ${supportedBunVersion.replaceAll(".", "\\.")}`));
  assert.match(combined, /macOS[\s\S]*Linux CI[\s\S]*Playwright[\s\S]*Composite Actions/);
  assert.doesNotMatch(combined, /\bnpm\b|\bnpx\b|package-lock\.json|setup-node/);
});

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "bun:test";
import { parseVelvetConfiguration } from "@velvet/contracts";

const repositoryRoot = resolve(import.meta.dirname, "../..");

async function read(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

function activeDocumentation(source: string): string {
  const migrationHeading = "## Migrate from Velvet v1.8";
  const migrationStart = source.indexOf(migrationHeading);
  assert.notEqual(
    migrationStart,
    -1,
    `documentation must contain ${migrationHeading}`,
  );
  return source.slice(0, migrationStart);
}

test("public documentation presents the standalone native product first", async () => {
  const [readme, configuration, onboarding] = await Promise.all([
    read("README.md"),
    read("CONFIGURATION.md"),
    read("site/src/onboarding/Onboarding.svelte"),
  ]);

  for (const source of [activeDocumentation(readme), activeDocumentation(configuration)]) {
    assert.doesNotMatch(source, /Upptime|Globalping/iu);
    assert.match(source, /GitHub-native/iu);
    assert.match(source, /IPv4/iu);
    assert.match(source, /IPv6/iu);
    assert.match(source, /velvet\.yml/u);
  }

  assert.match(readme, /browser setup/iu);
  assert.match(readme, /direct template/iu);
  assert.match(readme, /GitHub Issues/iu);
  assert.match(readme, /GitHub Pages/iu);
  assert.match(readme, /365 days/iu);
  assert.match(readme, /rollback/iu);
  assert.match(configuration, /JSON Pointer/iu);
  assert.match(configuration, /failureThreshold/u);
  assert.match(configuration, /recoveryThreshold/u);
  assert.match(configuration, /API_HEALTH_TOKEN/u);
  assert.match(configuration, /maintenance/iu);
  assert.match(configuration, /recovery/iu);

  assert.doesNotMatch(onboarding, /Upptime|Globalping/iu);
});

test("the public demo uses a valid IPv4-only native configuration", async () => {
  const [configuration, fixtures, screenshot] = await Promise.all([
    read("site/demo/velvet.yml"),
    read("site/demo/fixtures.mjs"),
    read("site/scripts/screenshot.mjs"),
  ]);
  const result = parseVelvetConfiguration(configuration);

  assert.equal(result.success, true);
  assert.doesNotMatch(configuration, /Upptime|Globalping|IPv6/iu);
  assert.doesNotMatch(fixtures, /ipv6/iu);
  assert.match(screenshot, /demo\/velvet\.yml/u);
  assert.doesNotMatch(screenshot, /\.upptimerc\.yml/u);
});

test("repository documentation has no broken local link targets", async () => {
  for (const path of ["README.md", "CONFIGURATION.md", "LICENSING.md"]) {
    const source = await read(path);
    const links = source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu);

    for (const [, rawTarget] of links) {
      const target = rawTarget.split("#", 1)[0];
      if (!target || /^[a-z][a-z\d+.-]*:/iu.test(target)) continue;
      await assert.doesNotReject(
        access(resolve(dirname(resolve(repositoryRoot, path)), decodeURIComponent(target))),
        `${path} links to missing local target ${rawTarget}`,
      );
    }
  }
});

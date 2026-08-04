import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "bun:test";
import { parseVelvetConfiguration } from "@velvet/contracts";

const repositoryRoot = resolve(import.meta.dirname, "../..");

async function read(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

test("public documentation presents the standalone native product first", async () => {
  const [readme, configuration, onboarding] = await Promise.all([
    read("README.md"),
    read("documentation/configuration.md"),
    read("site/src/onboarding/Onboarding.svelte"),
  ]);

  // Whole documents rather than a leading section: there is no migration
  // chapter left to hold the names, so nothing in either file may carry them.
  for (const source of [readme, configuration]) {
    assert.doesNotMatch(source, /Upptime|Globalping/iu);
    assert.match(source, /GitHub-native/iu);
    assert.match(source, /IPv4/iu);
    assert.match(source, /IPv6/iu);
    assert.match(source, /velvet\.yml/u);
  }

  assert.match(readme, /setup\.velvet\.li\/onboarding/u);
  // Copying the template creates a repository with no version lock, which
  // nobody can update afterwards. Documenting it as a second way in would
  // promise support that cannot be given.
  assert.doesNotMatch(readme, /use this template/iu);
  assert.doesNotMatch(readme, /direct template/iu);
  assert.match(readme, /only supported way/iu);
  assert.match(readme, /GitHub Issues/iu);
  assert.match(readme, /GitHub Pages/iu);
  assert.match(readme, /365 days/iu);
  assert.match(readme, /rerun the failed workflow/iu);
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

test("nothing in the repository names the products Velvet is not", async () => {
  /*
   * Velvet is its own product. Naming another status-page generator, anywhere,
   * describes a lineage that is not part of what Velvet is, and every mention
   * invites the next one: a comment explaining a compatibility path, then the
   * path itself, then a section of documentation about it.
   *
   * Whole repository rather than the documents somebody thought of, because
   * the mentions this replaced sat in a changelog entry, in release notes
   * compiled into the setup service, and in a branch of the configuration
   * generator, none of which any earlier check looked at.
   */
  const forbidden = /Upptime|upptimerc|Globalping/iu;
  const listed = Bun.spawnSync(
    ["git", "ls-files", "-z"],
    { cwd: repositoryRoot, stdout: "pipe" },
  );
  const paths = listed.stdout
    .toString()
    .split("\0")
    .filter((path) => path.length > 0)
    // This file states the names in order to forbid them, which is the one
    // place they can appear without describing Velvet as something it is not.
    .filter((path) => path !== "site/test/standalone-product.test.ts")
    // Binaries hold no prose, and reading them here would only be slow.
    .filter((path) => !/\.(png|jpe?g|webp|ico|woff2?|ttf|otf|gz|pdf)$/iu.test(path));

  const offenders: string[] = [];
  for (const path of paths) {
    const source = await read(path).catch(() => "");
    if (forbidden.test(source)) offenders.push(path);
  }

  assert.deepEqual(offenders, []);
});

test("repository documentation has no broken local link targets", async () => {
  for (const path of ["README.md", "documentation/configuration.md", "LICENSING.md"]) {
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

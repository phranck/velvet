import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import {
  deploymentFingerprint,
  writeDeploymentFingerprint,
} from "../scripts/deployment-fingerprint.js";
import { HOSTED_APPS } from "../src/static.js";

/** A repository holding only the directories the fingerprint reads. */
async function fixture(
  files: Record<string, string>,
): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "velvet-fingerprint-"));
  // Every directory the fingerprint reads has to exist, including one bundle
  // per hosted application. Taken from the same list the fingerprint reads, so
  // adding an application does not leave this fixture short of a directory the
  // real repository has.
  for (const directory of [
    "apps/setup-service/src",
    "packages/contracts/src",
    "packages/template-files/src",
    ...HOSTED_APPS,
  ]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("gives identical sources the same fingerprint", async () => {
  const files = { "apps/setup-service/src/main.ts": "export const a = 1;\n" };
  const first = await fixture(files);
  const second = await fixture(files);

  try {
    assert.equal(
      await deploymentFingerprint(first.root),
      await deploymentFingerprint(second.root),
      "two checkouts of the same commit must compare equal",
    );
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});

test("notices a change in the service's own sources", async () => {
  const before = await fixture({
    "apps/setup-service/src/main.ts": "export const a = 1;\n",
  });
  const after = await fixture({
    "apps/setup-service/src/main.ts": "export const a = 2;\n",
  });

  try {
    assert.notEqual(
      await deploymentFingerprint(before.root),
      await deploymentFingerprint(after.root),
    );
  } finally {
    await before.cleanup();
    await after.cleanup();
  }
});

test("notices a changed browser bundle, which is what actually drifted", async () => {
  // The case this exists for: a shared component is fixed, the bundle it is
  // compiled into changes, the website ships it and the service does not.
  const before = await fixture({
    "onboarding/assets/onboarding-AAAA.js": "console.log(1);\n",
  });
  const after = await fixture({
    "onboarding/assets/onboarding-BBBB.js": "console.log(1);\n",
  });

  try {
    assert.notEqual(
      await deploymentFingerprint(before.root),
      await deploymentFingerprint(after.root),
      "a renamed bundle changes what is served even with identical contents",
    );
  } finally {
    await before.cleanup();
    await after.cleanup();
  }
});

test("notices a contract change the service embeds", async () => {
  const before = await fixture({
    "packages/contracts/src/index.ts": "export const version = 1;\n",
  });
  const after = await fixture({
    "packages/contracts/src/index.ts": "export const version = 2;\n",
  });

  try {
    assert.notEqual(
      await deploymentFingerprint(before.root),
      await deploymentFingerprint(after.root),
    );
  } finally {
    await before.cleanup();
    await after.cleanup();
  }
});

test("the fingerprint a build writes still describes that build", async () => {
  // The module the build writes lives inside a hashed directory. Were it part
  // of the hash, writing it would invalidate the value just written: the
  // service would report one hash whilst the same sources computed another,
  // and the drift check would report drift against the very commit it deployed.
  const { root, cleanup } = await fixture({
    "apps/setup-service/src/main.ts": "export const a = 1;\n",
  });

  try {
    const written = await writeDeploymentFingerprint(root);

    assert.equal(
      await deploymentFingerprint(root),
      written,
      "the sources must still hash to what the build reported for them",
    );
  } finally {
    await cleanup();
  }
});

test("ignores build output, which differs between two builds of one commit", async () => {
  const plain = await fixture({
    "apps/setup-service/src/main.ts": "export const a = 1;\n",
  });
  const built = await fixture({
    "apps/setup-service/src/main.ts": "export const a = 1;\n",
    "apps/setup-service/src/dist/main.js": "whatever the bundler emitted\n",
  });

  try {
    assert.equal(
      await deploymentFingerprint(plain.root),
      await deploymentFingerprint(built.root),
    );
  } finally {
    await plain.cleanup();
    await built.cleanup();
  }
});


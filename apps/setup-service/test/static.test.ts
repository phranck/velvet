import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { createStaticAssetProvider, HOSTED_APPS } from "../src/static.js";

/** Lays out a public root the way the build script produces it. */
async function publicRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "velvet-setup-static-"));
  for (const app of HOSTED_APPS) {
    await mkdir(join(directory, app, "assets"), { recursive: true });
    await writeFile(
      join(directory, app, "index.html"),
      `<!doctype html><title>${app}</title>`,
    );
    await writeFile(
      join(directory, app, "assets", "app-ABC123.js"),
      "export {};",
    );
  }
  await writeFile(join(directory, "secret.txt"), "secret");
  return directory;
}

test("serves each hosted application's document and fingerprinted assets", async () => {
  const directory = await publicRoot();
  try {
    const asset = createStaticAssetProvider(directory);

    for (const app of HOSTED_APPS) {
      const document = await asset(`${app}/index.html`);
      assert.equal(await document?.text(), `<!doctype html><title>${app}</title>`);
      assert.equal(
        document?.headers.get("Content-Type"),
        "text/html; charset=utf-8",
      );
      assert.equal(
        document?.headers.get("Cache-Control"),
        "no-store",
        "a document names its own hashed assets, so it must not be cached",
      );

      const script = await asset(`${app}/assets/app-ABC123.js`);
      assert.equal(
        script?.headers.get("Content-Type"),
        "text/javascript; charset=utf-8",
      );
      assert.match(script?.headers.get("Cache-Control") ?? "", /immutable/u);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("applies per-instance changes to documents but never to hashed assets", async () => {
  const directory = await publicRoot();
  try {
    const asset = createStaticAssetProvider(directory, (document) =>
      document.replace("<title>", "<meta name=instance><title>"),
    );

    const document = await asset("onboarding/index.html");
    assert.match(await document!.text(), /<meta name=instance>/u);

    // Hashed assets are cached for a year under a name derived from their
    // contents, so serving anything but the built bytes would hand out a file
    // that no longer matches the name it is cached under.
    const script = await asset("onboarding/assets/app-ABC123.js");
    assert.equal(await script!.text(), "export {};");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("refuses anything outside a hosted application", async () => {
  const directory = await publicRoot();
  try {
    const asset = createStaticAssetProvider(directory);

    for (const path of [
      "index.html",
      "secret.txt",
      "../secret.txt",
      "onboarding/../secret.txt",
      "onboarding/secret.txt",
      "onboarding/assets/missing.js",
      "admin/index.html",
    ]) {
      assert.equal(await asset(path), null, path);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});

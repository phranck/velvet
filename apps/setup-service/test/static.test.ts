import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import { createStaticAssetProvider } from "../src/static.js";

test("serves only the generated onboarding document and fingerprinted assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "velvet-setup-static-"));
  try {
    await mkdir(join(directory, "assets"));
    await writeFile(join(directory, "index.html"), "<!doctype html><title>Setup</title>");
    await writeFile(join(directory, "assets", "app-ABC123.js"), "export {};");
    await writeFile(join(directory, "secret.txt"), "secret");
    const asset = createStaticAssetProvider(directory);

    const document = await asset("index.html");
    assert.equal(await document?.text(), "<!doctype html><title>Setup</title>");
    assert.equal(document?.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(document?.headers.get("Cache-Control"), "no-store");

    const script = await asset("assets/app-ABC123.js");
    assert.equal(script?.headers.get("Content-Type"), "text/javascript; charset=utf-8");
    assert.match(script?.headers.get("Cache-Control") ?? "", /immutable/);

    assert.equal(await asset("../secret.txt"), null);
    assert.equal(await asset("secret.txt"), null);
    assert.equal(await asset("assets/missing.js"), null);
  } finally {
    await rm(directory, { recursive: true });
  }
});

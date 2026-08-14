import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import {
  CONFIGURATOR_APP,
  createStaticAssetProvider,
  HOSTED_APPS,
  hostedAssetPath,
} from "../src/static.js";

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
  await mkdir(join(directory, CONFIGURATOR_APP, "themes", "velvet", "assets", "fonts"), {
    recursive: true,
  });
  await writeFile(
    join(directory, CONFIGURATOR_APP, "themes", "velvet", "theme.css"),
    ":root { color: red }",
  );
  await writeFile(
    join(
      directory,
      CONFIGURATOR_APP,
      "themes",
      "velvet",
      "assets",
      "fonts",
      "face-ABC123.woff2",
    ),
    "not really a font",
  );
  // Laid out so every refusal below is a refusal rather than a missing file.
  // A path that resolves to nothing answers null whatever the allowlist says,
  // which would leave the form itself untested.
  await mkdir(join(directory, CONFIGURATOR_APP, "themes", "velvet", "a", "b", "c", "d"), {
    recursive: true,
  });
  await writeFile(
    join(directory, CONFIGURATOR_APP, "themes", "velvet", "a", "b", "c", "d", "deep.css"),
    ".deep {}",
  );
  await writeFile(
    join(directory, CONFIGURATOR_APP, "themes", "velvet", "velvet-theme.toml"),
    "name = 'velvet'",
  );
  await writeFile(join(directory, CONFIGURATOR_APP, "secret.txt"), "secret");
  await mkdir(join(directory, "onboarding", "themes", "velvet"), { recursive: true });
  await writeFile(
    join(directory, "onboarding", "themes", "velvet", "theme.css"),
    ":root { color: blue }",
  );
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

test("serves a theme's own files, including from below a subdirectory", async () => {
  const directory = await publicRoot();
  try {
    const asset = createStaticAssetProvider(directory);

    const stylesheet = await asset(`${CONFIGURATOR_APP}/themes/velvet/theme.css`);
    assert.equal(
      stylesheet?.headers.get("Content-Type"),
      "text/css; charset=utf-8",
    );

    // The flat asset form the applications use does not reach this, which is
    // the whole reason a third form exists.
    const face = await asset(
      `${CONFIGURATOR_APP}/themes/velvet/assets/fonts/face-ABC123.woff2`,
    );
    assert.equal(face?.headers.get("Content-Type"), "font/woff2");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("refuses theme paths that climb, overreach, or belong to another application", async () => {
  const directory = await publicRoot();
  try {
    const asset = createStaticAssetProvider(directory);

    for (const path of [
      // Themes hang below the configurator and nowhere else.
      "onboarding/themes/velvet/theme.css",
      // A theme name is a segment, so it can be neither of these.
      `${CONFIGURATOR_APP}/themes/../secret.txt`,
      `${CONFIGURATOR_APP}/themes/./velvet/theme.css`,
      // The theme directory itself is not a file.
      `${CONFIGURATOR_APP}/themes/velvet`,
      // Deeper than a theme is ever laid out.
      `${CONFIGURATOR_APP}/themes/velvet/a/b/c/d/deep.css`,
      // An extension nothing serves.
      `${CONFIGURATOR_APP}/themes/velvet/velvet-theme.toml`,
    ]) {
      assert.equal(await asset(path), null, path);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("derives the served file from the request path, or refuses it", () => {
  assert.equal(hostedAssetPath("/onboarding/"), "onboarding/index.html");
  assert.equal(
    hostedAssetPath(`/${CONFIGURATOR_APP}/`),
    `${CONFIGURATOR_APP}/index.html`,
  );
  assert.equal(
    hostedAssetPath("/onboarding/assets/app-ABC123.js"),
    "onboarding/assets/app-ABC123.js",
  );
  assert.equal(
    hostedAssetPath(`/${CONFIGURATOR_APP}/themes/velvet/assets/fonts/face.woff2`),
    `${CONFIGURATOR_APP}/themes/velvet/assets/fonts/face.woff2`,
  );

  for (const pathname of [
    "/",
    "/secret.txt",
    "/admin/",
    "/onboarding",
    "onboarding/index.html",
    "/onboarding/../secret.txt",
    "/onboarding/assets/nested/app.js",
    `/${CONFIGURATOR_APP}/themes/`,
    `/${"a".repeat(300)}/`,
  ]) {
    assert.equal(hostedAssetPath(pathname), null, pathname);
  }
});

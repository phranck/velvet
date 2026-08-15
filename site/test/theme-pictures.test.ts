/**
 * The pictures of the themes, against the themes they are pictures of.
 *
 * Every surface that offers a theme shows the same picture: the start page, the
 * setup and the configurator. They are taken by hand, with a browser, so
 * nothing regenerates them when a theme changes and a stale one looks exactly
 * like a current one. This is what says so.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "bun:test";

import { readThemes, themeFingerprint } from "../scripts/themes.js";

const PICTURES = resolve(import.meta.dirname, "../src/assets/themes");

interface PictureManifest {
  themes: Record<
    string,
    { file: string; imageSha256: string; themeSha256: string }
  >;
}

const manifest = JSON.parse(
  await readFile(join(PICTURES, "manifest.json"), "utf8"),
) as PictureManifest;

test("every theme has a picture, and the picture is of that theme", async () => {
  const themes = (await readThemes()).filter((theme) => theme.manifest);
  assert.ok(themes.length > 0, "no theme was read at all");

  for (const theme of themes) {
    const recorded = manifest.themes[theme.directory];
    assert.ok(
      recorded,
      `${theme.directory} has no picture. Run \`bun run --cwd site themes:screenshots\`.`,
    );
    assert.equal(
      recorded.themeSha256,
      themeFingerprint(theme.files),
      `${theme.directory} has changed since its picture was taken, so what the start page, the setup and the configurator show is the theme as it used to be. Run \`bun run --cwd site themes:screenshots\`.`,
    );
  }
});

test("a picture is the file the manifest recorded, not one put there since", async () => {
  for (const [id, recorded] of Object.entries(manifest.themes)) {
    const image = await readFile(join(PICTURES, recorded.file));
    assert.equal(
      createHash("sha256").update(image).digest("hex"),
      recorded.imageSha256,
      `${recorded.file} is not the picture ${id} was photographed into. Run \`bun run --cwd site themes:screenshots\`.`,
    );
  }
});

test("nothing is pictured that is no longer a theme", async () => {
  const themes = new Set(
    (await readThemes())
      .filter((theme) => theme.manifest)
      .map((theme) => theme.directory),
  );

  for (const id of Object.keys(manifest.themes)) {
    assert.ok(
      themes.has(id),
      `${id} is pictured and is not a theme any more, so the picture and its entry are left over.`,
    );
  }
});

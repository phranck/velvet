import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { THEME_FACES } from "../scripts/theme-faces.js";

/**
 * Holds the notices file and the faces the designs actually carry together.
 *
 * `THIRD_PARTY_NOTICES.md` is not documentation about the build, it is the
 * attribution that ships: `site/src/attributions/Attributions.svelte` imports it
 * verbatim for velvet.li, and the status page Action copies it into every
 * generated site. A face credited there which nothing carries is a claim made to
 * everybody who installs Velvet.
 *
 * Written after Tangerine was removed from the Retro Chassis design on 2026-08-12
 * whilst its `@fontsource` dependency and its notice both stayed, which nothing
 * reported because nothing compared the two.
 */
const notices = await readFile(
  resolve(import.meta.dirname, "../../THIRD_PARTY_NOTICES.md"),
  "utf8",
);

/** The family names the notices credit to a named design. */
function creditedToADesign(): string[] {
  return [...notices.matchAll(/^\| \[([^\]]+)\]\([^)]*\/ofl\/[^)]*\)[^|]*\|[^|]*\|[^|]*\|([^|]*)\|/gm)]
    .filter(([, , distribution]) => /bundled with the .+ design/.test(distribution))
    .map(([, family]) => family);
}

test("credits every face a design carries", () => {
  const carried = new Set(
    Object.values(THEME_FACES).flatMap((faces) => faces.map((face) => face.family)),
  );
  for (const family of carried) {
    assert.ok(
      notices.includes(`[${family}]`),
      `${family} ships with a design but THIRD_PARTY_NOTICES.md does not credit it.`,
    );
  }
});

test("credits no face to a design that does not carry it", () => {
  const carried = new Set(
    Object.values(THEME_FACES).flatMap((faces) => faces.map((face) => face.family)),
  );
  for (const family of creditedToADesign()) {
    assert.ok(
      carried.has(family),
      `THIRD_PARTY_NOTICES.md says ${family} is bundled with a design, but no design names it. Either add it to site/scripts/theme-faces.ts or remove the notice.`,
    );
  }
});

test("declares every bundled face as a dependency", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(import.meta.dirname, "../package.json"), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  for (const face of Object.values(THEME_FACES).flat()) {
    assert.ok(
      declared.has(`@fontsource/${face.package}`) ||
        declared.has(`@fontsource-variable/${face.package}`),
      `${face.family} is bundled but @fontsource/${face.package} is not declared in site/package.json.`,
    );
  }
});

test("declares no @fontsource package that nothing uses", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(import.meta.dirname, "../package.json"), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const bundled = new Set(Object.values(THEME_FACES).flat().map((face) => face.package));
  // The Velvet surfaces set their own text in faces no design carries, and they
  // import those packages by name from a stylesheet rather than through this
  // table. Named here so the check covers the designs without claiming the
  // surfaces are the designs.
  const surfaceFaces = new Set([
    "datatype",
    "workbench",
    "space-mono",
    "audiowide",
    "doto",
    "plaster",
    "fira-code",
  ]);
  const declared = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ].filter((name) => name.startsWith("@fontsource"));

  for (const name of declared) {
    const packageName = name.replace(/^@fontsource(-variable)?\//, "");
    assert.ok(
      bundled.has(packageName) || surfaceFaces.has(packageName),
      `${name} is declared but no design carries it and no surface names it. Remove it, or add it to site/scripts/theme-faces.ts.`,
    );
  }
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "bun:test";

const siteRoot = resolve(import.meta.dirname, "..");
const duotoneCss = resolve(
  siteRoot,
  "node_modules/@phosphor-icons/web/src/duotone/style.css",
);

/** Classes that select a weight rather than an icon, so they define no glyph. */
const WEIGHT_CLASSES = new Set([
  "ph-duotone",
  "ph-fill",
  "ph-bold",
  "ph-light",
  "ph-thin",
  "ph-regular",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|svelte|html)$/u.test(entry.name) ? [path] : [];
  });
}

test("every icon named in the sources exists in the face", () => {
  const css = readFileSync(duotoneCss, "utf8");
  const defined = new Set(
    [...css.matchAll(/\.ph-duotone\.(ph-[a-z0-9-]+):before/gu)].map(
      ([, name]) => name!,
    ),
  );

  const referenced = new Set<string>();
  const files = [
    ...sourceFiles(resolve(siteRoot, "src")),
    ...readdirSync(siteRoot)
      .filter((name) => name.endsWith(".html"))
      .map((name) => resolve(siteRoot, name)),
  ];
  for (const file of files) {
    for (const [name] of readFileSync(file, "utf8").matchAll(
      /\bph-[a-z0-9-]+\b/gu,
    )) {
      if (!WEIGHT_CLASSES.has(name)) referenced.add(name);
    }
  }

  // A name the face does not define renders as an empty box rather than as an
  // error, which is how a misremembered icon once reached a review. It also
  // silently drops out of the subset the build ships.
  const unknown = [...referenced].filter((name) => !defined.has(name)).sort();
  assert.deepEqual(unknown, [], "these icons do not exist in Phosphor duotone");
  assert.ok(referenced.size > 0, "the scan has to find the icons at all");
});

test("no page fetches the icon face from someone else's server", () => {
  // A generated status page runs on its owner's Pages site. An icon set it has
  // to reach a CDN for is an outage on their site that Velvet caused, and it
  // arrives as the complete face rather than the subset built here.
  for (const page of readdirSync(siteRoot).filter((name) =>
    name.endsWith(".html"),
  )) {
    const source = readFileSync(resolve(siteRoot, page), "utf8");
    assert.doesNotMatch(
      source,
      /unpkg\.com|cdn\.jsdelivr\.net|phosphor-icons[^"]*\.css/u,
      `${page} must bundle the icon face rather than fetch it`,
    );
  }
});

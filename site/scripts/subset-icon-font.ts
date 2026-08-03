import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import subsetFont from "subset-font";

/**
 * Cuts the Phosphor duotone face down to the icons Velvet actually shows.
 *
 * The complete face is 161 KB and carries about fifteen hundred icons, of which
 * Velvet uses a few dozen. It arrives at the same moment as the screenshot the
 * website is built around and competes with it for the same connection.
 *
 * Icons are named as class strings in markup rather than imported, so a bundler
 * cannot trace them and they are collected by scanning the sources instead.
 * That includes `src/lib/icons.ts`, where the curated service icons and the
 * automatic mappings are literals, so they are found the same way.
 *
 * An icon the face does not define fails this script rather than shipping. Left
 * to the browser it renders as an empty box, which is how a misremembered name
 * once reached a review.
 *
 * Usage: bun scripts/subset-icon-font.ts
 */
const siteRoot = resolve(import.meta.dirname, "..");
const phosphor = resolve(
  siteRoot,
  "node_modules/@phosphor-icons/web/src/duotone",
);
const OUTPUT = resolve(siteRoot, "src/assets/phosphor-duotone-subset.woff2");

/**
 * Classes that select a weight rather than an icon.
 *
 * They appear in exactly the same position in markup and define no glyph, so
 * without this they would each be reported as an unknown icon.
 */
const WEIGHT_CLASSES = new Set([
  "ph-duotone",
  "ph-fill",
  "ph-bold",
  "ph-light",
  "ph-thin",
  "ph-regular",
]);

/** Every file that can name an icon. */
async function sourceFiles(): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (/\.(ts|svelte|html)$/u.test(entry.name)) found.push(path);
    }
  };
  await walk(resolve(siteRoot, "src"));
  for (const entry of await readdir(siteRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      found.push(resolve(siteRoot, entry.name));
    }
  }
  return found;
}

/**
 * The two codepoints each icon needs, keyed by class name.
 *
 * Duotone sets every icon twice, a background layer through `::before` and the
 * foreground through `::after`, so subsetting to one of the pair produces an
 * icon missing half of itself.
 */
async function definedIcons(): Promise<Map<string, string[]>> {
  const css = await readFile(resolve(phosphor, "style.css"), "utf8");
  const defined = new Map<string, string[]>();
  const declaration =
    /\.ph-duotone\.(ph-[a-z0-9-]+):(?:before|after)\s*\{\s*content:\s*"\\([0-9a-f]+)"/gu;
  for (const [, name, codepoint] of css.matchAll(declaration)) {
    const points = defined.get(name!) ?? [];
    points.push(String.fromCodePoint(Number.parseInt(codepoint!, 16)));
    defined.set(name!, points);
  }
  return defined;
}

const defined = await definedIcons();
const referenced = new Set<string>();
for (const file of await sourceFiles()) {
  const source = await readFile(file, "utf8");
  for (const [name] of source.matchAll(/\bph-[a-z0-9-]+\b/gu)) {
    if (!WEIGHT_CLASSES.has(name)) referenced.add(name);
  }
}

const unknown = [...referenced].filter((name) => !defined.has(name)).sort();
if (unknown.length > 0) {
  throw new Error(
    `Phosphor duotone defines no such icon: ${unknown.join(", ")}. ` +
      "Check the name against the Phosphor set rather than removing the usage.",
  );
}

const glyphs = [...referenced]
  .flatMap((name) => defined.get(name) ?? [])
  .join("");
const complete = await readFile(resolve(phosphor, "Phosphor-Duotone.woff2"));
const subset = await subsetFont(complete, glyphs, { targetFormat: "woff2" });
await writeFile(OUTPUT, subset);

const percent = Math.round((subset.byteLength / complete.byteLength) * 100);
console.log(
  `${referenced.size} icons, ${complete.byteLength} to ${subset.byteLength} bytes (${percent}%)`,
);

/**
 * Copies the typefaces a design uses into the design's own directory.
 *
 * A bundle carries everything it references, and a face is the largest thing it
 * references. Fetching one from a font host is refused by the isolation gate for
 * two reasons: a published status page must not wait on a third party in order
 * to report on its own availability, and an operator in Germany should not be
 * made to send their visitors to a font host without having chosen to.
 *
 * The faces come from the `@fontsource` packages, which carry the `latin` subset
 * as WOFF2 together with the licence each face is published under. All of them
 * are the SIL Open Font License 1.1, which allows redistribution inside a larger
 * work provided the notice travels with the file, so the licence is copied
 * beside the faces.
 *
 * Run it after adding a face to a design:
 *
 * ```bash
 * bun run --cwd site bundles:fonts
 * ```
 */

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

import { BUNDLES, type Face } from "./bundle-faces.js";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, "..");

/** The subset every design needs and the only one any of them names. */
const SUBSET = "latin";

/** Where the complete Phosphor duotone face and its class list live. */
const PHOSPHOR = join(siteRoot, "node_modules/@phosphor-icons/web/src/duotone");

/**
 * Classes that select a weight rather than an icon.
 *
 * They stand in exactly the same position in markup and define no glyph, so
 * without this each of them would be reported as an unknown icon.
 */
const WEIGHT_CLASSES = new Set([
  "ph-duotone",
  "ph-fill",
  "ph-bold",
  "ph-light",
  "ph-thin",
  "ph-regular",
]);

/**
 * Copies one design's faces and writes the `@font-face` rules that name them.
 *
 * The rules are written here rather than by hand, because a `@font-face` names
 * a file that has to exist: the two are one decision and belong in one place.
 *
 * @param bundle - The directory under `site/theme-bundles/`.
 * @param faces - The faces that design carries.
 * @returns How many font files were written.
 */
async function copyFaces(bundle: string, faces: Face[]): Promise<number> {
  const target = join(siteRoot, "theme-bundles", bundle, "assets", "fonts");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const rules: string[] = [];
  let written = 0;
  for (const face of faces) {
    const source = join(siteRoot, "node_modules", "@fontsource", face.package);
    const available = new Set(await readdir(join(source, "files")));
    const wanted = [
      ...face.weights.map((weight) => ({ weight, style: "normal" })),
      ...(face.italic ?? []).map((weight) => ({ weight, style: "italic" })),
    ];
    for (const { weight, style } of wanted) {
      const file = `${face.package}-${SUBSET}-${weight}-${style}.woff2`;
      if (!available.has(file)) {
        throw new Error(
          `${bundle}: @fontsource/${face.package} has no ${file}. ` +
            `What it does have: ${[...available]
              .filter((name) => name.endsWith(".woff2"))
              .join(", ")}`,
        );
      }
      await cp(join(source, "files", file), join(target, file));
      written += 1;
      rules.push(
        `@font-face {\n` +
          `  font-family: "${face.family}";\n` +
          `  font-style: ${style};\n` +
          `  font-weight: ${weight};\n` +
          `  font-display: swap;\n` +
          `  src: url("./fonts/${file}") format("woff2");\n` +
          `}`,
      );
    }
    await cp(join(source, "LICENSE"), join(target, `${face.package}.LICENSE`));
  }

  const names = faces.map((face) => face.family).join(", ");
  await writeFile(
    join(siteRoot, "theme-bundles", bundle, "assets", "fonts.css"),
    `/*\n  The faces this design carries: ${names}.\n\n` +
      `  Written by site/scripts/bundle-fonts.ts together with the files it\n` +
      `  names, so a rule cannot point at a face nobody copied. Every one of\n` +
      `  them is published under the SIL Open Font License 1.1, and the licence\n` +
      `  travels beside the files in assets/fonts/.\n*/\n\n` +
      `${rules.join("\n\n")}\n`,
  );
  return written;
}

/**
 * Every Phosphor duotone icon, with the two codepoints each one needs.
 *
 * Duotone sets every icon twice, a background layer through `::before` and the
 * foreground through `::after`, so subsetting to one of the pair produces an
 * icon missing half of itself.
 */
async function phosphorIcons(): Promise<Map<string, string[]>> {
  const css = await readFile(join(PHOSPHOR, "style.css"), "utf8");
  const defined = new Map<string, string[]>();
  const declaration =
    /\.ph-duotone\.(ph-[a-z0-9-]+):(before|after)\s*\{\s*content:\s*"(\\[0-9a-f]+)"/gu;
  for (const [, name, , escaped] of css.matchAll(declaration)) {
    const points = defined.get(name!) ?? [];
    points.push(escaped!);
    defined.set(name!, points);
  }
  return defined;
}

/**
 * Cuts the Phosphor duotone face down to the icons one design shows, and
 * writes the rules that draw them.
 *
 * A design that shows no icons gets neither file, which is how a design built
 * from one typeface pays nothing for a face it never names. An icon the face
 * does not define fails this script rather than shipping, because left to the
 * browser it renders as an empty box.
 *
 * @param bundle - The directory under `site/theme-bundles/`.
 * @param defined - Every icon Phosphor duotone offers.
 * @returns How many icons the design uses.
 */
async function copyIcons(
  bundle: string,
  defined: Map<string, string[]>,
): Promise<number> {
  const directory = join(siteRoot, "theme-bundles", bundle);
  const referenced = new Set<string>();
  for (const entry of await readdir(directory)) {
    if (!/\.(ts|css)$/u.test(entry)) continue;
    const source = await readFile(join(directory, entry), "utf8");
    for (const [name] of source.matchAll(/\bph-[a-z0-9-]+\b/gu)) {
      if (!WEIGHT_CLASSES.has(name)) referenced.add(name);
    }
  }

  const target = join(directory, "assets", "icons.css");
  const face = join(directory, "assets", "phosphor-duotone-subset.woff2");
  if (referenced.size === 0) {
    await rm(target, { force: true });
    await rm(face, { force: true });
    return 0;
  }

  const unknown = [...referenced].filter((name) => !defined.has(name)).sort();
  if (unknown.length > 0) {
    throw new Error(
      `${bundle}: Phosphor duotone defines no such icon: ${unknown.join(", ")}. ` +
        "Check the name against the Phosphor set rather than removing the usage.",
    );
  }

  const glyphs = [...referenced]
    .flatMap((name) => defined.get(name) ?? [])
    .map((escaped) => String.fromCodePoint(Number.parseInt(escaped.slice(1), 16)))
    .join("");
  const complete = await readFile(join(PHOSPHOR, "Phosphor-Duotone.woff2"));
  await writeFile(
    face,
    await subsetFont(complete, glyphs, { targetFormat: "woff2" }),
  );

  const rules = [...referenced].sort().flatMap((name) => {
    const [background, foreground] = defined.get(name) ?? [];
    return [
      `.ph-duotone.${name}::before {\n  content: "${background}";\n}`,
      `.ph-duotone.${name}::after {\n  content: "${foreground}";\n}`,
    ];
  });

  await writeFile(
    target,
    `/*\n  The Phosphor duotone glyphs this design shows, and nothing else.\n\n` +
      `  Written by site/scripts/bundle-fonts.ts, which reads the names out of\n` +
      `  this design's own files and cuts the face down to them. The complete\n` +
      `  face carries about fifteen hundred icons; ${referenced.size} are used here.\n\n` +
      `  Phosphor Icons is published under the MIT licence.\n*/\n\n` +
      `@font-face {\n` +
      `  font-family: "Phosphor-Duotone";\n` +
      `  font-style: normal;\n` +
      `  font-weight: 400;\n` +
      `  font-display: block;\n` +
      `  src: url("./phosphor-duotone-subset.woff2") format("woff2");\n` +
      `}\n\n` +
      `.ph-duotone {\n` +
      `  display: inline-block;\n` +
      `  font-family: "Phosphor-Duotone";\n` +
      `  font-style: normal;\n` +
      `  font-weight: 400;\n` +
      `  font-variant: normal;\n` +
      `  line-height: 1;\n` +
      `  text-transform: none;\n` +
      `}\n\n` +
      `/*\n` +
      `  The foreground layer is laid back over the background one, which is\n` +
      `  what makes a duotone icon two-tone rather than two icons side by side.\n` +
      `*/\n` +
      `.ph-duotone::after {\n` +
      `  margin-left: -1em;\n` +
      `}\n\n` +
      `.ph-duotone::before {\n` +
      `  opacity: 0.2;\n` +
      `}\n\n` +
      `${rules.join("\n\n")}\n`,
  );
  return referenced.size;
}

const defined = await phosphorIcons();
for (const [bundle, faces] of Object.entries(BUNDLES)) {
  const written = await copyFaces(bundle, faces);
  const icons = await copyIcons(bundle, defined);
  const names = faces.map((face) => face.family).join(", ");
  console.log(
    `  ok    ${bundle}  ${written} face file(s), ${icons} icon(s): ${names}`,
  );
}

/**
 * Generate the icon module the website draws from.
 *
 * Reads SVGs exported from an Iconsax account and writes their path data into
 * a TypeScript module, which is then committed.
 *
 * That form is deliberate. The Iconsax licence permits redistribution "Only as
 * PART of code (w/ notice)" and forbids loose files, so the icons live as code
 * rather than as a folder of SVGs, and the notice ships on the attributions
 * page. It also keeps the build offline and deterministic: nothing is fetched
 * whilst the site is built.
 *
 * It reads the `iconsax` package by default, which publishes its free icons as
 * plain SVG and needs no network of its own. That package carries the six
 * styles and not the two corner finishes, so what it yields is Bulk in the
 * straight finish.
 *
 * To use the Rounded finish, export those icons from https://app.iconsax.io
 * with the corner set to Rounded and the style to Bulk, and name the directory
 * they landed in:
 *
 *   bun run --filter @velvet/site icons:build -- <directory>
 *
 * That step cannot be automated. Iconsax serves the artwork behind its public
 * catalogue encrypted, so those files cannot be read without the key its
 * application holds, and getting at them another way would mean going around a
 * protection its vendor put there deliberately.
 *
 * The export directory is never committed. What is committed is the module
 * this writes.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

/** The style the site draws in, chosen once for all of them. */
const STYLE = "bulk";

/**
 * Every icon the site names, and what it is for.
 *
 * The comment beside each is what it replaced, so a reader can tell whether a
 * later choice still means the same thing. `github-logo` is absent on purpose:
 * Iconsax carries no brand marks, so that one stays with Phosphor.
 */
const WANTED: Readonly<Record<string, string>> = {
  activity: "checks that run",
  book: "the documentation section",
  chart: "the history a page keeps",
  clock: "the changelog",
  "color-swatch": "themes",
  copy: "copying a code block",
  danger: "the notice on the reference",
  "document-download": "downloading the manual",
  "export-arrow-01": "a link that leaves for a new tab",
  flash: "creating a status page",
  global: "a custom domain",
  "profile-2user": "who runs Velvet",
  "shield-tick": "nothing leaks into the open",
  sms: "writing to us about a design",
  "warning-2": "incidents that open themselves",
};

/** One drawn layer of an icon. Bulk draws two, the lower one at reduced alpha. */
interface IconLayer {
  d: string;
  opacity?: number;
}

/**
 * Matches an exported file to the icon it holds.
 *
 * The application names an export after the icon and its search terms, joined
 * by an underscore, so the name is whatever precedes the first one.
 *
 * @param fileName - Name of a file in the export directory.
 * @returns The icon's name.
 */
function iconNameOf(fileName: string): string {
  return basename(fileName, ".svg").split("_")[0]!;
}

/**
 * Reads the drawn layers out of an SVG.
 *
 * Only the path data and the opacity are kept. Everything else in the file is
 * the frame the component supplies itself, so keeping it would mean carrying
 * the same viewBox fourteen times.
 *
 * @param svg - The file as published.
 * @returns Its layers in drawing order.
 */
function layersOf(svg: string): IconLayer[] {
  const layers: IconLayer[] = [];
  for (const [element] of svg.matchAll(/<path\b[^>]*\/?>/gu)) {
    const d = element.match(/\bd="([^"]+)"/u)?.[1];
    if (!d) continue;
    const opacity = element.match(/\bopacity="([^"]+)"/u)?.[1];
    layers.push(opacity ? { d, opacity: Number(opacity) } : { d });
  }
  return layers;
}

/** Every drawing the `iconsax` package publishes for the chosen style. */
async function fromPackage(): Promise<Map<string, string>> {
  const data = resolve(
    import.meta.dirname,
    "../node_modules/iconsax/dist/data",
  );
  const drawings = new Map<string, string>();
  for (const fileName of await readdir(data)) {
    if (!fileName.endsWith(".json")) continue;
    const category = JSON.parse(await readFile(resolve(data, fileName), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    for (const [name, styles] of Object.entries(category)) {
      const svg = styles[STYLE];
      if (svg) drawings.set(name, svg);
    }
  }
  return drawings;
}

/** Every drawing in a directory of files exported from the application. */
async function fromExport(directory: string): Promise<Map<string, string>> {
  const drawings = new Map<string, string>();
  for (const fileName of await readdir(directory)) {
    if (!fileName.endsWith(".svg")) continue;
    drawings.set(
      iconNameOf(fileName),
      await readFile(resolve(directory, fileName), "utf8"),
    );
  }
  return drawings;
}

async function main(): Promise<void> {
  const directory = Bun.argv[2];
  const source = directory ? "the export" : "the iconsax package";
  const drawings = directory ? await fromExport(directory) : await fromPackage();

  const missing = Object.keys(WANTED).filter((name) => !drawings.has(name));
  if (missing.length > 0) {
    // Loudly, for the reason the font subset fails loudly: an icon that is not
    // there renders as nothing at all, which is invisible in review.
    throw new Error(`No ${STYLE} drawing in ${source} for: ${missing.join(", ")}.`);
  }

  const icons: Record<string, IconLayer[]> = {};
  for (const name of Object.keys(WANTED).sort()) {
    const layers = layersOf(drawings.get(name)!);
    if (layers.length === 0) throw new Error(`${name} carries no path data.`);
    icons[name] = layers;
  }

  const module = `// Generated by scripts/build-iconsax.ts. Do not edit by hand.
//
// Iconsax icons by Vuesax and Lusaxweb, free ${STYLE} style, from
// https://iconsax.io. Redistributed as part of this code under the Iconsax
// free licence, which permits exactly that and forbids loose files. The notice
// it requires is kept on the attributions page.

/** One drawn layer. Bulk draws two, the lower one at reduced alpha. */
export interface IconLayer {
  d: string;
  opacity?: number;
}

/** The name of an icon this module carries. */
export type IconName =
${Object.keys(icons)
  .map((name) => `  | "${name}"`)
  .join("\n")};

/** Every icon the site draws, in the style chosen for all of them. */
export const ICONS: Readonly<Record<IconName, readonly IconLayer[]>> =
  ${JSON.stringify(icons, null, 2)};
`;

  const output = resolve(import.meta.dirname, "../src/lib/iconsax.generated.ts");
  await writeFile(output, module);
  console.log(
    `velvet: wrote ${Object.keys(icons).length} icons from ${source} to ${output}`,
  );
}

await main();

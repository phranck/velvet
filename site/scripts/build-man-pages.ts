/**
 * Package the Velvet man pages as the archive velvet.li offers for download.
 *
 * The pages themselves are roff sources under `documentation/man`, so there is
 * nothing to compile. What this script does is arrange them in the directory
 * layout `man` expects, put the installer beside them, and compress the result
 * into the built website so the Pages workflow publishes it along with
 * everything else.
 *
 * The archive is never committed. It is derived entirely from files that are,
 * and rebuilding it is one command.
 *
 * Requires a prior website build, because it writes into that output.
 * Run: `bun run --filter @velvet/site man-pages:build`. An output directory may
 * be given as the first argument, which is what lets a test point it at a
 * throwaway build instead of the versioned one.
 */
import { cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY = resolve(SITE, "..");
const PAGES = join(REPOSITORY, "documentation/man");
const BUILT = Bun.argv[2] ? resolve(Bun.argv[2]) : join(SITE, "dist-website");

/** The name the website links to, kept stable so the link never has to move. */
const ARCHIVE = "velvet-man-pages.tar.gz";

/** The directory the archive unpacks into, and the installer's own root. */
const ROOT = "velvet-man-pages";

/**
 * Sorts a page into the section directory `man` looks for it in.
 *
 * The section is the file's own extension, which is what makes `velvet.yml.5`
 * a section 5 page and `velvet.7` a section 7 one.
 *
 * @param fileName Name of a roff source in `documentation/man`.
 * @returns The `manN` directory it belongs in, or `null` for anything that is
 *   not a man page, such as the installer.
 */
function sectionDirectory(fileName: string): string | null {
  const section = extname(fileName).slice(1);
  return /^[1-9]$/.test(section) ? `man${section}` : null;
}

async function main(): Promise<void> {
  try {
    await stat(join(BUILT, "index.html"));
  } catch {
    throw new Error(
      "No built website found. Run `bun run --filter @velvet/site website:build` first.",
    );
  }

  const staging = await mkdtemp(join(tmpdir(), "velvet-man-"));
  const root = join(staging, ROOT);

  try {
    let packaged = 0;
    for (const fileName of await readdir(PAGES)) {
      const section = sectionDirectory(fileName);
      if (!section) continue;
      await mkdir(join(root, section), { recursive: true });
      await cp(join(PAGES, fileName), join(root, section, fileName));
      packaged += 1;
    }

    if (packaged === 0) {
      throw new Error(`No man pages found in ${PAGES}.`);
    }

    // Copied rather than generated, and copying keeps its mode, so what a
    // visitor unpacks is already executable.
    await cp(join(PAGES, "install.sh"), join(root, "install.sh"));

    const archivePath = join(BUILT, ARCHIVE);
    const packing = Bun.spawn(["tar", "-czf", archivePath, "-C", staging, ROOT], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await packing.exited) !== 0) {
      throw new Error("tar refused to build the man-page archive.");
    }

    const { size } = await stat(archivePath);
    console.log(
      `velvet: wrote ${archivePath} (${packaged} pages, ${(size / 1024).toFixed(1)} KB)`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

await main();

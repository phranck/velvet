import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";

const repositoryRoot = new URL("../", import.meta.url);

const MAN_PAGES = ["velvet.7", "velvet.yml.5"];

async function read(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

function manPagePath(name) {
  return fileURLToPath(new URL(`documentation/man/${name}`, repositoryRoot));
}

/**
 * Reads the field names the configuration reference documents.
 *
 * Only two kinds of table in that document name configuration keys, and they
 * are told apart by their first heading. A `Field` table names one key per row
 * in its first cell. A `Group` table names a theme group in its first cell and
 * that group's own keys across the rest of the row, so every cell counts. The
 * reference also holds a table of release classifications and one of workflows,
 * and neither of those names a key at all.
 *
 * @param {string} markdown Contents of `documentation/configuration.md`.
 * @returns {Set<string>} Leaf names, so `fonts.sans` and `services[].id` arrive
 *   as `sans` and `id`. The man page groups its fields under headings rather
 *   than repeating the dotted path, so the leaf is what both documents share.
 */
function documentedFieldNames(markdown) {
  const identifier = /^[A-Za-z][A-Za-z0-9]*(\[\])?(\.[A-Za-z][A-Za-z0-9]*(\[\])?)*$/u;
  const names = new Set();
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^\|\s*(Field|Group)\s*\|/u.exec(lines[index]);
    if (!heading) continue;

    const wholeRow = heading[1] === "Group";
    for (let row = index + 2; row < lines.length; row += 1) {
      if (!lines[row].startsWith("|")) break;
      const cells = lines[row].split("|").slice(1, -1);
      for (const cell of wholeRow ? cells : cells.slice(0, 1)) {
        for (const [, token] of cell.matchAll(/`([^`]+)`/gu)) {
          if (!identifier.test(token)) continue;
          names.add(token.split(".").at(-1).replace("[]", ""));
        }
      }
    }
  }

  return names;
}

test("renders every man page without a roff diagnostic", () => {
  for (const page of MAN_PAGES) {
    const linted = Bun.spawnSync(["mandoc", "-T", "lint", manPagePath(page)]);

    // Silence is the whole assertion: mandoc writes every warning and error it
    // finds to its error stream and says nothing otherwise. The renderer is
    // required rather than optional, because a check that quietly skipped
    // itself where none is installed would leave the pages unverified exactly
    // where nobody looks at them.
    assert.equal(
      linted.stderr.toString(),
      "",
      `mandoc reported problems in ${page}`,
    );
    assert.equal(linted.exitCode, 0, `mandoc rejected ${page}`);
  }
});

test("documents every field the configuration reference names", async () => {
  const documented = documentedFieldNames(await read("documentation/configuration.md"));
  const page = await read("documentation/man/velvet.yml.5");

  // A floor under the extraction itself. Were the reference's tables reshaped
  // so their headings no longer read `Field` or `Group`, this test would
  // otherwise pass whilst comparing an empty set against the page.
  assert.equal(
    documented.size > 50,
    true,
    `only ${documented.size} field names were read from the configuration reference`,
  );

  const missing = [...documented].filter(
    (name) => !new RegExp(`\\b${name}\\b`, "u").test(page),
  );
  assert.deepEqual(
    missing,
    [],
    "velvet.yml.5 is missing fields the configuration reference documents",
  );
});

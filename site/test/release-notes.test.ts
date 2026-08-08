import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { parseReleaseNotes } from "../src/lib/release-notes.js";

test("renders the block structure Velvet release notes actually use", () => {
  const blocks = parseReleaseNotes(
    [
      "# Velvet 2.0.0",
      "",
      "Velvet now monitors your services on its own.",
      "",
      "## What is new",
      "",
      "- A native monitor checks every endpoint",
      "- Updates arrive through the Configurator",
      "",
      "1. First",
      "2. Second",
      "",
      "```",
      "bun run build",
      "```",
    ].join("\n"),
  );

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["heading", "paragraph", "heading", "list", "list", "code"],
  );
  assert.equal(blocks[0]?.kind === "heading" && blocks[0].level, 2);
  assert.equal(blocks[2]?.kind === "heading" && blocks[2].level, 3);
  assert.equal(blocks[3]?.kind === "list" && blocks[3].ordered, false);
  assert.equal(blocks[4]?.kind === "list" && blocks[4].ordered, true);
  assert.equal(blocks[5]?.kind === "code" && blocks[5].value, "bun run build");
});

test("reads a table as a header and its rows, with inline content in every cell", () => {
  const blocks = parseReleaseNotes(
    [
      "| Field | Default | Description |",
      "| --- | --- | --- |",
      "| `timeoutMs` | `10000` | The absolute timeout. |",
      "| `method` | `GET` | Either `GET` or `HEAD`. |",
      "",
      "A paragraph after the table.",
    ].join("\n"),
  );

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["table", "paragraph"],
  );

  const [table] = blocks;
  if (table?.kind !== "table") return;
  const text = (cells: (typeof table.headers)[number]): string =>
    cells.map((part) => part.value).join("");
  assert.deepEqual(table.headers.map(text), ["Field", "Default", "Description"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0]!.map(text), [
    "timeoutMs",
    "10000",
    "The absolute timeout.",
  ]);
  // Marked up rather than flattened, so a field name renders as code the way it
  // does in the document it came from.
  assert.deepEqual(table.rows[1]![0], [{ kind: "code", value: "method" }]);
});

test("treats a line beginning with a pipe as a table only when the dashes follow", () => {
  const blocks = parseReleaseNotes("| this is not a table |\n\nNor is this.");

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph", "paragraph"],
  );
});

test("keeps the document's own outline when asked for one", () => {
  const source = ["# Reference", "", "## Fields", "", "### Services"].join("\n");

  // The overlay's arrangement, which is what a caller gets without asking.
  assert.deepEqual(
    parseReleaseNotes(source).map((block) =>
      block.kind === "heading" ? block.level : null,
    ),
    [2, 3, 3],
  );
  // A reference page needs the levels the document wrote, except that nothing
  // may claim level 1, because the page around it already has one.
  assert.deepEqual(
    parseReleaseNotes(source, { headings: "outline" }).map((block) =>
      block.kind === "heading" ? block.level : null,
    ),
    [2, 2, 3],
  );
});

test("keeps a wrapped list item whole instead of ending the list at the wrap", () => {
  const blocks = parseReleaseNotes(
    [
      "- Direct IPv4 `GET` and `HEAD` checks of every configured endpoint from",
      "  GitHub-hosted runners, every five minutes, with separate response-time",
      "  samples four times a day.",
      "- Incidents recorded as GitHub Issues, opened after confirmed failures",
      "  and closed after confirmed recoveries.",
      "",
      "A paragraph that follows the list and belongs to nothing in it.",
    ].join("\n"),
  );

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["list", "paragraph"],
  );
  assert.equal(blocks[0]?.kind === "list" && blocks[0].items.length, 2);

  const [list] = blocks;
  if (list?.kind !== "list") return;
  const text = (parts: (typeof list.items)[number]): string =>
    parts.map((part) => part.value).join("");
  assert.equal(
    text(list.items[0]!),
    "Direct IPv4 GET and HEAD checks of every configured endpoint from GitHub-hosted runners, every five minutes, with separate response-time samples four times a day.",
  );
  assert.equal(
    text(list.items[1]!),
    "Incidents recorded as GitHub Issues, opened after confirmed failures and closed after confirmed recoveries.",
  );
  // A blank line still ends the list, so what follows is its own paragraph
  // rather than more of the last item.
  assert.equal(blocks[1]?.kind, "paragraph");
});

test("keeps inline emphasis, code, and safe links as separate parts", () => {
  const [block] = parseReleaseNotes(
    "Use **bold**, *italic*, `code`, and [the docs](https://velvet.li/docs).",
  );

  assert.equal(block?.kind, "paragraph");
  if (block?.kind !== "paragraph") return;
  assert.deepEqual(block.content, [
    { kind: "text", value: "Use " },
    { kind: "strong", value: "bold" },
    { kind: "text", value: ", " },
    { kind: "emphasis", value: "italic" },
    { kind: "text", value: ", " },
    { kind: "code", value: "code" },
    { kind: "text", value: ", and " },
    { kind: "link", value: "the docs", href: "https://velvet.li/docs" },
    { kind: "text", value: "." },
  ]);
});

test("never produces markup from embedded HTML", () => {
  const blocks = parseReleaseNotes(
    '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">',
  );

  for (const block of blocks) {
    assert.equal(block.kind, "paragraph");
    if (block.kind !== "paragraph") continue;
    for (const part of block.content) {
      assert.equal(part.kind, "text");
    }
  }
  const rendered = JSON.stringify(blocks);
  assert.equal(rendered.includes('"kind":"link"'), false);
  assert.equal(rendered.includes('"kind":"code"'), false);
});

test("refuses a link that is not plain https", () => {
  for (const source of [
    "[click](javascript:alert(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "[click](http://example.com)",
    "[click](//example.com)",
    "[click](vbscript:msgbox)",
  ]) {
    const [block] = parseReleaseNotes(source);
    assert.equal(block?.kind, "paragraph");
    if (block?.kind !== "paragraph") continue;
    assert.equal(
      block.content.some((part) => part.kind === "link"),
      false,
      `${source} must not become a link`,
    );
    assert.equal(
      block.content.some((part) => part.kind === "text" && part.value.includes("click")),
      true,
      `${source} must still be readable as text`,
    );
  }
});

test("accepts an https link and keeps its exact destination", () => {
  const [block] = parseReleaseNotes("[docs](https://velvet.li/a?b=c#d)");

  assert.equal(block?.kind, "paragraph");
  if (block?.kind !== "paragraph") return;
  assert.deepEqual(block.content, [
    { kind: "link", value: "docs", href: "https://velvet.li/a?b=c#d" },
  ]);
});

test("ignores structure that carries no content", () => {
  assert.deepEqual(parseReleaseNotes(""), []);
  assert.deepEqual(parseReleaseNotes("\n\n   \n\n"), []);
});

test("bounds a hostile document instead of rendering it", () => {
  const blocks = parseReleaseNotes("word\n\n".repeat(5_000));

  assert.equal(blocks.length <= 500, true, "block count stays bounded");
});

test("sizes headings against the text they introduce, not against a fixed scale", async () => {
  // These notes are rendered on two surfaces which set different body sizes.
  // A heading fixed in pixels beside text sized elsewhere ends up smaller than
  // its own paragraphs, which is what happened in the Configurator's overlay.
  const source = await readFile(
    resolve(import.meta.dirname, "../src/components/release-notes/ReleaseNotes.svelte"),
    "utf8",
  );

  const heading = /--notes-heading-size,\s*([^)]+)\)/.exec(source)?.[1]?.trim();
  const subheading = /--notes-subheading-size,\s*([^)]+)\)/.exec(source)?.[1]?.trim();

  assert.match(heading ?? "", /em$/, "the heading fallback is relative");
  assert.match(subheading ?? "", /em$/, "the subheading fallback is relative");
  assert.ok(
    Number.parseFloat(heading ?? "0") > 1,
    `a heading is larger than its paragraphs, got ${heading}`,
  );
  assert.ok(
    Number.parseFloat(subheading ?? "0") > 1,
    `a subheading is larger than its paragraphs, got ${subheading}`,
  );
});

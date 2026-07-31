import assert from "node:assert/strict";
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

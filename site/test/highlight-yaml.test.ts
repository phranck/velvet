import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { tokenizeCode, tokenizeYamlLine } from "../src/lib/highlight-yaml.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");

/** The line as the tokens spell it, which must be the line that went in. */
function rebuild(tokens: { value: string }[]): string {
  return tokens.map((token) => token.value).join("");
}

test("colours a mapping key, its punctuation, and its value", () => {
  assert.deepEqual(tokenizeYamlLine("schemaVersion: 1"), [
    { kind: "key", value: "schemaVersion" },
    { kind: "punctuation", value: ":" },
    { kind: "text", value: " " },
    { kind: "number", value: "1" },
  ]);
});

test("keeps indentation and a list marker apart from what follows", () => {
  assert.deepEqual(tokenizeYamlLine("  - name: Website"), [
    { kind: "text", value: "  " },
    { kind: "punctuation", value: "- " },
    { kind: "key", value: "name" },
    { kind: "punctuation", value: ":" },
    { kind: "text", value: " " },
    { kind: "text", value: "Website" },
  ]);
});

test("reads a quoted scalar whole, hash and all", () => {
  const tokens = tokenizeYamlLine('    canvas: "#0a0b0f"');

  // The hash inside a colour is not the start of a comment, and treating it as
  // one would grey out the rest of every palette line.
  assert.deepEqual(
    tokens.filter((token) => token.kind === "string"),
    [{ kind: "string", value: '"#0a0b0f"' }],
  );
  assert.equal(
    tokens.some((token) => token.kind === "comment"),
    false,
  );
});

test("colours a comment on a line of its own", () => {
  assert.deepEqual(tokenizeYamlLine("  # a note"), [
    { kind: "text", value: "  " },
    { kind: "comment", value: "# a note" },
  ]);
});

test("colours booleans, numbers, and the brackets of a flow sequence", () => {
  const tokens = tokenizeYamlLine("        expectedStatusCodes: [200, 204]");

  assert.deepEqual(
    tokens.filter((token) => token.kind === "number").map((token) => token.value),
    ["200", "204"],
  );
  assert.deepEqual(
    tokenizeYamlLine("    fill: true").at(-1),
    { kind: "boolean", value: "true" },
  );
});

test("colours a command, its options, and where it points", () => {
  assert.deepEqual(tokenizeCode("curl -LO https://velvet.li", "sh"), [
    [
      { kind: "boolean", value: "curl" },
      { kind: "text", value: " " },
      { kind: "key", value: "-LO" },
      { kind: "text", value: " " },
      { kind: "string", value: "https://velvet.li" },
    ],
  ]);
});

test("leaves a language it does not know uncoloured rather than guessing", () => {
  assert.deepEqual(tokenizeCode("a: 1", "rust"), [
    [{ kind: "text", value: "a: 1" }],
  ]);
  assert.deepEqual(tokenizeCode("a: 1", undefined), [
    [{ kind: "text", value: "a: 1" }],
  ]);
});

test("spells every line of the reference back exactly as written", async () => {
  const reference = await readFile(
    resolve(repositoryRoot, "documentation/configuration.md"),
    "utf8",
  );

  // The copy button reads the code back out of the rendered page, so a token
  // that dropped or invented a character would put something in the clipboard
  // that is not what the document says.
  const blocks = [...reference.matchAll(/```yaml\n([\s\S]*?)```/gu)];
  // Enough of them that the loop below is exercising something, rather than an
  // exact count, which would report every addition to the reference as a
  // failure and say nothing about whether the tokeniser is right.
  assert.ok(blocks.length > 10, `the reference has ${blocks.length} yaml blocks`);

  for (const [, code] of blocks) {
    const lines = code!.replace(/\n$/u, "").split("\n");
    const tokenized = tokenizeCode(code!.replace(/\n$/u, ""), "yaml");
    assert.equal(tokenized.length, lines.length);
    tokenized.forEach((tokens, index) => {
      assert.equal(rebuild(tokens), lines[index]);
    });
  }
});

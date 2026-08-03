import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { headingId, splitIntoSections } from "../src/lib/markdown-sections.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("keeps what stands before the first heading apart from the sections", () => {
  const { lead, sections } = splitIntoSections(
    [
      "An opening paragraph that belongs to no topic.",
      "",
      "## First topic",
      "",
      "What the first one says.",
      "",
      "## Second topic",
      "",
      "### A subheading, which does not start a topic",
      "",
      "What the second one says.",
    ].join("\n"),
  );

  assert.equal(lead, "An opening paragraph that belongs to no topic.");
  assert.deepEqual(
    sections.map((section) => section.title),
    ["First topic", "Second topic"],
  );
  assert.equal(sections[0]!.body, "What the first one says.");
  // A level-three heading stays inside the topic it belongs to rather than
  // becoming one of its own, which is what keeps the sidebar scannable.
  assert.match(sections[1]!.body, /^### A subheading/u);
});

test("gives every heading an identifier a link can point at", () => {
  assert.equal(headingId("Services and checks"), "services-and-checks");
  assert.equal(headingId("IPv4 and IPv6"), "ipv4-and-ipv6");
  assert.equal(headingId("Licensing and generated-data policy"), "licensing-and-generated-data-policy");
  // Nothing survives, so it is named rather than left empty, because an empty
  // fragment is a link to the top of the page.
  assert.equal(headingId("!!!"), "section");
});

test("says a document with no heading is all lead", () => {
  const { lead, sections } = splitIntoSections("Just a paragraph.\n");

  assert.equal(lead, "Just a paragraph.");
  assert.deepEqual(sections, []);
});

test("cuts the configuration reference into the topics it actually has", async () => {
  const reference = await readFile(
    resolve(repositoryRoot, "documentation/configuration.md"),
    "utf8",
  );
  const { sections } = splitIntoSections(reference);
  const headings = reference.split("\n").filter((line) => /^## /u.test(line));

  assert.equal(sections.length, headings.length);
  assert.equal(
    new Set(sections.map((section) => section.id)).size,
    sections.length,
    "two topics share an identifier, so one anchor would win both",
  );
  for (const section of sections) {
    assert.equal(section.body.length > 0, true, `${section.title} has no body`);
  }
});

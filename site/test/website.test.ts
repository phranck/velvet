import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { createSvelteRenderer } from "./render-svelte.js";

const websiteSource = resolve(import.meta.dirname, "../src/website/Website.svelte");

/**
 * The Phosphor duotone stylesheet, which is the only authority on whether an
 * icon name exists. Bun hoists workspace dependencies to the repository root
 * when it can, so both locations are tried rather than one being assumed.
 */
function phosphorStylesheetPath(): string {
  const candidates = [
    resolve(import.meta.dirname, "../node_modules/@phosphor-icons/web/src/duotone/style.css"),
    resolve(import.meta.dirname, "../../node_modules/@phosphor-icons/web/src/duotone/style.css"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Phosphor duotone stylesheet not found.");
  return found;
}

test("names only Phosphor icons that actually exist", async () => {
  const source = await readFile(websiteSource, "utf8");
  const stylesheet = await readFile(phosphorStylesheetPath(), "utf8");
  const used = [...source.matchAll(/\bph-[a-z0-9-]+/g)].map(([name]) => name);

  // Without this the page renders an empty box where an icon should be, which
  // is exactly how `ph-activity` reached a review: it matches every plausible
  // naming pattern and simply is not part of the set.
  assert.ok(used.length > 0, "the page uses at least one icon");
  for (const icon of new Set(used)) {
    if (icon === "ph-duotone") continue;
    assert.ok(
      stylesheet.includes(`.${icon}:before`),
      `${icon} is not a Phosphor duotone icon`,
    );
  }
});

test("sends every call to action into the onboarding", async () => {
  const renderer = await createSvelteRenderer();
  try {
    const html = await renderer.render("/src/website/Website.svelte", {});

    const links = [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
    assert.ok(
      links.filter((href) => href === "https://setup.velvet.li/onboarding/").length >= 2,
      "the page offers the setup at the top and again at the end",
    );
    assert.ok(links.includes("https://github.com/phranck/velvet"));
    assert.ok(links.includes("https://layered.work"));
    // Every outbound link leaves in its own tab without handing the opener
    // over, apart from the onboarding, which is the journey this page exists
    // to start and therefore continues in place.
    for (const match of html.matchAll(/<a\b[^>]*href="(https:\/\/(?:github|layered)[^"]*)"[^>]*>/g)) {
      assert.match(match[0], /rel="noopener noreferrer"/, match[1]);
      assert.match(match[0], /target="_blank"/, match[1]);
    }
  } finally {
    await renderer.close();
  }
});

test("describes the product the way the README does", async () => {
  const renderer = await createSvelteRenderer();
  try {
    const html = await renderer.render("/src/website/Website.svelte", {});
    const readme = await readFile(
      resolve(import.meta.dirname, "../../README.md"),
      "utf8",
    );

    // The lead sentence is quoted from the README on purpose, so the public
    // page and the repository cannot end up describing Velvet differently.
    const lead = "Velvet monitors websites and HTTP endpoints from GitHub Actions and";
    assert.ok(readme.includes(lead), "the README still carries the lead sentence");
    assert.ok(html.includes(lead), "the page still carries the lead sentence");
    assert.match(html, /What an installation gives you/);
    assert.match(html, /How it works/);
  } finally {
    await renderer.close();
  }
});

test("binds the published output to velvet.li and publishes nothing into the tree", async () => {
  const cname = await readFile(
    resolve(import.meta.dirname, "../src/website/public/CNAME"),
    "utf8",
  );
  assert.equal(cname.trim(), "velvet.li");

  const viteConfig = await readFile(
    resolve(import.meta.dirname, "../vite.website.ts"),
    "utf8",
  );
  // GitHub Pages serves a directory index, so the entry has to arrive as
  // index.html rather than website.html.
  assert.match(viteConfig, /renameHtmlEntry\("website\.html"\)/);
  assert.match(viteConfig, /outDir: websiteOutDir/);

  // Unlike onboarding/ and configurator/, which the setup service serves out of
  // the repository, this build is uploaded by the workflow. Committing it would
  // put a fourth bundle under the CI artefact check for no reason.
  const ignored = await readFile(
    resolve(import.meta.dirname, "../../.gitignore"),
    "utf8",
  );
  assert.match(ignored, /^site\/dist-website\/$/m);
});

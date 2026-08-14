import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  checkBundle,
  checkFonts,
  checkNoFetching,
  checkSelfContained,
  checkStyleScope,
} from "../src/lib/bundles/isolation.js";
import { parseBundleManifest } from "../src/lib/bundles/manifest.js";
import { readBundles } from "../scripts/bundles.js";

/**
 * The four rules, each exercised by something that breaks it and something that
 * looks like it does but does not.
 *
 * The second half matters as much as the first: a gate that reports `body`
 * inside `.status-body`, or a font host inside a comment explaining why one is
 * forbidden, is a gate somebody turns off.
 */

test("finds a remote stylesheet reference and leaves a local one alone", () => {
  const remote = checkSelfContained({
    path: "bundle.css",
    text: `.page { background: url("https://example.com/paper.png"); }`,
  });
  assert.equal(remote.length, 1);
  assert.match(remote[0]!.detail, /remote reference/);

  const local = checkSelfContained({
    path: "bundle.css",
    text: `.page { background: url("./assets/paper.png"); }
           .other { background: url(assets/paper.png); }
           .inline { background: url("data:image/svg+xml,%3Csvg%3E"); }`,
  });
  assert.deepEqual(local, []);
});

test("finds a path that climbs out of the bundle", () => {
  const violations = checkSelfContained({
    path: "parts/head.ts",
    text: `import { thing } from "../../velvet/parts/head.js";`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /leaves the bundle/);

  // One level up from `parts/` is still inside the bundle.
  assert.deepEqual(
    checkSelfContained({
      path: "parts/head.ts",
      text: `import { thing } from "../uptime.js";`,
    }),
    [],
  );
});

test("lets a type-only import name anything, because nothing is loaded", () => {
  assert.deepEqual(
    checkSelfContained({
      path: "template.ts",
      text: `import type { BundleData } from "../../src/lib/bundles/data.js";`,
    }),
    [],
  );
});

test("allows any part of the foundation, which a theme does not declare", () => {
  assert.deepEqual(
    checkSelfContained({
      path: "script.ts",
      text: `import { createUptimeStrip } from "@velvet/foundation/uptime-strip";`,
    }),
    [],
  );
});

test("refuses a package that only looks like the foundation", () => {
  const violations = checkSelfContained({
    path: "script.ts",
    text: `import { createUptimeStrip } from "@velvet/foundation-extras/uptime-strip";`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /part of the foundation/);
});

test("refuses a bare import that is not the foundation", () => {
  const violations = checkSelfContained({
    path: "script.ts",
    text: `import { chunk } from "lodash";`,
  });
  assert.equal(violations.length, 1);
});

test("refuses a typeface fetched from a font host", () => {
  const violations = checkFonts({
    path: "bundle.css",
    text: `@import url("https://fonts.googleapis.com/css2?family=Barlow");`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /fonts\.googleapis\.com/);
});

test("ignores a font host named in a comment explaining the rule", () => {
  assert.deepEqual(
    checkFonts({
      path: "bundle.css",
      text: `/* Never fetch from fonts.googleapis.com; the faces ship here. */
             @font-face { font-family: Face; src: url("./assets/face.woff2") format("woff2"); }`,
    }),
    [],
  );
});

test("refuses a @font-face whose source leaves the bundle", () => {
  const violations = checkFonts({
    path: "bundle.css",
    text: `@font-face { font-family: Face; src: url("/fonts/face.woff2"); }`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /@font-face source/);
});

test("refuses selectors that reach the document, and !important", () => {
  const violations = checkStyleScope({
    path: "bundle.css",
    text: `html { background: #000; }
           body { margin: 0; }
           * { box-sizing: border-box; }
           :root { --x: 1px; }
           .page { color: red !important; }`,
  });
  const details = violations.map((violation) => violation.detail).join("\n");
  assert.match(details, /"html"/);
  assert.match(details, /"body"/);
  assert.match(details, /"\*"/);
  assert.match(details, /":root"/);
  assert.match(details, /!important/);
  assert.equal(violations.length, 5);
});

test("leaves a class that merely contains the word body alone", () => {
  assert.deepEqual(
    checkStyleScope({
      path: "bundle.css",
      text: `.status-body { margin: 0; }
             .page *, .page *::before { box-sizing: inherit; }
             @media (width < 480px) { .page { padding: 8px; } }`,
    }),
    [],
  );
});

test("refuses a bundle that opens a connection of its own", () => {
  for (const source of [
    `const data = await fetch("./status.json");`,
    `const socket = new WebSocket("wss://example.com");`,
    `new EventSource("./events");`,
    `navigator.sendBeacon("/collect", body);`,
  ]) {
    const violations = checkNoFetching({ path: "script.ts", text: source });
    assert.equal(violations.length >= 1, true, source);
  }
  assert.deepEqual(
    checkNoFetching({
      path: "script.ts",
      text: `// The host fetches; this never calls fetch().\nexport function enhance() {}`,
    }),
    [],
  );
});

test("refuses a manifest that names a file the bundle does not contain", () => {
  const parsed = parseBundleManifest({
    id: "ghost",
    name: "Ghost",
    description: "Names a stylesheet nobody wrote.",
    version: "1.0.0",
    dataVersion: 1,
    entries: {
      template: "template.ts",
      styles: "bundle.css",
      script: "script.ts",
    },
    layouts: ["grouped"],
    readings: "panel",
    preview: "assets/preview.svg",
    plugins: [],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const violations = checkBundle({
    manifest: parsed.manifest,
    directory: "ghost",
    files: [
      { path: "bundle.json", text: "{}" },
      { path: "template.ts", text: "" },
      { path: "script.ts", text: "" },
      { path: "assets/preview.svg", text: "" },
    ],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /bundle\.css/);
});

test("refuses a manifest whose id does not match its directory", () => {
  const parsed = parseBundleManifest({
    id: "proof",
    name: "Proof",
    description: "A design.",
    version: "1.0.0",
    dataVersion: 1,
    entries: {
      template: "template.ts",
      styles: "bundle.css",
      script: "script.ts",
    },
    layouts: ["grouped"],
    readings: "panel",
    preview: "assets/preview.svg",
    plugins: [],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const violations = checkBundle({
    manifest: parsed.manifest,
    directory: "somewhere-else",
    files: [
      { path: "bundle.json", text: "{}" },
      { path: "template.ts", text: "" },
      { path: "bundle.css", text: "" },
      { path: "script.ts", text: "" },
      { path: "assets/preview.svg", text: "" },
    ],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /does not match the directory/);
});

test("every bundle in the repository passes all four rules", async () => {
  const bundles = await readBundles();
  assert.equal(bundles.length > 0, true, "there should be at least one bundle");
  for (const bundle of bundles) {
    assert.deepEqual(
      bundle.manifestErrors,
      [],
      `${bundle.directory} has a manifest fault`,
    );
    assert.notEqual(bundle.manifest, null);
    if (!bundle.manifest) continue;
    const violations = checkBundle({
      manifest: bundle.manifest,
      directory: bundle.directory,
      files: bundle.files,
    });
    assert.deepEqual(
      violations.map((violation) => `${violation.file}: ${violation.detail}`),
      [],
      `${bundle.directory} breaks an isolation rule`,
    );
  }
});

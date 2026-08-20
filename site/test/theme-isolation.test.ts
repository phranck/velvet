import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  checkTheme,
  checkFonts,
  checkNoFetching,
  checkSelfContained,
  checkStyleScope,
} from "../src/lib/themes/isolation.js";
import { parseThemeManifest } from "../src/lib/themes/manifest.js";
import { readThemes } from "../scripts/themes.js";

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
    path: "theme.css",
    text: `.page { background: url("https://example.com/paper.png"); }`,
  });
  assert.equal(remote.length, 1);
  assert.match(remote[0]!.detail, /remote reference/);

  const local = checkSelfContained({
    path: "theme.css",
    text: `.page { background: url("./assets/paper.png"); }
           .other { background: url(assets/paper.png); }
           .inline { background: url("data:image/svg+xml,%3Csvg%3E"); }`,
  });
  assert.deepEqual(local, []);
});

test("finds a path that climbs out of the theme", () => {
  const violations = checkSelfContained({
    path: "parts/head.ts",
    text: `import { thing } from "../../velvet/parts/head.js";`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /leaves the theme/);

  // One level up from `parts/` is still inside the theme.
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
      text: `import type { ThemeData } from "../../src/lib/themes/data.js";`,
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
    path: "theme.css",
    text: `@import url("https://fonts.googleapis.com/css2?family=Barlow");`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /fonts\.googleapis\.com/);
});

test("ignores a font host named in a comment explaining the rule", () => {
  assert.deepEqual(
    checkFonts({
      path: "theme.css",
      text: `/* Never fetch from fonts.googleapis.com; the faces ship here. */
             @font-face { font-family: Face; src: url("./assets/face.woff2") format("woff2"); }`,
    }),
    [],
  );
});

test("refuses a @font-face whose source leaves the theme", () => {
  const violations = checkFonts({
    path: "theme.css",
    text: `@font-face { font-family: Face; src: url("/fonts/face.woff2"); }`,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /@font-face source/);
});

test("refuses selectors that reach the document, and !important", () => {
  const violations = checkStyleScope({
    path: "theme.css",
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
      path: "theme.css",
      text: `.status-body { margin: 0; }
             .page *, .page *::before { box-sizing: inherit; }
             @media (width < 480px) { .page { padding: 8px; } }`,
    }),
    [],
  );
});

test("refuses a theme that opens a connection of its own", () => {
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

test("refuses a manifest that names a file the theme does not contain", () => {
  const parsed = parseThemeManifest(
    {
      name: "Ghost",
      description: "Names a stylesheet nobody wrote.",
      version: "1.0.0",
      order: 1,
      state: "offered",
      dataVersion: 1,
      root: ".proof-page",
      entries: {
        template: "template.ts",
        styles: "theme.css",
        script: "script.ts",
      },
      layouts: ["grouped"],
      readings: "panel",
      card: {
        backgroundStart: "#0a0b0f",
        backgroundEnd: "#0a0b0f",
        surface: "#141518",
        operational: "#4ade80",
        degraded: "#facc15",
        outage: "#f87171",
        noData: "#222326",
        ipv4: "#60a5fa",
        ipv6: "#c084fc",
        textPrimary: "#f8fafc",
        textSecondary: "#cbd5e1",
        textTertiary: "#94a3b8",
        clouds: false,
      },
    },
    "ghost",
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const violations = checkTheme({
    manifest: parsed.manifest,
    directory: "ghost",
    files: [
      { path: "velvet-theme.toml", text: "" },
      { path: "template.ts", text: "" },
      { path: "script.ts", text: "" },
    ],
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!.detail, /theme\.css/);
});

test("every theme in the repository passes all four rules", async () => {
  const themes = await readThemes();
  assert.equal(themes.length > 0, true, "there should be at least one theme");
  for (const theme of themes) {
    assert.deepEqual(
      theme.manifestErrors,
      [],
      `${theme.directory} has a manifest fault`,
    );
    assert.notEqual(theme.manifest, null);
    if (!theme.manifest) continue;
    const violations = checkTheme({
      manifest: theme.manifest,
      directory: theme.directory,
      files: theme.files,
    });
    assert.deepEqual(
      violations.map((violation) => `${violation.file}: ${violation.detail}`),
      [],
      `${theme.directory} breaks an isolation rule`,
    );
  }
});

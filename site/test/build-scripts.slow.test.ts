import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "bun:test";

const execFileAsync = promisify(execFile);
/**
 * A production Vite build legitimately takes several seconds, and longer on a
 * shared runner. Bun's default of five seconds left no margin at all: the same
 * build measured 4.26s locally, so any slower machine failed the test for
 * being slow rather than for being wrong.
 */
const BUILD_TIMEOUT_MS = 120_000;
const repositoryRoot = resolve(import.meta.dirname, "../..");
const siteRoot = resolve(repositoryRoot, "site");

/**
 * Runs a build and captures all of its output.
 *
 * The buffer is raised well above Node's one megabyte default because a build
 * writes one line per chunk when it has no terminal attached, as on CI, and a
 * full buffer stalls the child process instead of failing it. That presents as
 * a test which hangs until its timeout rather than one that reports an error.
 */
async function bun(arguments_: string[], cwd = siteRoot) {
  return execFileAsync(process.execPath, arguments_, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Creates a throwaway output directory for one build.
 *
 * These tests verify what a build produces, not where the repository keeps it.
 * Building into the versioned artefact directories left a dirty tree after
 * every test run, with output that differed from what the build scripts
 * produce, so a contributor could commit a bundle no build step made.
 */
async function buildDirectory(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), "velvet-tool-build-"));
}

// Every build passes --emptyOutDir because the directory sits outside the
// project root, where Vite otherwise asks for confirmation before clearing it.
// With no terminal attached, as on CI, that prompt never gets an answer and the
// build waits indefinitely.

async function fixture(path: string): Promise<string> {
  return readFile(
    resolve(repositoryRoot, "packages/contracts/fixtures/valid", path),
    "utf8",
  );
}

test("builds the standalone configurator at the repository root", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.configurator.ts",
    "--outDir", outDir,
    "--emptyOutDir",
  ]);

  const html = await readFile(resolve(outDir, "index.html"), "utf8");
  assert.match(html, /<title>Velvet Configurator<\/title>/);
  assert.match(html, /Velvet Configurator/);
  assert.match(html, /<script[^>]+src="\.\/assets\/[^"]+\.js"/);
  assert.match(html, /<link[^>]+href="\.\/assets\/[^"]+\.css"/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
}, BUILD_TIMEOUT_MS);

test("builds the standalone onboarding at the repository root", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.onboarding.ts",
    "--outDir", outDir,
    "--emptyOutDir",
  ]);

  const html = await readFile(resolve(outDir, "index.html"), "utf8");
  assert.match(html, /<title>Set up Velvet<\/title>/);
  assert.match(html, /Set up Velvet/);
  assert.match(html, /<script[^>]+src="\.\/assets\/[^"]+\.js"/);
  assert.match(html, /<link[^>]+href="\.\/assets\/[^"]+\.css"/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
}, BUILD_TIMEOUT_MS);

test("builds status-page assets relative to the deployed Pages path", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--outDir", outDir,
    "--emptyOutDir",
  ]);

  const html = await readFile(resolve(outDir, "index.html"), "utf8");
  assert.match(html, /src="\.\/assets\//);
  assert.match(html, /href="\.\/assets\//);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:assets\/|favicon\.ico)/);
}, BUILD_TIMEOUT_MS);

test("pins the deterministic screenshot browser to UTC", async () => {
  const screenshot = await readFile(
    resolve(siteRoot, "scripts/screenshot.mjs"),
    "utf8",
  );

  assert.match(screenshot, /clock\.setFixedTime/);
  assert.match(screenshot, /timezoneId:\s*"UTC"/);

  const themeScreenshots = await readFile(
    resolve(siteRoot, "scripts/system-theme-screenshots.mjs"),
    "utf8",
  );
  assert.match(themeScreenshots, /clock\.setFixedTime/);
  assert.match(themeScreenshots, /timezoneId:\s*"UTC"/);
  assert.match(themeScreenshots, /EMBEDDED_THEME_REGISTRY/);
});

test("generated runtime config points to Velvet repository data", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-"));
  const input = resolve(directory, ".upptimerc.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    "owner: example\nrepo: status\nstatus-website:\n  velvet:\n    dataBranch: production\n    showSubscribe: false\n",
  );

  await bun([
    resolve(siteRoot, "scripts/generate-config.mjs"),
    input,
    output,
    "snapshots/velvet-data/v1",
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(
    config.dataBaseUrl,
    "https://raw.githubusercontent.com/example/status/production/snapshots/velvet-data/v1",
  );
  assert.equal("showSubscribe" in config, false);
});

test("generated runtime config accepts native Velvet configuration", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-native-config-"));
  const input = resolve(directory, "velvet.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    [
      "schemaVersion: 1",
      "repository:",
      "  owner: example",
      "  name: status",
      "statusPage:",
      "  name: Example Status",
      "services:",
      "  - name: Website",
      "    url: https://example.com",
      "",
    ].join("\n"),
  );

  await bun([
    resolve(siteRoot, "scripts/generate-config.mjs"),
    input,
    output,
    ".velvet-data/velvet-data/v1",
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.owner, "example");
  assert.equal(config.repo, "status");
  assert.equal(config.name, "Example Status");
  assert.equal(config.dataBranch, "velvet-data");
  assert.equal(
    config.dataBaseUrl,
    "https://raw.githubusercontent.com/example/status/velvet-data/velvet-data/v1",
  );
});

test("generated runtime config preserves native appearance and custom domain", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-native-page-"));
  const input = resolve(directory, "velvet.yml");
  const output = resolve(directory, "public/config.json");
  await writeFile(
    input,
    [
      "schemaVersion: 1",
      "repository:",
      "  owner: example",
      "  name: status",
      "statusPage:",
      "  name: Example Status",
      "  customDomain: status.example.com",
      "  logoUrl: https://example.com/logo.svg",
      "  logoHeight: 64",
      "  showPoweredBy: false",
      "  layout: cards",
      "  defaultRange: 90d",
      "  navigation:",
      "    - title: History",
      "      href: /history",
      "  theme:",
      "    name: Native Theme",
      "    palette:",
      "      canvas: '#101010'",
      "      foreground: '#f0f0f0'",
      "      accent: '#16a34a'",
      "      alternate: '#38bdf8'",
      "      warning: '#d29922'",
      "      danger: '#f85149'",
      "    grid:",
      "      operational: accent",
      "      degraded: warning",
      "      outage: danger",
      "    chart:",
      "      line: alternate",
      "      lineStyle: dotted",
      "      fill: true",
      "      background: canvas",
      "      backgroundOpacity: 0.2",
      "  fonts:",
      "    sans: Example Sans",
      "    mono: Example Mono",
      "  icons:",
      "    website: ph-globe",
      "  analytics:",
      "    umami:",
      "      websiteId: 12345678-1234-1234-1234-123456789abc",
      "      src: https://analytics.example.com/script.js",
      "    googleAnalytics: G-ABC123",
      "  seo:",
      "    title: Example System Status",
      "    description: Current availability for Example.",
      "    image: https://example.com/status.png",
      "services:",
      "  - name: Website",
      "    url: https://example.com",
      "",
    ].join("\n"),
  );

  await bun([
    resolve(siteRoot, "scripts/generate-config.mjs"),
    input,
    output,
    ".velvet-data/velvet-data/v1",
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.url, "https://status.example.com/");
  assert.equal(config.logoUrl, "https://example.com/logo.svg");
  assert.equal(config.logoHeight, 64);
  assert.equal(config.showPoweredBy, false);
  assert.equal(config.layout, "cards");
  assert.equal(config.defaultRange, "quarter");
  assert.deepEqual(config.navbar, [{ title: "History", href: "/history" }]);
  assert.equal(config.theme.name, "Native Theme");
  assert.equal(config.theme.palette.accent, "#16a34a");
  assert.equal(config.theme.grid.operational, "#16a34a");
  assert.equal(config.theme.protocol.ipv4, "#38bdf8");
  assert.equal(config.theme.chart.ipv4LineStyle, "dotted");
  assert.equal(config.theme.chart.fill, true);
  assert.equal(config.theme.chart.background, "#101010");
  assert.equal(config.theme.chart.backgroundOpacity, 0.2);
  assert.equal(config.theme.fontSans, "Example Sans");
  assert.equal(config.theme.fontMono, "Example Mono");
  assert.deepEqual(config.icons, { website: "ph-globe" });
  assert.deepEqual(config.umami, {
    websiteId: "12345678-1234-1234-1234-123456789abc",
    src: "https://analytics.example.com/script.js",
  });
  assert.equal(config.googleAnalytics, "G-ABC123");
  assert.deepEqual(config.seo, {
    title: "Example System Status",
    description: "Current availability for Example.",
    image: "https://example.com/status.png",
  });
  assert.equal(await readFile(resolve(directory, "public/CNAME"), "utf8"), "status.example.com\n");
});

test("invalid native configuration stops before writing runtime config", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-invalid-native-"));
  const input = resolve(directory, "velvet.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    [
      "schemaVersion: 1",
      "repository:",
      "  owner: example",
      "  name: status",
      "statusPage:",
      "  name: Example Status",
      "services:",
      "  - name: Website",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    bun([
      resolve(siteRoot, "scripts/generate-config.mjs"),
      input,
      output,
    ]),
    (error: Error & { stderr?: string }) => {
      assert.match(
        error.stderr ?? "",
        /Invalid velvet\.yml:\nINVALID_SERVICE_CHECKS at \/services\/0: A service must set either url or checks, but not both\./,
      );
      return true;
    },
  );
  await assert.rejects(
    readFile(output, "utf8"),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
});

test("generated runtime config preserves an explicit public data URL", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-url-"));
  const input = resolve(directory, ".upptimerc.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    "owner: example\nrepo: status\nstatus-website:\n  velvet:\n    dataBaseUrl: https://cdn.example/velvet/v1/\n",
  );

  await bun([
    resolve(siteRoot, "scripts/generate-config.mjs"),
    input,
    output,
    "snapshots/velvet-data/v1",
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.dataBaseUrl, "https://cdn.example/velvet/v1");
});

test("generated runtime config resolves the semantic Velvet theme", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-theme-"));
  const input = resolve(directory, ".upptimerc.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    [
      "owner: example",
      "repo: status",
      "status-website:",
      "  velvet:",
      "    accentDeg: '#aabbcc'",
      "    fontSans: Example Sans",
      "    theme:",
      "      name: Cloudy Autumn",
      "      palette:",
      "        canvas: '#090909'",
      "        foreground: '#f5f5f5'",
      "        accent: '#123456'",
      "        alternate: '#fedcba'",
      "        warning: '#d29922'",
      "        danger: '#f85149'",
      "      grid:",
      "        operational: '#abcdef'",
      "      protocol:",
      "        ipv4: accent",
      "        ipv6: alternate",
      "      chart:",
      "        ipv4LineStyle: dotted",
      "        ipv6LineStyle: solid",
      "        fill: true",
      "      background:",
      "        blobs:",
      "          count: 4",
      "          colors:",
      "            - '#111111'",
      "            - '#222222'",
      "      card:",
      "        borderEnabled: false",
      "        radius: 20",
      "        padding: 18",
      "      headline:",
      "        start: foreground",
      "        end: alternate",
      "",
    ].join("\n"),
  );

  await bun([
    resolve(siteRoot, "scripts/generate-config.mjs"),
    input,
    output,
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.theme.name, "Cloudy Autumn");
  assert.equal(config.theme.accent, "#123456");
  assert.equal(config.theme.grid.operational, "#abcdef");
  assert.equal(config.theme.grid.degraded, "#aabbcc");
  assert.equal(config.theme.protocol.ipv4, "#123456");
  assert.equal(config.theme.protocol.ipv6, "#fedcba");
  assert.deepEqual(config.theme.chart, {
    ipv4LineStyle: "dotted",
    ipv6LineStyle: "solid",
    fill: true,
    background: "#090909",
    backgroundOpacity: 0,
  });
  assert.equal(config.theme.background.blobs.count, 4);
  assert.deepEqual(config.theme.background.blobs.colors, ["#111111", "#222222"]);
  assert.equal(config.theme.card.borderEnabled, false);
  assert.equal(config.theme.card.radius, 20);
  assert.equal(config.theme.card.padding, 18);
  assert.deepEqual(config.theme.headline, {
    start: "#f5f5f5",
    end: "#fedcba",
  });
  assert.equal(config.theme.fontSans, "Example Sans");
});

test("social card uses the semantic Velvet theme", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-og-theme-"));
  const statusPath = resolve(directory, "status.json");
  const defaultConfigPath = resolve(directory, "default-config.json");
  const customConfigPath = resolve(directory, "custom-config.json");
  const defaultOutput = resolve(directory, "default.png");
  const customOutput = resolve(directory, "custom.png");
  await writeFile(statusPath, await fixture("status/dual-stack.json"));
  await writeFile(
    defaultConfigPath,
    JSON.stringify({ owner: "example", repo: "status", name: "Example" }),
  );
  await writeFile(
    customConfigPath,
    JSON.stringify({
      owner: "example",
      repo: "status",
      name: "Example",
      theme: {
        grid: { operational: "#00ff00" },
        background: { start: "#ffffff", end: "#eeeeee" },
        card: {
          background: "#dddddd",
          border: "#cccccc",
          borderEnabled: false,
        },
        text: {
          primary: "#111111",
          secondary: "#222222",
          tertiary: "#333333",
        },
      },
    }),
  );

  for (const [configPath, output] of [
    [defaultConfigPath, defaultOutput],
    [customConfigPath, customOutput],
  ]) {
    await bun([
      resolve(siteRoot, "scripts/generate-og.ts"),
      configPath,
      statusPath,
      output,
    ]);
  }

  assert.notDeepEqual(
    await readFile(customOutput),
    await readFile(defaultOutput),
  );
});

test("social card and SEO consume validated Velvet documents", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-build-"));
  const configPath = resolve(directory, "config.json");
  const statusPath = resolve(directory, "status.json");
  const ogPath = resolve(directory, "og.png");
  const distPath = resolve(directory, "dist");

  await writeFile(
    configPath,
    JSON.stringify({
      owner: "example",
      repo: "status",
      name: "Example",
      url: "https://status.example/",
      defaultRange: "month",
    }),
  );
  await writeFile(statusPath, await fixture("status/dual-stack.json"));
  await writeFile(
    resolve(directory, "index.html"),
    '<!doctype html><html><head><title>Status</title><meta name="description" content="Status"></head><body></body></html>',
  );
  await mkdir(distPath);
  await writeFile(
    resolve(distPath, "index.html"),
    await readFile(resolve(directory, "index.html")),
  );

  const { stdout: ogOutput } = await bun([
    resolve(siteRoot, "scripts/generate-og.ts"),
    configPath,
    statusPath,
    ogPath,
  ]);
  await bun([
    resolve(siteRoot, "scripts/generate-seo.ts"),
    configPath,
    statusPath,
    distPath,
  ]);

  const html = await readFile(resolve(distPath, "index.html"), "utf8");
  assert.match(ogOutput, /status: operational/);
  assert.match(html, /All systems operational\. Live status and uptime history for Example\./);
  assert.ok((await readFile(ogPath)).length > 0);
});

test("removes Atom feed generation from the status-page build", async () => {
  const action = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");
  const html = await readFile(resolve(siteRoot, "index.html"), "utf8");

  assert.doesNotMatch(action, /generate-feed|incidents\.atom/);
  assert.doesNotMatch(html, /application\/atom\+xml|incidents\.atom/);
  await assert.rejects(
    readFile(resolve(siteRoot, "scripts/generate-feed.mjs"), "utf8"),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
});

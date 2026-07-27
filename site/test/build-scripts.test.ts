import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const siteRoot = resolve(repositoryRoot, "site");
const tsx = resolve(repositoryRoot, "node_modules/.bin/tsx");

async function fixture(path: string): Promise<string> {
  return readFile(
    resolve(repositoryRoot, "packages/contracts/fixtures/valid", path),
    "utf8",
  );
}

test("generated runtime config points to Velvet repository data", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-"));
  const input = resolve(directory, ".upptimerc.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    "owner: example\nrepo: status\nstatus-website:\n  velvet:\n    dataBranch: production\n",
  );

  await execFileAsync("node", [
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
});

test("generated runtime config preserves an explicit public data URL", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-url-"));
  const input = resolve(directory, ".upptimerc.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    "owner: example\nrepo: status\nstatus-website:\n  velvet:\n    dataBaseUrl: https://cdn.example/velvet/v1/\n",
  );

  await execFileAsync("node", [
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
      "      accent: '#123456'",
      "      grid:",
      "        operational: '#abcdef'",
      "      protocol:",
      "        ipv6: '#fedcba'",
      "      background:",
      "        blobs:",
      "          count: 4",
      "          colors:",
      "            - '#111111'",
      "            - '#222222'",
      "      card:",
      "        borderEnabled: false",
      "",
    ].join("\n"),
  );

  await execFileAsync("node", [
    resolve(siteRoot, "scripts/generate-config.mjs"),
    input,
    output,
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.theme.accent, "#123456");
  assert.equal(config.theme.grid.operational, "#abcdef");
  assert.equal(config.theme.grid.degraded, "#aabbcc");
  assert.equal(config.theme.protocol.ipv4, "#385471");
  assert.equal(config.theme.protocol.ipv6, "#fedcba");
  assert.equal(config.theme.background.blobs.count, 4);
  assert.deepEqual(config.theme.background.blobs.colors, ["#111111", "#222222"]);
  assert.equal(config.theme.card.borderEnabled, false);
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
    await execFileAsync(tsx, [
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

test("feed, social card, and SEO consume validated Velvet documents", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-build-"));
  const configPath = resolve(directory, "config.json");
  const statusPath = resolve(directory, "status.json");
  const incidentsPath = resolve(directory, "incidents.json");
  const feedPath = resolve(directory, "incidents.atom");
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
  await writeFile(incidentsPath, await fixture("incidents/maintenance.json"));
  await writeFile(
    resolve(directory, "index.html"),
    '<!doctype html><html><head><title>Status</title><meta name="description" content="Status"></head><body></body></html>',
  );
  await mkdir(distPath);
  await writeFile(
    resolve(distPath, "index.html"),
    await readFile(resolve(directory, "index.html")),
  );

  await execFileAsync("node", [
    resolve(siteRoot, "scripts/generate-feed.mjs"),
    configPath,
    incidentsPath,
    feedPath,
  ]);
  const { stdout: ogOutput } = await execFileAsync(tsx, [
    resolve(siteRoot, "scripts/generate-og.ts"),
    configPath,
    statusPath,
    ogPath,
  ]);
  await execFileAsync(tsx, [
    resolve(siteRoot, "scripts/generate-seo.ts"),
    configPath,
    statusPath,
    distPath,
  ]);

  const feed = await readFile(feedPath, "utf8");
  const html = await readFile(resolve(distPath, "index.html"), "utf8");
  assert.match(feed, /Maintenance · Scheduled: Database maintenance/);
  assert.match(feed, /<updated>2026-07-27T12:00:00.000Z<\/updated>/);
  assert.match(ogOutput, /status: operational/);
  assert.match(html, /All systems operational\. Live status and uptime history for Example\./);
  assert.ok((await readFile(ogPath)).length > 0);
});

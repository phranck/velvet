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
const vite = resolve(repositoryRoot, "node_modules/.bin/vite");

async function fixture(path: string): Promise<string> {
  return readFile(
    resolve(repositoryRoot, "packages/contracts/fixtures/valid", path),
    "utf8",
  );
}

test("builds the standalone configurator at the repository root", async () => {
  await execFileAsync(vite, ["build", "--config", "vite.configurator.ts"], {
    cwd: siteRoot,
  });

  const html = await readFile(
    resolve(repositoryRoot, "configurator/index.html"),
    "utf8",
  );
  assert.match(html, /<title>Velvet Configurator<\/title>/);
  assert.match(html, /Velvet Configurator/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});

test("builds status-page assets relative to the deployed Pages path", async () => {
  await execFileAsync(vite, ["build"], { cwd: siteRoot });

  const html = await readFile(resolve(siteRoot, "dist/index.html"), "utf8");
  assert.match(html, /src="\.\/assets\//);
  assert.match(html, /href="\.\/assets\//);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:assets\/|favicon\.ico)/);
});

test("generated runtime config points to Velvet repository data", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-"));
  const input = resolve(directory, ".upptimerc.yml");
  const output = resolve(directory, "config.json");
  await writeFile(
    input,
    "owner: example\nrepo: status\nstatus-website:\n  velvet:\n    dataBranch: production\n    showSubscribe: false\n",
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
  assert.equal("showSubscribe" in config, false);
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

  await execFileAsync("node", [
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

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
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

test("publishes the start page as static HTML that loads no script", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.website.ts",
    "--outDir", outDir,
    "--emptyOutDir",
  ]);

  const html = await readFile(resolve(outDir, "index.html"), "utf8");
  // The title says what Velvet is, not just what it is called. Clients that
  // show a large preview image, iMessage among them, print the title and the
  // host and drop the description entirely, so the one word on its own told a
  // reader nothing.
  assert.match(html, /<title>Velvet, GitHub-native status pages<\/title>/);
  // The page's own words, which only appear once it has been rendered. Without
  // the prerender the body is an empty mount point and a reader without
  // JavaScript, or a crawler that does not run it, receives nothing.
  assert.match(html, /GitHub-native status monitoring/);
  assert.match(html, /What an installation gives you/);
  assert.match(html, /href="https:\/\/setup\.velvet\.li\/onboarding\/"/);
  // No bundle. The page carries two script elements and neither is one: the
  // structured-data block, which a search engine reads rather than a browser
  // runs, and the small inline script every prerendered page carries to wire
  // its copy buttons.
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/);
  assert.match(html, /data-copy-code/);
  // The references page is built alongside this one and deliberately keeps its
  // script, because it reads the list of installations when a visitor opens it.
  // JavaScript therefore exists in the output, including chunks the two pages
  // share, and what matters is that this page loads none of it.
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+rel="modulepreload"/);

  // Svelte scopes styles by hashing them, and the markup is rendered in a
  // separate pass from the stylesheet. Identical hashes are what makes that
  // safe, and a mismatch would produce an unstyled page rather than an error,
  // so it is checked rather than assumed.
  const stylesheetName = (await readdir(resolve(outDir, "assets"))).find(
    (entry) => entry.endsWith(".css"),
  );
  assert.ok(stylesheetName, "the build emits a stylesheet");
  const stylesheet = await readFile(
    resolve(outDir, "assets", stylesheetName),
    "utf8",
  );
  const scopedClasses = new Set(html.match(/svelte-[a-z0-9]+/g) ?? []);
  assert.ok(scopedClasses.size > 0, "the markup carries scoped classes");
  for (const scopedClass of scopedClasses) {
    assert.ok(
      stylesheet.includes(`.${scopedClass}`),
      `${scopedClass} is missing from the stylesheet`,
    );
  }

  // The render resolves imported assets the way a dev server would, so a
  // failure here means the published page points at the build machine. That
  // happens in two shapes: an asset outside the Vite root arrives as `/@fs/`
  // and an absolute path, and one inside it as a path under `/src/`. The second
  // shipped unnoticed until the theme previews became the first in-root asset
  // the prerendered page imports.
  assert.doesNotMatch(html, /\/@fs\//);
  assert.doesNotMatch(html, /["'](\/src\/[^"']+)["']/);
  assert.match(html, /src="\.\/assets\/screenshot-[^"]+\.png"/);

  // One preview per system theme, each pointing at the copy this build emitted.
  const themePreviews = [
    "velvet-default",
    "cloudy-autumn",
    "sunny-spring",
    "violet-velvet",
  ];
  for (const theme of themePreviews) {
    assert.match(
      html,
      new RegExp(`src="\\./assets/${theme}-[^"]+\\.png"`),
      `the page does not show the ${theme} preview from this build`,
    );
  }
}, BUILD_TIMEOUT_MS);

test("gives the website everything a search engine and a social platform read", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.website.ts",
    "--outDir", outDir,
    "--emptyOutDir",
  ]);

  const html = await readFile(resolve(outDir, "index.html"), "utf8");
  assert.match(html, /<link rel="canonical" href="https:\/\/velvet\.li\/" \/>/);
  // The site is named Velvet whatever a given page is titled, so this one stays
  // the bare mark.
  assert.match(html, /<meta property="og:site_name" content="Velvet" \/>/);
  // Both titles track the document title, since a preview that disagrees with
  // the tab is a preview somebody forgot to update.
  for (const property of ['property="og:title"', 'name="twitter:title"']) {
    assert.match(
      html,
      new RegExp(`<meta ${property} content="Velvet, GitHub-native status pages" />`),
    );
  }
  assert.match(html, /<meta property="og:locale"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/velvet\.li\/og\.png" \/>/);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
  // Matched on the attribute rather than the whole tag, since a long content
  // value is wrapped across lines in the source and stays that way.
  assert.match(html, /property="og:image:alt"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/velvet\.li\/og\.png" \/>/);

  // A platform fetching og:image against a URL that 404s renders the link bare,
  // which is the failure this pairing exists to prevent.
  const published = await readdir(outDir);
  assert.ok(published.includes("og.png"), "the social card is published");
  assert.ok(published.includes("robots.txt"), "robots.txt is published");
  assert.ok(published.includes("sitemap.xml"), "sitemap.xml is published");

  const sitemap = await readFile(resolve(outDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/velvet\.li\/<\/loc>/);
  const robots = await readFile(resolve(outDir, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: https:\/\/velvet\.li\/sitemap\.xml$/m);

  // Parsed rather than pattern-matched, because malformed JSON-LD is silently
  // ignored by every consumer and would look identical to none at all.
  const structuredData = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  assert.ok(structuredData, "the page carries structured data");
  const graph = JSON.parse(structuredData[1]);
  assert.equal(graph["@context"], "https://schema.org");
  const types = graph["@graph"].map((entry: { "@type": string }) => entry["@type"]);
  assert.deepEqual(types, ["WebSite", "Organization", "SoftwareApplication"]);
  const application = graph["@graph"][2];
  assert.equal(application.license, "https://layered.mit-license.org");
  assert.equal(application.codeRepository, "https://github.com/phranck/velvet");

  // The faces are declared `font-display: optional`, which means a file that
  // does not arrive in the browser's short window is not used for that load at
  // all. Preloading is therefore what decides whether a reader sees Barlow or
  // the metric-matched stand-in, rather than only how soon. All four are
  // listed, the heading face included: under the previous `swap` a late file
  // still arrived and swapped, so preloading it bought nothing and this test
  // recorded that.
  const preloaded = [
    ...html.matchAll(/<link rel="preload" as="font"[^>]*href="\.\/assets\/([^"]+)"/g),
  ].map(([, file]) => file);
  // Matched on the prefix, because the build appends a hash that may itself
  // contain a hyphen, so splitting the name apart is not reliable.
  for (const face of [
    "plaster-latin-400-normal-",
    "barlow-latin-400-normal-",
    "barlow-latin-600-normal-",
    "barlow-condensed-latin-600-normal-",
  ]) {
    assert.ok(
      preloaded.some((file) => file.startsWith(face)),
      `${face} is not preloaded`,
    );
  }
  assert.equal(preloaded.length, 4, "only the faces the page is set in are preloaded");

  const emitted = await readdir(resolve(outDir, "assets"));
  for (const file of preloaded) {
    assert.ok(emitted.includes(file), `${file} is preloaded but not published`);
  }
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

test("a configuration Velvet does not define is refused, not translated", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-foreign-config-"));
  const input = resolve(directory, "velvet.yml");
  const output = resolve(directory, "config.json");
  // The shape another status-page generator uses. Velvet reads one format and
  // refuses anything else rather than guessing at a translation.
  await writeFile(
    input,
    "owner: example\nrepo: status\nstatus-website:\n  velvet:\n    dataBranch: production\n",
  );

  await assert.rejects(
    bun([resolve(siteRoot, "scripts/generate-config.mjs"), input, output]),
    (error: Error & { stderr?: string }) => {
      assert.match(error.stderr ?? "", /Invalid velvet\.yml/u);
      return true;
    },
  );
  await assert.rejects(
    readFile(output, "utf8"),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
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
  // Velvet offers no analytics, so a generated page's configuration carries no
  // trace of any. Asserted rather than assumed, because the fields it used to
  // carry were written by the generator and would come back unnoticed.
  assert.equal("umami" in config, false);
  assert.equal("googleAnalytics" in config, false);
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

test("generated runtime config resolves the semantic Velvet theme", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-config-theme-"));
  const input = resolve(directory, "velvet.yml");
  const output = resolve(directory, "config.json");
  // The parts of a theme no other test reaches: the backdrop blobs, the card
  // geometry, and the headline gradient, each of which names palette entries
  // rather than colours and has to come out resolved.
  await writeFile(
    input,
    [
      "schemaVersion: 1",
      "repository:",
      "  owner: example",
      "  name: status",
      "statusPage:",
      "  name: Example Status",
      "  fonts:",
      "    sans: Example Sans",
      "  theme:",
      "    name: Cloudy Autumn",
      "    palette:",
      "      canvas: '#090909'",
      "      foreground: '#f5f5f5'",
      "      accent: '#123456'",
      "      alternate: '#fedcba'",
      "      warning: '#d29922'",
      "      danger: '#f85149'",
      "    grid:",
      "      operational: '#abcdef'",
      "    chart:",
      "      line: accent",
      "      lineStyle: dotted",
      "      fill: true",
      "    background:",
      "      blobs:",
      "        count: 4",
      "        colors:",
      "          - '#111111'",
      "          - '#222222'",
      "    card:",
      "      borderEnabled: false",
      "      radius: 20",
      "      padding: 18",
      "    headline:",
      "      start: foreground",
      "      end: alternate",
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
  ]);

  const config = JSON.parse(await readFile(output, "utf8"));
  assert.equal(config.theme.name, "Cloudy Autumn");
  assert.equal(config.theme.accent, "#123456");
  assert.equal(config.theme.grid.operational, "#abcdef");
  assert.equal(config.theme.protocol.ipv4, "#123456");
  assert.equal(config.theme.chart.ipv4LineStyle, "dotted");
  assert.equal(config.theme.chart.fill, true);
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

test("carries the installation serial from the lock into the generated config", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "velvet-serial-"));
  const configuration = resolve(directory, "velvet.yml");
  await writeFile(
    configuration,
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

  // No lock beside it, which is every repository assembled by hand and every
  // installation made before serials existed.
  const withoutLock = resolve(directory, "without.json");
  await bun([resolve(siteRoot, "scripts/generate-config.mjs"), configuration, withoutLock]);
  assert.equal(
    "serial" in JSON.parse(await readFile(withoutLock, "utf8")),
    false,
    "no lock means no number rather than a placeholder",
  );

  await writeFile(
    resolve(directory, "velvet.lock.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      installedVersion: "2.0.0",
      template: { repository: "phranck/velvet-template", commit: "a".repeat(40) },
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      serial: 412,
    }, null, 2)}\n`,
  );
  const withLock = resolve(directory, "with.json");
  await bun([resolve(siteRoot, "scripts/generate-config.mjs"), configuration, withLock]);
  assert.equal(JSON.parse(await readFile(withLock, "utf8")).serial, 412);
}, BUILD_TIMEOUT_MS);

test("publishes the references page where GitHub Pages will find it", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.references.ts",
    "--outDir", resolve(outDir, "references"),
  ]);

  // A bare path resolves to index.html inside a directory of that name, so
  // anything else would answer velvet.li/references with a 404.
  const html = await readFile(resolve(outDir, "references", "index.html"), "utf8");

  assert.match(html, /<title>Who runs Velvet<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/velvet\.li\/references"/);
  // It keeps its script, unlike the start page, because the list is read when
  // somebody opens the page rather than baked in at build time. Baking it in
  // would leave a withdrawn consent visible until the next rebuild.
  assert.match(html, /<script[^>]+src="\.\/assets\/references-[^"]+\.js"/);
  // Built separately from the start page, so it carries its own assets beside
  // it. Sharing a build put the wordmark's styles in a stylesheet the
  // prerendered start page never loads, and left that page preloading a bundle
  // it does not run.
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
}, BUILD_TIMEOUT_MS);

test("publishes the changelog where GitHub Pages will find it, and without a script", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.changelog.ts",
    "--outDir", resolve(outDir, "changelog"),
  ]);

  const html = await readFile(resolve(outDir, "changelog", "index.html"), "utf8");

  assert.match(html, /<title>Velvet releases<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/velvet\.li\/changelog"/);
  // No bundle. Prerendered, unlike the references page: the releases come from
  // a file in this repository, so there is nothing to read at request time.
  // The one script it carries is the small inline one every prerendered page
  // gets, which wires the copy buttons.
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/);
  assert.doesNotMatch(html, /\/@fs\//);
  assert.doesNotMatch(html, /["'](\/src\/[^"']+)["']/);

  // The releases the repository's own changelog names, rendered rather than
  // copied. A page that lost its content would still pass every check above.
  // A heading may end in a bracketed release date, which the page renders apart
  // from the title rather than inside it, so the two are checked separately.
  // Looking for the heading whole passed only for as long as no entry carried a
  // date, and failed on the first one that did.
  const changelog = await readFile(resolve(repositoryRoot, "CHANGELOG.md"), "utf8");
  for (const [, heading] of changelog.matchAll(/^##\s+(.+?)\s*$/gmu)) {
    const dated = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)$/u.exec(heading!);
    for (const part of dated ? [dated[1]!, dated[2]!] : [heading!]) {
      assert.ok(html.includes(part), `the page does not name ${part}`);
    }
  }

  // Written as `LICENSING.md` in the changelog, which resolves inside the
  // repository and nowhere else.
  assert.match(
    html,
    /href="https:\/\/github\.com\/phranck\/velvet\/blob\/main\/LICENSING\.md"/,
  );
}, BUILD_TIMEOUT_MS);

test("publishes the configuration reference whole, tables and all", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.documentation.ts",
    "--outDir", resolve(outDir, "documentation"),
  ]);

  const html = await readFile(resolve(outDir, "documentation", "index.html"), "utf8");
  const reference = await readFile(
    resolve(repositoryRoot, "documentation/configuration.md"),
    "utf8",
  );

  assert.match(html, /<title>Velvet configuration reference<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/velvet\.li\/documentation"/);
  // No bundle. The one script this page publishes is written inline in
  // `documentation.html` and wires the copy buttons, which cannot be done by
  // the component that renders them because the bundle is removed.
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/);
  assert.doesNotMatch(html, /\/@fs\//);
  assert.doesNotMatch(html, /["'](\/src\/[^"']+)["']/);

  // One button per block, each disabled in the markup so a reader whose script
  // never runs is shown no control rather than a dead one.
  const fences = (await readFile(
    resolve(repositoryRoot, "documentation/configuration.md"),
    "utf8",
  )).match(/^```yaml$/gmu) ?? [];
  assert.equal((html.match(/<button[^>]*data-copy-code/gu) ?? []).length, fences.length);
  assert.equal(
    (html.match(/<button[^>]*data-copy-code[^>]*disabled/gu) ?? []).length,
    fences.length,
  );
  // Coloured and numbered at build time, so neither needs a script either.
  assert.match(html, /<span class="key[^"]*">schemaVersion<\/span>/);
  assert.match(html, /<span class="line-number[^"]*"[^>]*>1<\/span>/);

  // The warning, above the reference rather than inside it. A reference read
  // without it reads as an invitation to edit the file it describes, which is
  // the one way an installation breaks so that nobody can repair it for its
  // owner. Its position is asserted as well as its presence, because a notice
  // below the document it warns about is one nobody reaches.
  const warning = html.indexOf("Editing this file by hand is not the supported path");
  assert.notEqual(warning, -1, "the page carries no warning");
  // Against the first card rather than against a topic's name, because every
  // name appears in the sidebar before the warning as well, and comparing with
  // that would pass whatever order the page is in.
  assert.equal(
    warning < html.indexOf('<div class="card'),
    true,
    "the warning sits after the reference it warns about",
  );
  assert.match(html, /the only supported way to change it/);
  assert.match(html, /not something Velvet can repair or answer for/);

  // Counted against the source rather than sampled, because a renderer that
  // drops a block silently is exactly what a spot check misses. The tables
  // carry the field names, their defaults, and their accepted values, which is
  // the substance of the document.
  const pipeLines = reference
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const delimiters = pipeLines.filter((line) => /^\|\s*:?-{3,}/u.test(line));

  assert.equal(
    (html.match(/<table[ >]/gu) ?? []).length,
    delimiters.length,
    "not every table in the reference was rendered",
  );
  assert.equal(
    (html.match(/<tr[ >]/gu) ?? []).length,
    pipeLines.length - delimiters.length,
    "rows went missing between the reference and the page",
  );

  // The document's own outline. Its level-one heading is dropped, because the
  // page supplies one. Each level-two heading becomes a topic, named above its
  // own card and listed once in the sidebar, and the level-three headings stay
  // inside the cards where `headings: "outline"` renders them.
  const headingsOfDepth = (depth: number): number =>
    reference.split("\n").filter((line) => new RegExp(`^#{${depth}} `, "u").test(line))
      .length;
  assert.equal((html.match(/<h1[ >]/gu) ?? []).length, 1);
  assert.equal(
    (html.match(/<h2[^>]*\bdata-topic=/gu) ?? []).length,
    headingsOfDepth(2),
    "a topic went missing between the reference and the page",
  );
  assert.equal(
    (html.match(/\bdata-topic-link=/gu) ?? []).length,
    headingsOfDepth(2),
    "the sidebar does not list every topic exactly once",
  );
  assert.equal((html.match(/<h3[ >]/gu) ?? []).length, headingsOfDepth(3));

  // Every topic's card carries the name above it, and every sidebar entry
  // points at a heading that exists.
  const anchors = [...html.matchAll(/\bdata-topic-link="([^"]+)"/gu)].map(([, id]) => id);
  for (const id of anchors) {
    assert.match(
      html,
      new RegExp(`<h2[^>]*\\bid="${id}"`),
      `the sidebar points at ${id}, which no heading carries`,
    );
  }

  // Written as `../LICENSING.md` in a document one directory down, so a page at
  // the site root has to resolve it rather than repeat it.
  assert.match(
    html,
    /href="https:\/\/github\.com\/phranck\/velvet\/blob\/main\/LICENSING\.md"/,
  );
  assert.match(
    html,
    /href="https:\/\/github\.com\/phranck\/velvet\/blob\/main\/THIRD_PARTY_NOTICES\.md"/,
  );
}, BUILD_TIMEOUT_MS);

test("publishes the attributions from the repository's own notices", async () => {
  const outDir = await buildDirectory();
  await bun([
    "run", "--bun", "vite", "build",
    "--config", "vite.attributions.ts",
    "--outDir", resolve(outDir, "attributions"),
  ]);

  const html = await readFile(resolve(outDir, "attributions", "index.html"), "utf8");
  const notices = await readFile(
    resolve(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );

  assert.match(html, /<title>Velvet attributions<\/title>/);
  assert.doesNotMatch(html, /<script[^>]*\bsrc=/);

  // Rendered from the repository's own notices rather than a copy, so a
  // component credited there is credited here and nowhere else has to be
  // kept in step.
  const pipeLines = notices
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const delimiters = pipeLines.filter((line) => /^\|\s*:?-{3,}/u.test(line));
  assert.equal(
    (html.match(/<tr[ >]/gu) ?? []).length,
    pipeLines.length - delimiters.length,
    "a credit went missing between the notices and the page",
  );

  // The icons the site draws are licensed on the condition that the notice
  // travels with them, which is what this page is for.
  assert.match(html, /Iconsax/);
  assert.match(html, /Vuesax/);
}, BUILD_TIMEOUT_MS);

test("packages the man pages so an archive unpacks straight into a manpath", async () => {
  const outDir = await buildDirectory();
  // The packaging script refuses to write into a directory holding no built
  // site, which is a guard rather than the subject here, so it is satisfied
  // with a stub instead of a second full Vite build.
  await writeFile(resolve(outDir, "index.html"), "<!doctype html>\n");
  await bun([resolve(siteRoot, "scripts/build-man-pages.ts"), outDir]);

  const unpacked = await mkdtemp(resolve(tmpdir(), "velvet-man-"));
  await execFileAsync("tar", [
    "-xzf", resolve(outDir, "velvet-man-pages.tar.gz"),
    "-C", unpacked,
  ]);
  const root = resolve(unpacked, "velvet-man-pages");

  // Section directories, because `man` finds a page by the directory it sits
  // in rather than by its name. A flat archive installs and then resolves
  // nothing.
  for (const [section, page] of [
    ["man1", "velvet-config.1"],
    ["man5", "velvet.yml.5"],
    ["man7", "velvet.7"],
  ]) {
    assert.equal(
      await readFile(resolve(root, section, page), "utf8"),
      await readFile(resolve(repositoryRoot, "documentation/man", page), "utf8"),
      `${page} in the archive differs from its source`,
    );
  }

  // Executable as unpacked, so the documented install path is one command and
  // not one command preceded by a chmod.
  const installer = await stat(resolve(root, "install.sh"));
  assert.equal(
    (installer.mode & 0o111) !== 0,
    true,
    "install.sh is not executable inside the archive",
  );
});

test("builds the man-page archive as part of the published website", async () => {
  const scripts = JSON.parse(
    await readFile(resolve(siteRoot, "package.json"), "utf8"),
  ).scripts;

  // The archive is derived output and is never committed, so the only thing
  // that puts it in front of a visitor is the website build itself.
  assert.match(scripts["website:build"], /bun run man-pages:build/);
  assert.equal(scripts["man-pages:build"], "bun scripts/build-man-pages.ts");
});

test("builds every published page as part of the website", async () => {
  const scripts = JSON.parse(
    await readFile(resolve(siteRoot, "package.json"), "utf8"),
  ).scripts;

  // Each page has a build of its own, because Rollup splits what two entries
  // share, and each has to be named here or it never reaches the artefact the
  // Pages workflow uploads.
  assert.match(scripts["website:build"], /bun run references:build/);
  assert.match(scripts["website:build"], /bun run changelog:build/);
  assert.match(scripts["website:build"], /bun run documentation:build/);
  assert.match(scripts["website:build"], /bun run attributions:build/);
  assert.equal(scripts["changelog:build"], "vite build --config vite.changelog.ts");
  assert.equal(
    scripts["documentation:build"],
    "vite build --config vite.documentation.ts",
  );
  assert.equal(
    scripts["attributions:build"],
    "vite build --config vite.attributions.ts",
  );

  // Every page also belongs in the sitemap, which is served from the website's
  // public directory rather than generated.
  const sitemap = await readFile(
    resolve(siteRoot, "src/website/public/sitemap.xml"),
    "utf8",
  );
  for (const location of [
    "https://velvet.li/",
    "https://velvet.li/documentation",
    "https://velvet.li/changelog",
    "https://velvet.li/attributions",
    "https://velvet.li/references",
  ]) {
    assert.ok(
      sitemap.includes(`<loc>${location}</loc>`),
      `the sitemap does not list ${location}`,
    );
  }
});

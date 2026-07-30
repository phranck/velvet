import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  cloneConfiguratorTheme,
  createConfiguratorServiceDraft,
  configuratorServiceOptions,
  exportConfigurationYaml,
  exportVelvetYaml,
  parseConfiguratorYaml,
  updateConfiguratorDocument,
} from "../src/configurator/configuration.js";

test("clones reactive registry themes as plain configuration data", () => {
  const source = parseConfiguratorYaml("").settings.theme;
  const reactiveTheme = new Proxy(source, {});

  assert.throws(() => structuredClone(reactiveTheme), /c(?:ould|an) not be cloned/i);
  assert.deepEqual(cloneConfiguratorTheme(reactiveTheme), source);
});

test("exports reactive imported documents as plain configuration data", () => {
  const imported = parseConfiguratorYaml(`
owner: example
repo: status
status-website:
  name: Example Status
`);
  const reactiveDocument = new Proxy(imported.document, {});

  assert.throws(() => structuredClone(reactiveDocument), /c(?:ould|an) not be cloned/i);

  const exported = parseConfiguratorYaml(
    exportConfigurationYaml(reactiveDocument, imported.settings),
  );
  assert.equal(exported.document.owner, "example");
  assert.equal(exported.document.repo, "status");
  assert.equal(
    (exported.document["status-website"] as Record<string, unknown>).name,
    "Example Status",
  );
});

test("round-trips a named palette with linked colors and card geometry", () => {
  const imported = parseConfiguratorYaml(`
status-website:
  name: Production Status
  velvet:
    theme:
      name: Cloudy Autumn
      palette:
        canvas: "#17100d"
        foreground: "#fff2dc"
        accent: "#d97732"
        alternate: "#e9b949"
        warning: "#f0a229"
        danger: "#d84a3a"
        textPrimary: "#fff2dc"
        textSecondary: "#9e9385"
        textTertiary: "#61584f"
      protocol:
        ipv6: accent
      headline:
        start: foreground
        end: alternate
      card:
        radius: 24
        padding: 20
`);

  assert.equal(imported.settings.theme.name, "Cloudy Autumn");
  assert.equal(imported.settings.theme.palette.accent, "#d97732");
  assert.equal(imported.settings.theme.palette.textPrimary, "#fff2dc");
  assert.equal(imported.settings.theme.protocol.ipv6, "accent");
  assert.deepEqual(imported.settings.theme.headline, {
    start: "foreground",
    end: "alternate",
  });
  assert.equal(imported.settings.theme.card.radius, 24);
  assert.equal(imported.settings.theme.card.padding, 20);

  const exported = parseConfiguratorYaml(
    exportConfigurationYaml(imported.document, imported.settings),
  );
  assert.equal(exported.settings.theme.name, "Cloudy Autumn");
  assert.equal(exported.settings.theme.palette.textSecondary, "#9e9385");
  assert.equal(exported.settings.theme.protocol.ipv6, "accent");
  assert.equal(
    (exported.document["status-website"] as Record<string, unknown>).name,
    "Production Status",
  );
});

test("imports existing YAML and preserves unrelated configuration", () => {
  const imported = parseConfiguratorYaml(`
owner: example
repo: status
sites:
  - name: Website
    url: https://example.com
status-website:
  name: Example Status
  velvet:
    layout: cards
    showPoweredBy: false
    accent: "#123456"
    accentDeg: "#abcdef"
    accentDown: "#fedcba"
    theme:
      chart:
        ipv4LineStyle: dotted
        ipv6LineStyle: solid
        fill: true
        background: alternate
        backgroundOpacity: 0.4
    icons:
      website: ph-globe
`);

  assert.equal(imported.settings.layout, "cards");
  assert.equal(imported.settings.theme.palette.accent, "#123456");
  assert.equal(imported.settings.theme.grid.degraded, "#abcdef");
  assert.equal(imported.settings.theme.grid.outage, "#fedcba");
  assert.deepEqual(imported.settings.theme.chart, {
    ipv4LineStyle: "dotted",
    ipv6LineStyle: "solid",
    fill: true,
    background: "alternate",
    backgroundOpacity: 0.4,
  });

  const updated = updateConfiguratorDocument(imported.document, {
    ...imported.settings,
    layout: "grouped",
    theme: {
      ...imported.settings.theme,
      protocol: {
        ...imported.settings.theme.protocol,
        ipv6: "#00aaff",
      },
      chart: {
        ipv4LineStyle: "dashed",
        ipv6LineStyle: "dotted",
        fill: false,
        background: "canvas",
        backgroundOpacity: 0.65,
      },
    },
  });

  assert.equal(updated.owner, "example");
  assert.deepEqual(updated.sites, [
    { name: "Website", url: "https://example.com" },
  ]);
  const statusWebsite = updated["status-website"] as Record<string, unknown>;
  assert.equal(statusWebsite.name, "Example Status");
  const velvet = statusWebsite.velvet as Record<string, unknown>;
  assert.equal(velvet.layout, "grouped");
  assert.equal(velvet.showPoweredBy, false);
  assert.deepEqual(velvet.icons, { website: "ph-globe" });
  assert.equal("accentDeg" in velvet, false);
  assert.equal(
    ((velvet.theme as Record<string, unknown>).protocol as Record<string, unknown>)
      .ipv6,
    "#00aaff",
  );
  assert.deepEqual(
    (velvet.theme as Record<string, unknown>).chart,
    {
      ipv4LineStyle: "dashed",
      ipv6LineStyle: "dotted",
      fill: false,
      background: "canvas",
      backgroundOpacity: 0.65,
    },
  );
});

test("exports a complete Velvet block and a complete updated config", () => {
  const imported = parseConfiguratorYaml(`
owner: example
repo: status
status-website:
  name: Example
  velvet:
    showSubscribe: false
`);

  const block = parseConfiguratorYaml(exportVelvetYaml(imported.document, imported.settings));
  assert.deepEqual(block.document, {
    "status-website": {
      velvet: {
        layout: "grouped",
        theme: imported.settings.theme,
      },
    },
  });

  const complete = parseConfiguratorYaml(
    exportConfigurationYaml(imported.document, imported.settings),
  );
  assert.equal(complete.document.owner, "example");
  assert.equal(complete.document.repo, "status");
  assert.doesNotMatch(
    exportConfigurationYaml(imported.document, imported.settings),
    /showSubscribe/,
  );
  assert.equal(
    (complete.document["status-website"] as Record<string, unknown>).name,
    "Example",
  );
});

test("creates a minimal config and rejects invalid imports", () => {
  const defaults = parseConfiguratorYaml("");
  const minimal = parseConfiguratorYaml(
    exportConfigurationYaml(null, defaults.settings),
  );

  assert.deepEqual(minimal.document.repository, {
    owner: "your-github-owner",
    name: "your-status-repo",
  });
  assert.equal(
    (minimal.document.statusPage as Record<string, unknown>).name,
    "Status",
  );

  assert.throws(
    () => parseConfiguratorYaml("status-website: []"),
    /status-website.*mapping/i,
  );
  assert.throws(
    () =>
      parseConfiguratorYaml(`
status-website:
  velvet:
    theme:
      accent: definitely-not-a-hex-color
`),
    /theme\.accent.*hex/i,
  );
  assert.throws(
    () =>
      parseConfiguratorYaml(`
status-website:
  velvet:
    theme:
      palette:
        textPrimary: not-a-color
`),
    /theme\.palette\.textPrimary.*hex/i,
  );
});

test("round-trips native Velvet layout, theme, and curated service icons", () => {
  const imported = parseConfiguratorYaml(`
schemaVersion: 1
repository:
  owner: velvet-user
  name: status
statusPage:
  name: Example Status
  layout: cards
  icons:
    website: ph-globe
  theme:
    name: Velvet Default
    palette:
      accent: "#6366f1"
    chart:
      line: accent
      lineStyle: dotted
services:
  - name: Website
    url: https://example.com
`);

  assert.equal(imported.settings.layout, "cards");
  assert.deepEqual(imported.settings.icons, { website: "ph-globe" });
  assert.equal(imported.settings.services?.length, 1);
  assert.equal(imported.settings.services?.[0]?.name, "Website");
  assert.equal(imported.settings.services?.[0]?.url, "https://example.com/");
  assert.equal(imported.settings.services?.[0]?.icon, "ph-globe");
  assert.equal(imported.settings.theme.protocol.ipv4, "accent");
  assert.equal(imported.settings.theme.chart.ipv4LineStyle, "dotted");

  imported.settings.services![0]!.icon = "ph-hard-drives";
  const updated = updateConfiguratorDocument(imported.document, imported.settings);
  const statusPage = updated.statusPage as Record<string, unknown>;
  const theme = statusPage.theme as Record<string, unknown>;
  assert.equal(statusPage.layout, "cards");
  assert.deepEqual(statusPage.icons, { website: "ph-hard-drives" });
  assert.equal((theme.chart as Record<string, unknown>).line, "accent");
  assert.equal((theme.chart as Record<string, unknown>).lineStyle, "dotted");
  assert.equal("protocol" in theme, false);
  assert.equal("status-website" in updated, false);
  assert.deepEqual(configuratorServiceOptions(imported.document), [
    { id: "website", name: "Website" },
  ]);
});

test("renames, adds, and removes native services without stale icon mappings", () => {
  const imported = parseConfiguratorYaml(`
schemaVersion: 1
repository:
  owner: velvet-user
  name: status
statusPage:
  name: Example Status
  icons:
    website: ph-globe
services:
  - name: Website
    url: https://example.com
`);
  assert.ok(imported.settings.services);

  imported.settings.services[0]!.name = "Public Site";
  const backend = createConfiguratorServiceDraft();
  backend.name = "Backend";
  backend.url = "https://api.example.com/health";
  backend.icon = "ph-gear-six";
  imported.settings.services.push(backend);

  const updated = updateConfiguratorDocument(imported.document, imported.settings);
  const statusPage = updated.statusPage as Record<string, unknown>;
  const services = updated.services as Array<Record<string, unknown>>;
  assert.deepEqual(
    services.map(({ id, name }) => ({ id, name })),
    [
      { id: "public-site", name: "Public Site" },
      { id: "backend", name: "Backend" },
    ],
  );
  assert.deepEqual(statusPage.icons, {
    "public-site": "ph-globe",
    backend: "ph-gear-six",
  });
  assert.equal("website" in (statusPage.icons as Record<string, unknown>), false);

  imported.settings.services.splice(0, 1);
  const removed = updateConfiguratorDocument(imported.document, imported.settings);
  assert.deepEqual(
    (removed.services as Array<Record<string, unknown>>).map(({ id }) => id),
    ["backend"],
  );
  assert.deepEqual((removed.statusPage as Record<string, unknown>).icons, {
    backend: "ph-gear-six",
  });
});

test("preserves advanced native HTTP fields and additional checks", () => {
  const imported = parseConfiguratorYaml(`
schemaVersion: 1
repository:
  owner: velvet-user
  name: status
statusPage:
  name: Example Status
services:
  - id: api
    name: API
    checks:
      - id: primary
        name: Primary API
        url: https://api.example.com/health
        method: GET
        expectedStatusCodes: [200, 204]
        maxRedirects: 2
        timeoutMs: 3500
        headers:
          - name: Authorization
            secret: API_HEALTH_TOKEN
        jsonAssertions:
          - path: /healthy
            equals: true
      - id: fallback
        name: Fallback API
        url: https://fallback.example.com/health
`);
  const service = imported.settings.services?.[0];
  assert.ok(service);
  assert.equal(service.method, "GET");
  assert.equal(service.expectedStatusCodes, "200, 204");
  assert.equal(service.maxRedirects, 2);
  assert.equal(service.timeoutMs, 3500);
  assert.deepEqual(
    service.headers.map(({ name, secret }) => ({ name, secret })),
    [{ name: "Authorization", secret: "API_HEALTH_TOKEN" }],
  );
  assert.deepEqual(
    service.jsonAssertions.map(({ path, valueType, value }) => ({
      path,
      valueType,
      value,
    })),
    [{ path: "/healthy", valueType: "boolean", value: "true" }],
  );
  assert.equal(service.additionalChecks.length, 1);

  const updated = updateConfiguratorDocument(imported.document, imported.settings);
  const checks = (updated.services as Array<{ checks: unknown[] }>)[0]!.checks;
  assert.equal(checks.length, 2);
  assert.deepEqual(checks[1], {
    id: "fallback",
    name: "Fallback API",
    url: "https://fallback.example.com/health",
    method: "GET",
    expectedStatusCodes: [200],
    maxRedirects: 5,
    timeoutMs: 10000,
    headers: [],
    jsonAssertions: [],
  });
});

test("keeps legacy monitoring targets read-only and starts new files as native Velvet", () => {
  const legacy = parseConfiguratorYaml(`
owner: example
repo: status
sites:
  - name: Website
    url: https://example.com
status-website:
  name: Example Status
`);
  assert.equal(legacy.settings.services, null);
  assert.deepEqual(
    updateConfiguratorDocument(legacy.document, legacy.settings).sites,
    legacy.document.sites,
  );

  const fresh = parseConfiguratorYaml("");
  assert.equal(fresh.settings.services?.length, 2);
  const exported = parseConfiguratorYaml(
    exportConfigurationYaml(null, fresh.settings),
  );
  assert.equal(exported.document.schemaVersion, 1);
  assert.equal(exported.settings.services?.[0]?.name, "Website");
});

import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  cloneConfiguratorTheme,
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

  assert.equal(minimal.document.owner, "your-github-owner");
  assert.equal(minimal.document.repo, "your-status-repo");
  assert.equal(
    (minimal.document["status-website"] as Record<string, unknown>).name,
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

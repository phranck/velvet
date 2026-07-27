import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_WIDTH_STEPS,
  normalizeThemeConfiguration,
  PALETTE_KEYS,
  resolveColorSource,
  resolveTheme,
  themeCssVariables,
} from "../src/lib/theme.js";

test("normalizes card width to four stages and controls its shadow", () => {
  assert.deepEqual(CARD_WIDTH_STEPS, [640, 760, 920, 1080]);

  const configuration = normalizeThemeConfiguration({
    card: { maxWidth: 900, shadowEnabled: false },
  });
  const theme = resolveTheme(configuration);
  const variables = themeCssVariables(theme, "example/status");

  assert.equal(configuration.card.maxWidth, 920);
  assert.equal(theme.card.maxWidth, 920);
  assert.equal(theme.card.shadowEnabled, false);
  assert.equal(variables["--service-card-max-width"], "920px");
  assert.equal(variables["--card-shadow"], "none");
});

test("uses nine named palette colors including the three default text roles", () => {
  assert.deepEqual(PALETTE_KEYS, [
    "canvas",
    "foreground",
    "accent",
    "alternate",
    "warning",
    "danger",
    "textPrimary",
    "textSecondary",
    "textTertiary",
  ]);

  const configuration = normalizeThemeConfiguration({
    palette: {
      canvas: "#080912",
      foreground: "#f7f4ff",
      accent: "#7c5cff",
      alternate: "#31c7f5",
      warning: "#efad32",
      danger: "#f45d68",
      textPrimary: "#eeeeee",
      textSecondary: "#aaaaaa",
      textTertiary: "#777777",
    },
  });
  const theme = resolveTheme(configuration);

  assert.deepEqual(theme.text, {
    primary: "#eeeeee",
    secondary: "#aaaaaa",
    tertiary: "#777777",
  });
  assert.deepEqual(theme.headline, {
    start: "#eeeeee",
    end: "#aaaaaa",
  });
  assert.equal(
    resolveColorSource("textTertiary", configuration.palette, "#000000"),
    "#777777",
  );
});

test("derives visual roles from nine named palette colors", () => {
  const configuration = normalizeThemeConfiguration({
    name: "Violet Velvet",
    palette: {
      canvas: "#080912",
      foreground: "#f7f4ff",
      accent: "#7c5cff",
      alternate: "#31c7f5",
      warning: "#efad32",
      danger: "#f45d68",
      textPrimary: "#f7f4ff",
      textSecondary: "#aaa8b3",
      textTertiary: "#777680",
    },
  });
  const theme = resolveTheme(configuration);

  assert.equal(theme.name, "Violet Velvet");
  assert.deepEqual(theme.palette, configuration.palette);
  assert.equal(theme.grid.operational, "#7c5cff");
  assert.equal(theme.grid.degraded, "#efad32");
  assert.equal(theme.grid.outage, "#f45d68");
  assert.equal(theme.protocol.ipv4, "#7c5cff");
  assert.equal(theme.protocol.ipv6, "#31c7f5");
  assert.equal(theme.text.primary, "#f7f4ff");
  assert.deepEqual(theme.background.blobs.colors, ["#7c5cff", "#31c7f5"]);
});

test("keeps named color references linked and custom role overrides isolated", () => {
  const configuration = normalizeThemeConfiguration({
    palette: {
      accent: "#123456",
      alternate: "#abcdef",
    },
    protocol: {
      ipv4: "alternate",
      ipv6: "#ff00ff",
    },
    headline: {
      start: "accent",
      end: "warning",
    },
    service: {
      icon: "alternate",
    },
    card: {
      radius: 22,
      padding: 20,
    },
  });
  const theme = resolveTheme(configuration);

  assert.equal(configuration.protocol.ipv4, "alternate");
  assert.equal(theme.protocol.ipv4, "#abcdef");
  assert.equal(theme.protocol.ipv6, "#ff00ff");
  assert.equal(theme.headline.start, "#123456");
  assert.equal(theme.headline.end, configuration.palette.warning);
  assert.equal(theme.service.icon, "#abcdef");
  assert.equal(theme.card.radius, 22);
  assert.equal(theme.card.padding, 20);
});

test("resolves the Velvet theme defaults", () => {
  assert.deepEqual(resolveTheme(), {
    name: "Velvet Default",
    palette: {
      canvas: "#0a0b0f",
      foreground: "#e8eaed",
      accent: "#6366f1",
      alternate: "#38bdf8",
      warning: "#d29922",
      danger: "#f85149",
      textPrimary: "#e8eaed",
      textSecondary: "#8b8c90",
      textTertiary: "#515256",
    },
    grid: {
      operational: "#6366f1",
      degraded: "#d29922",
      outage: "#f85149",
      noData: "#1c1d21",
    },
    protocol: {
      ipv4: "#6366f1",
      ipv6: "#38bdf8",
    },
    chart: {
      ipv4LineStyle: "solid",
      ipv6LineStyle: "dashed",
      fill: false,
      background: "#0a0b0f",
      backgroundOpacity: 0,
    },
    background: {
      start: "#0e0f13",
      end: "#0a0b0f",
      blobs: {
        enabled: true,
        count: 3,
        colors: ["#6366f1", "#38bdf8"],
      },
    },
    card: {
      background: "#0e0f13",
      border: "#1c1d21",
      separator: "#131418",
      borderEnabled: true,
      shadowEnabled: true,
      radius: 14,
      padding: 16,
      maxWidth: 760,
    },
    headline: {
      start: "#e8eaed",
      end: "#8b8c90",
    },
    service: {
      icon: "#6366f1",
    },
    accent: "#6366f1",
    text: {
      primary: "#e8eaed",
      secondary: "#8b8c90",
      tertiary: "#515256",
    },
  });
});

test("resolves nested theme values while preserving legacy accent fields", () => {
  const theme = resolveTheme({
    accent: "#123456",
    accentDeg: "#fedcba",
    accentDown: "#654321",
    grid: { operational: "#abcdef" },
    background: {
      blobs: {
        count: 9,
        colors: ["#111111", "#222222"],
      },
    },
    card: { borderEnabled: false },
    chart: {
      ipv4LineStyle: "dotted",
      ipv6LineStyle: "invalid",
      fill: true,
      background: "warning",
      backgroundOpacity: 0.45,
    },
  });

  assert.equal(theme.accent, "#123456");
  assert.equal(theme.grid.operational, "#abcdef");
  assert.equal(theme.grid.degraded, "#fedcba");
  assert.equal(theme.grid.outage, "#654321");
  assert.equal(theme.protocol.ipv4, "#123456");
  assert.equal(theme.background.blobs.count, 5);
  assert.deepEqual(theme.background.blobs.colors, ["#111111", "#222222"]);
  assert.equal(theme.card.borderEnabled, false);
  assert.equal(theme.chart.ipv4LineStyle, "dotted");
  assert.equal(theme.chart.ipv6LineStyle, "dashed");
  assert.equal(theme.chart.fill, true);
  assert.equal(theme.chart.background, theme.palette.warning);
  assert.equal(theme.chart.backgroundOpacity, 0.45);
});

test("creates stable CSS variables and a harmonious cloudy background", () => {
  const theme = resolveTheme({
    background: {
      start: "#010203",
      end: "#040506",
      blobs: {
        count: 5,
        colors: ["#112233", "#445566"],
      },
    },
    card: { borderEnabled: false },
    chart: { background: "#112233", backgroundOpacity: 0.35 },
  });

  const first = themeCssVariables(theme, "example/status");
  const second = themeCssVariables(theme, "example/status");

  assert.deepEqual(first, second);
  assert.equal(first["--background-start"], "#010203");
  assert.equal(first["--background-end"], "#040506");
  assert.equal(first["--card-border-width"], "0px");
  assert.equal(first["--card-radius"], "14px");
  assert.equal(first["--card-padding"], "16px");
  assert.equal(first["--service-card-max-width"], "760px");
  assert.match(first["--card-shadow"], /rgba/);
  assert.equal(first["--headline-start"], theme.headline.start);
  assert.equal(first["--headline-end"], theme.headline.end);
  assert.equal(first["--service-icon"], theme.service.icon);
  assert.equal(first["--protocol-ipv6"], "#38bdf8");
  assert.equal(first["--chart-background"], "#112233");
  assert.equal(first["--chart-background-opacity"], "0.35");
  assert.equal(
    first["--cloudy-blobs"].match(/radial-gradient/g)?.length,
    5,
  );
  assert.notEqual(
    first["--cloudy-blobs"],
    themeCssVariables(theme, "different/repository")["--cloudy-blobs"],
  );

  const disabled = themeCssVariables(
    resolveTheme({ background: { blobs: { enabled: false } } }),
    "example/status",
  );
  assert.equal(disabled["--cloudy-blobs"], "none");
});

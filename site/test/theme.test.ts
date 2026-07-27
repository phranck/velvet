import assert from "node:assert/strict";
import test from "node:test";

import { resolveTheme, themeCssVariables } from "../src/lib/theme.js";

test("resolves the Velvet theme defaults", () => {
  assert.deepEqual(resolveTheme(), {
    grid: {
      operational: "#6366f1",
      degraded: "#d29922",
      outage: "#f85149",
      noData: "#1c2029",
    },
    protocol: {
      ipv4: "#7c7ef3",
      ipv6: "#38bdf8",
    },
    background: {
      start: "#0e1018",
      end: "#0a0b0f",
      blobs: {
        enabled: true,
        count: 3,
        colors: ["#6366f1", "#7c7ef3"],
      },
    },
    card: {
      background: "#0e1015",
      border: "#1c2029",
      separator: "#14171f",
      borderEnabled: true,
    },
    accent: "#6366f1",
    text: {
      primary: "#e8eaed",
      secondary: "#8b919b",
      tertiary: "#565b65",
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
  });

  assert.equal(theme.accent, "#123456");
  assert.equal(theme.grid.operational, "#abcdef");
  assert.equal(theme.grid.degraded, "#fedcba");
  assert.equal(theme.grid.outage, "#654321");
  assert.equal(theme.protocol.ipv4, "#385471");
  assert.equal(theme.background.blobs.count, 5);
  assert.deepEqual(theme.background.blobs.colors, ["#111111", "#222222"]);
  assert.equal(theme.card.borderEnabled, false);
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
  });

  const first = themeCssVariables(theme, "example/status");
  const second = themeCssVariables(theme, "example/status");

  assert.deepEqual(first, second);
  assert.equal(first["--background-start"], "#010203");
  assert.equal(first["--background-end"], "#040506");
  assert.equal(first["--card-border-width"], "0px");
  assert.equal(first["--protocol-ipv6"], "#38bdf8");
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

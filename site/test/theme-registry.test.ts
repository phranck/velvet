import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  EMBEDDED_THEME_REGISTRY,
  loadThemeRegistry,
  parseThemeRegistry,
} from "../src/configurator/theme-registry.js";

test("validates and normalizes public palette themes", () => {
  const registry = parseThemeRegistry({
    schemaVersion: 1,
    themes: [
      {
        id: "cloudy-autumn",
        name: "Cloudy Autumn",
        author: "Example",
        theme: {
          palette: {
            canvas: "#17100d",
            foreground: "#fff2dc",
            accent: "#d97732",
            alternate: "#e9b949",
            warning: "#f0a229",
            danger: "#d84a3a",
            textPrimary: "#fff2dc",
            textSecondary: "#9e9385",
            textTertiary: "#61584f",
          },
          headline: { start: "foreground", end: "alternate" },
          service: { icon: "alternate" },
          card: { maxWidth: 920, shadowEnabled: false },
        },
      },
    ],
  });

  assert.equal(registry.themes[0].id, "cloudy-autumn");
  assert.equal(registry.themes[0].theme.name, "Cloudy Autumn");
  assert.equal(registry.themes[0].theme.headline.end, "alternate");
  assert.equal(registry.themes[0].theme.service.icon, "alternate");
  assert.equal(registry.themes[0].theme.card.radius, 14);
  assert.equal(registry.themes[0].theme.card.maxWidth, 920);
  assert.equal(registry.themes[0].theme.card.shadowEnabled, false);
});

test("rejects executable or incomplete public theme data", () => {
  assert.throws(
    () =>
      parseThemeRegistry({
        schemaVersion: 1,
        themes: [
          {
            id: "unsafe",
            name: "Unsafe",
            theme: {
              palette: {
                canvas: "javascript:alert(1)",
              },
              css: "body { display: none }",
            },
          },
        ],
      }),
    /palette|unsupported|hex/i,
  );
  assert.throws(
    () =>
      parseThemeRegistry({
        schemaVersion: 1,
        themes: [
          {
            id: "six-colors",
            name: "Six Colors",
            theme: {
              palette: {
                canvas: "#17100d",
                foreground: "#fff2dc",
                accent: "#d97732",
                alternate: "#e9b949",
                warning: "#f0a229",
                danger: "#d84a3a",
              },
            },
          },
        ],
      }),
    /palette\.textPrimary.*hex/i,
  );
});

test("uses cached themes offline and the embedded registry as the final fallback", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const remote = {
    schemaVersion: 1,
    themes: [
      {
        id: "violet-velvet",
        name: "Violet Velvet",
        theme: { palette: EMBEDDED_THEME_REGISTRY.themes[0].theme.palette },
      },
    ],
  };

  const loaded = await loadThemeRegistry({
    fetchImplementation: async () => Response.json(remote),
    storage,
  });
  assert.equal(loaded.source, "remote");
  assert.equal(loaded.registry.themes[0].name, "Violet Velvet");

  const cached = await loadThemeRegistry({
    fetchImplementation: async () => {
      throw new Error("offline");
    },
    storage,
  });
  assert.equal(cached.source, "cache");
  assert.equal(cached.registry.themes[0].name, "Violet Velvet");

  values.clear();
  const fallback = await loadThemeRegistry({
    fetchImplementation: async () => {
      throw new Error("offline");
    },
    storage,
  });
  assert.equal(fallback.source, "embedded");
  assert.ok(fallback.registry.themes.length >= 3);
});

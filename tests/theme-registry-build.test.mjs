import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const BUILD_SCRIPT = resolve(
  import.meta.dirname,
  "../scripts/build-theme-registry.mjs",
);

const PALETTE = {
  canvas: "#17100d",
  foreground: "#fff2dc",
  accent: "#d97732",
  alternate: "#e9b949",
  warning: "#f0a229",
  danger: "#d84a3a",
  textPrimary: "#fff2dc",
  textSecondary: "#9e9385",
  textTertiary: "#61584f",
};

async function withThemeWorkspace(callback) {
  const workspace = await mkdtemp(resolve(tmpdir(), "velvet-themes-"));
  const themesDirectory = resolve(workspace, "themes");
  const outputPath = resolve(workspace, "dist/index.json");
  await mkdir(themesDirectory, { recursive: true });

  try {
    await callback({ themesDirectory, outputPath });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function buildRegistry(themesDirectory, outputPath) {
  return spawnSync(
    process.execPath,
    [BUILD_SCRIPT, "--themes", themesDirectory, "--output", outputPath],
    { encoding: "utf8" },
  );
}

test("builds a deterministic public registry from theme files", async () => {
  await withThemeWorkspace(async ({ themesDirectory, outputPath }) => {
    await Promise.all([
      writeFile(
        resolve(themesDirectory, "violet-velvet.json"),
        `${JSON.stringify({
          id: "violet-velvet",
          name: "Violet Velvet",
          theme: { palette: PALETTE },
        })}\n`,
      ),
      writeFile(
        resolve(themesDirectory, "cloudy-autumn.json"),
        `${JSON.stringify({
          id: "cloudy-autumn",
          name: "Cloudy Autumn",
          author: "Velvet",
          theme: { palette: PALETTE },
        })}\n`,
      ),
    ]);

    const result = buildRegistry(themesDirectory, outputPath);

    assert.equal(result.status, 0, result.stderr);
    const registry = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(registry.schemaVersion, 1);
    assert.deepEqual(
      registry.themes.map(({ id }) => id),
      ["cloudy-autumn", "violet-velvet"],
    );
  });
});

test("rejects duplicate theme IDs", async () => {
  await withThemeWorkspace(async ({ themesDirectory, outputPath }) => {
    const duplicateTheme = {
      id: "cloudy-autumn",
      name: "Cloudy Autumn",
      theme: { palette: PALETTE },
    };
    await Promise.all([
      writeFile(
        resolve(themesDirectory, "one.json"),
        `${JSON.stringify(duplicateTheme)}\n`,
      ),
      writeFile(
        resolve(themesDirectory, "two.json"),
        `${JSON.stringify(duplicateTheme)}\n`,
      ),
    ]);

    const result = buildRegistry(themesDirectory, outputPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate theme id/i);
  });
});

test("rejects executable color sources and unsupported fields", async () => {
  await withThemeWorkspace(async ({ themesDirectory, outputPath }) => {
    await writeFile(
      resolve(themesDirectory, "unsafe.json"),
      `${JSON.stringify({
        id: "unsafe",
        name: "Unsafe",
        theme: {
          palette: PALETTE,
          protocol: { ipv4: "javascript:alert(1)" },
          css: "body { display: none }",
        },
      })}\n`,
    );

    const result = buildRegistry(themesDirectory, outputPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsupported|color source/i);
  });
});

test("rejects theme controls outside Velvet-supported ranges", async () => {
  await withThemeWorkspace(async ({ themesDirectory, outputPath }) => {
    await writeFile(
      resolve(themesDirectory, "invalid-controls.json"),
      `${JSON.stringify({
        id: "invalid-controls",
        name: "Invalid Controls",
        theme: {
          palette: PALETTE,
          chart: { backgroundOpacity: 2 },
          background: { blobs: { count: 8 } },
          card: { radius: 48, maxWidth: 777 },
        },
      })}\n`,
    );

    const result = buildRegistry(themesDirectory, outputPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /between|supported/i);
  });
});

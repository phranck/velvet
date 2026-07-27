import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HEX_COLOR = /^#[\da-f]{6}$/i;
const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTRY_KEYS = ["id", "name", "author", "theme"];
const THEME_KEYS = [
  "name",
  "palette",
  "grid",
  "protocol",
  "chart",
  "background",
  "card",
  "headline",
  "service",
  "text",
];
const COLOR_SOURCE_GROUPS = {
  grid: ["operational", "degraded", "outage", "noData"],
  protocol: ["ipv4", "ipv6"],
  headline: ["start", "end"],
  service: ["icon"],
  text: ["primary", "secondary", "tertiary"],
};
const LINE_STYLES = ["solid", "dashed", "dotted"];
const CARD_WIDTHS = [640, 760, 920, 1080];
const PALETTE_KEYS = [
  "canvas",
  "foreground",
  "accent",
  "alternate",
  "warning",
  "danger",
  "textPrimary",
  "textSecondary",
  "textTertiary",
];

const options = parseArguments(process.argv.slice(2));

try {
  const filenames = (await readdir(options.themesDirectory))
    .filter((filename) => filename.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  if (filenames.length === 0) throw new Error("No theme files found.");

  const themes = [];
  const ids = new Set();
  for (const filename of filenames) {
    const source = await readFile(
      resolve(options.themesDirectory, filename),
      "utf8",
    );
    const theme = parseThemeFile(source, filename);
    if (ids.has(theme.id)) throw new Error(`Duplicate theme id: ${theme.id}`);
    ids.add(theme.id);
    themes.push(theme);
  }

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(
    options.outputPath,
    `${JSON.stringify({ schemaVersion: 1, themes }, null, 2)}\n`,
  );
} catch (error) {
  console.error(`Theme registry build failed: ${error.message}`);
  process.exitCode = 1;
}

function parseThemeFile(source, filename) {
  let entry;
  try {
    entry = JSON.parse(source);
  } catch (error) {
    throw new Error(`${filename} contains invalid JSON: ${error.message}`, {
      cause: error,
    });
  }
  if (!isRecord(entry)) throw new Error(`${filename} must contain an object.`);
  assertOnlyKeys(entry, ENTRY_KEYS, filename);
  if (typeof entry.id !== "string" || !THEME_ID.test(entry.id)) {
    throw new Error(`${filename}.id must use lowercase kebab-case.`);
  }
  validateShortText(entry.name, `${filename}.name`);
  if (entry.author !== undefined) {
    validateShortText(entry.author, `${filename}.author`);
  }
  if (!isRecord(entry.theme)) {
    throw new Error(`${filename}.theme must be an object.`);
  }
  validateTheme(entry.theme, `${filename}.theme`);
  return entry;
}

function validateTheme(theme, path) {
  assertOnlyKeys(theme, THEME_KEYS, path);
  if (theme.name !== undefined) validateShortText(theme.name, `${path}.name`);
  validatePalette(theme.palette, `${path}.palette`);

  for (const [groupName, keys] of Object.entries(COLOR_SOURCE_GROUPS)) {
    if (theme[groupName] === undefined) continue;
    validateColorSourceGroup(theme[groupName], keys, `${path}.${groupName}`);
  }

  if (theme.chart !== undefined) validateChart(theme.chart, `${path}.chart`);
  if (theme.background !== undefined) {
    validateBackground(theme.background, `${path}.background`);
  }
  if (theme.card !== undefined) validateCard(theme.card, `${path}.card`);
}

function validatePalette(value, path) {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  assertOnlyKeys(value, PALETTE_KEYS, path);
  for (const key of PALETTE_KEYS) {
    if (typeof value[key] !== "string" || !HEX_COLOR.test(value[key])) {
      throw new Error(`${path}.${key} must be a six-digit hexadecimal color.`);
    }
  }
}

function validateColorSourceGroup(value, keys, path) {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  assertOnlyKeys(value, keys, path);
  for (const key of keys) {
    if (value[key] !== undefined) validateColorSource(value[key], `${path}.${key}`);
  }
}

function validateChart(value, path) {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  assertOnlyKeys(
    value,
    [
      "ipv4LineStyle",
      "ipv6LineStyle",
      "fill",
      "background",
      "backgroundOpacity",
    ],
    path,
  );
  for (const key of ["ipv4LineStyle", "ipv6LineStyle"]) {
    if (value[key] !== undefined && !LINE_STYLES.includes(value[key])) {
      throw new Error(`${path}.${key} must use a supported line style.`);
    }
  }
  validateOptionalBoolean(value.fill, `${path}.fill`);
  if (value.background !== undefined) {
    validateColorSource(value.background, `${path}.background`);
  }
  validateOptionalNumber(
    value.backgroundOpacity,
    `${path}.backgroundOpacity`,
    0,
    1,
  );
}

function validateBackground(value, path) {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  assertOnlyKeys(value, ["start", "end", "blobs"], path);
  for (const key of ["start", "end"]) {
    if (value[key] !== undefined) validateColorSource(value[key], `${path}.${key}`);
  }
  if (value.blobs === undefined) return;
  if (!isRecord(value.blobs)) throw new Error(`${path}.blobs must be an object.`);
  assertOnlyKeys(value.blobs, ["enabled", "count", "colors"], `${path}.blobs`);
  validateOptionalBoolean(value.blobs.enabled, `${path}.blobs.enabled`);
  if (
    value.blobs.count !== undefined &&
    (!Number.isInteger(value.blobs.count) ||
      value.blobs.count < 1 ||
      value.blobs.count > 5)
  ) {
    throw new Error(`${path}.blobs.count must be an integer between 1 and 5.`);
  }
  if (value.blobs.colors !== undefined) {
    if (!Array.isArray(value.blobs.colors) || value.blobs.colors.length !== 2) {
      throw new Error(`${path}.blobs.colors must contain exactly two colors.`);
    }
    value.blobs.colors.forEach((color, index) =>
      validateColorSource(color, `${path}.blobs.colors[${index}]`),
    );
  }
}

function validateCard(value, path) {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  assertOnlyKeys(
    value,
    [
      "background",
      "border",
      "separator",
      "borderEnabled",
      "shadowEnabled",
      "radius",
      "padding",
      "maxWidth",
    ],
    path,
  );
  for (const key of ["background", "border", "separator"]) {
    if (value[key] !== undefined) validateColorSource(value[key], `${path}.${key}`);
  }
  validateOptionalBoolean(value.borderEnabled, `${path}.borderEnabled`);
  validateOptionalBoolean(value.shadowEnabled, `${path}.shadowEnabled`);
  validateOptionalNumber(value.radius, `${path}.radius`, 0, 32);
  validateOptionalNumber(value.padding, `${path}.padding`, 0, 32);
  if (value.maxWidth !== undefined && !CARD_WIDTHS.includes(value.maxWidth)) {
    throw new Error(`${path}.maxWidth must use a supported width.`);
  }
}

function validateColorSource(value, path) {
  if (
    typeof value !== "string" ||
    !(
      value === "auto" ||
      PALETTE_KEYS.includes(value) ||
      HEX_COLOR.test(value)
    )
  ) {
    throw new Error(
      `${path} must be auto, a named palette color, or a hexadecimal color source.`,
    );
  }
}

function validateOptionalBoolean(value, path) {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
}

function validateOptionalNumber(value, path, minimum, maximum) {
  if (
    value !== undefined &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum)
  ) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}.`);
  }
}

function assertOnlyKeys(value, allowed, path) {
  const unknownKey = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknownKey) throw new Error(`${path}.${unknownKey} is unsupported.`);
}

function validateShortText(value, path) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
    throw new Error(`${path} must be a non-empty string with at most 80 characters.`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArguments(arguments_) {
  let themesDirectory = "themes";
  let outputPath = "dist/index.json";

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--themes") themesDirectory = arguments_[index += 1];
    else if (argument === "--output") outputPath = arguments_[index += 1];
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!themesDirectory || !outputPath) {
    throw new Error("--themes and --output require values.");
  }
  return {
    themesDirectory: resolve(themesDirectory),
    outputPath: resolve(outputPath),
  };
}

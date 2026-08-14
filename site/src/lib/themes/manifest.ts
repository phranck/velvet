/**
 * The manifest, which is everything the host knows about a theme before it
 * loads one.
 *
 * A theme describes itself in `velvet-theme.toml`: fixed keys for what it is,
 * and a `features` table for what can be set on it. The directory it sits in is
 * its name, so the file does not repeat it and the two cannot disagree.
 *
 * The rule the manifest exists to enforce is that nothing about a theme is
 * discovered by inspecting its stylesheet. Which layouts a theme supports and
 * whether it reads on a panel or in an overlay are facts about the theme, so
 * they are fields here rather than values something has to go looking for in a
 * computed style.
 *
 * A manifest is parsed rather than trusted, and it is parsed from an object
 * rather than from text. Under Bun that object comes from `Bun.TOML.parse`; in
 * a browser it comes from the generated catalogue, because neither Vite nor a
 * browser reads TOML. `parseThemeManifest` returns either the manifest or the
 * list of everything wrong with it, because a theme with two mistakes should
 * not have to be fixed twice.
 */

import { servesDataVersion, SUPPORTED_THEME_DATA_VERSIONS } from "./data.js";

/** The layouts a theme can declare support for. */
export const THEME_LAYOUTS = ["grouped", "cards"] as const;
export type ThemeLayout = (typeof THEME_LAYOUTS)[number];

/** Where a theme shows a protocol's reading. */
export const THEME_READINGS = ["panel", "overlay"] as const;
export type ThemeReadings = (typeof THEME_READINGS)[number];

/**
 * Whether a theme is still offered to somebody choosing one.
 *
 * A withdrawn theme keeps every installation already published in it, and is
 * offered to nobody new. That is what lets a theme be retired without deleting
 * the directory somebody's page is still built from.
 */
export const THEME_STATES = ["offered", "withdrawn"] as const;
export type ThemeState = (typeof THEME_STATES)[number];

/** What a feature may be set to, which is also what draws its control. */
export const FEATURE_TYPES = ["colour", "switch", "choice", "number"] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

/** The files a theme names, each relative to the theme's own directory. */
export interface ThemeEntries {
  /** Builds the markup from the data. */
  template: string;
  /** The whole appearance. */
  styles: string;
  /** Behaviour attached to the markup once it exists. */
  script: string;
}

/**
 * One thing a theme lets an operator set, with everything needed to draw its
 * control and to refuse a value it would not accept.
 *
 * The same feature carries the same key in every theme that offers it, so an
 * operator who set an accent colour on one theme finds it again on the next. A
 * feature a theme does not offer is simply absent from its manifest.
 */
export type ThemeFeature =
  | {
      key: string;
      type: "colour";
      label: string;
      /** A six-digit hex colour, which is what a colour control hands back. */
      default: string;
    }
  | { key: string; type: "switch"; label: string; default: boolean }
  | {
      key: string;
      type: "choice";
      label: string;
      default: string;
      /** Every value this may take, in the order they are offered. */
      choices: string[];
    }
  | {
      key: string;
      type: "number";
      label: string;
      default: number;
      minimum: number;
      maximum: number;
    };

/** Everything a theme says about itself. */
export interface ThemeManifest {
  /** The directory the theme lives in, which is what a configuration names. */
  id: string;
  /** The name an operator sees. */
  name: string;
  /** One line an operator reads to tell this theme from the others. */
  description: string;
  /** The period the theme belongs to, where it belongs to one. */
  era?: string;
  /** The theme's own version, so it can change without changing its name. */
  version: string;
  /** Where it stands in the list an operator chooses from, lowest first. */
  order: number;
  /** Whether it is still offered. */
  state: ThemeState;
  /** The version of the status data shape this theme understands. */
  dataVersion: number;
  /** The files the host loads. */
  entries: ThemeEntries;
  /** The layouts the theme supports; at least one. */
  layouts: ThemeLayout[];
  /** Where the theme puts a protocol's reading. */
  readings: ThemeReadings;
  /** What can be set on it, in the order it declares them. */
  features: ThemeFeature[];
}

/** Either a parsed manifest or everything that is wrong with it. */
export type ManifestResult =
  | { ok: true; manifest: ThemeManifest }
  | { ok: false; errors: string[] };

/** The file a theme describes itself in, which is what makes a directory one. */
export const MANIFEST_FILE = "velvet-theme.toml";

/** A path inside a theme: relative, no escaping, no scheme. */
const RELATIVE_PATH = /^(?!\/)(?!\w+:)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+$/;
/** An identifier: lowercase, digits and hyphens, which is also a directory name. */
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Three numbers separated by dots, which is what every other version here is. */
const SEMVER = /^\d+\.\d+\.\d+$/;
/** A colour a control can hand back and a stylesheet can take unchanged. */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
/** A feature key, which reads the way a property does rather than a directory. */
const FEATURE_KEY = /^[a-z][a-zA-Z0-9]*$/;

/** Everything a manifest may say at the top level. */
const MANIFEST_KEYS = new Set([
  "name",
  "description",
  "era",
  "version",
  "order",
  "state",
  "dataVersion",
  "entries",
  "layouts",
  "readings",
  "features",
]);

/** Everything `entries` may name. */
const ENTRY_KEYS = new Set(["template", "styles", "script"]);

/** Everything a feature may say, whatever its type. */
const FEATURE_KEYS_BY_TYPE: Record<FeatureType, Set<string>> = {
  colour: new Set(["type", "label", "default"]),
  switch: new Set(["type", "label", "default"]),
  choice: new Set(["type", "label", "default", "choices"]),
  number: new Set(["type", "label", "default", "minimum", "maximum"]),
};

/**
 * Reports every key a table carries that the format does not define.
 *
 * A manifest is the one place a mistake is silent otherwise: a misspelled key
 * is not read, the field it meant keeps its default, and the theme renders
 * almost right. Naming the key is what turns that into a stopped build.
 *
 * @param record - The table to read.
 * @param allowed - The keys the format defines for it.
 * @param label - How the table is named in a complaint.
 * @param errors - Collected complaints.
 */
function refuseUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  errors: string[],
): void {
  for (const key of Object.keys(record)) {
    if (allowed.has(key)) continue;
    errors.push(`${label} does not define "${key}"`);
  }
}

/** Reads a required string field, recording what is wrong with it. */
function stringField(
  raw: Record<string, unknown>,
  field: string,
  errors: string[],
): string {
  const value = raw[field];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be a non-empty string`);
    return "";
  }
  return value;
}

/** Reads a nested string, whilst every complaint names the whole path. */
function readNested(
  record: Record<string, unknown>,
  field: string,
  label: string,
  errors: string[],
): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label} must be a non-empty string`);
    return "";
  }
  if (!RELATIVE_PATH.test(value)) {
    errors.push(
      `${label} must be a relative path inside the theme, not "${value}"`,
    );
  }
  return value;
}

/** Whether a string is one of the layouts this host knows. */
function isLayout(value: string): value is ThemeLayout {
  return (THEME_LAYOUTS as readonly string[]).includes(value);
}

/** Whether a string is one of the two places a reading can go. */
function isReadings(value: string): value is ThemeReadings {
  return (THEME_READINGS as readonly string[]).includes(value);
}

/** Whether a string is one of the two states a theme can be in. */
function isState(value: string): value is ThemeState {
  return (THEME_STATES as readonly string[]).includes(value);
}

/** Whether a string is one of the four kinds of feature. */
function isFeatureType(value: string): value is FeatureType {
  return (FEATURE_TYPES as readonly string[]).includes(value);
}

/**
 * Turns one entry of the `features` table into a feature, or says why it cannot.
 *
 * @param key - The key the feature is declared under.
 * @param raw - What the table holds for it.
 * @param errors - Collected complaints, each naming the feature.
 * @returns The feature, or nothing where it was refused.
 */
function readFeature(
  key: string,
  raw: unknown,
  errors: string[],
): ThemeFeature | undefined {
  const label = `features.${key}`;
  if (!FEATURE_KEY.test(key)) {
    errors.push(
      `${label} must be named in lower camel case, so the same feature reads alike in every theme`,
    );
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${label} must be a table`);
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string" || !isFeatureType(type)) {
    errors.push(`${label}.type must be ${FEATURE_TYPES.join(", ")}`);
    return undefined;
  }
  refuseUnknownKeys(record, FEATURE_KEYS_BY_TYPE[type], label, errors);
  const featureLabel = stringField(record, "label", errors);
  if (featureLabel === "") {
    errors.push(`${label} must carry the label its control is drawn with`);
  }

  const fallback = record.default;
  if (type === "colour") {
    if (typeof fallback !== "string" || !HEX_COLOUR.test(fallback)) {
      errors.push(`${label}.default must be a colour such as "#6366f1"`);
      return undefined;
    }
    return { key, type, label: featureLabel, default: fallback };
  }
  if (type === "switch") {
    if (typeof fallback !== "boolean") {
      errors.push(`${label}.default must be true or false`);
      return undefined;
    }
    return { key, type, label: featureLabel, default: fallback };
  }
  if (type === "choice") {
    const choices = record.choices;
    if (
      !Array.isArray(choices) ||
      choices.length === 0 ||
      choices.some((choice) => typeof choice !== "string" || choice === "")
    ) {
      errors.push(`${label}.choices must list the values it may take`);
      return undefined;
    }
    const offered = choices as string[];
    if (typeof fallback !== "string" || !offered.includes(fallback)) {
      errors.push(`${label}.default must be one of ${offered.join(", ")}`);
      return undefined;
    }
    return { key, type, label: featureLabel, default: fallback, choices: offered };
  }
  const minimum = record.minimum;
  const maximum = record.maximum;
  if (typeof minimum !== "number" || typeof maximum !== "number") {
    errors.push(`${label} must state a minimum and a maximum`);
    return undefined;
  }
  if (minimum >= maximum) {
    errors.push(`${label}.minimum must be below its maximum`);
    return undefined;
  }
  if (typeof fallback !== "number") {
    errors.push(`${label}.default must be a number`);
    return undefined;
  }
  if (fallback < minimum || fallback > maximum) {
    errors.push(
      `${label}.default must lie between ${minimum} and ${maximum}, not ${fallback}`,
    );
    return undefined;
  }
  return { key, type, label: featureLabel, default: fallback, minimum, maximum };
}

/**
 * Turns whatever was in `velvet-theme.toml` into a manifest, or says why it
 * cannot.
 *
 * @param raw - The parsed contents of a manifest file.
 * @param id - The directory the theme lives in, which is its name.
 * @returns The manifest, or every complaint about it at once.
 */
export function parseThemeManifest(raw: unknown, id: string): ManifestResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["the manifest must be a table"] };
  }
  if (!IDENTIFIER.test(id)) {
    errors.push(
      `the directory must be lowercase words joined by hyphens, not "${id}"`,
    );
  }
  const record = raw as Record<string, unknown>;
  refuseUnknownKeys(record, MANIFEST_KEYS, "the manifest", errors);

  const name = stringField(record, "name", errors);
  const description = stringField(record, "description", errors);
  const version = stringField(record, "version", errors);
  if (version !== "" && !SEMVER.test(version)) {
    errors.push(`version must be major.minor.patch, not "${version}"`);
  }

  const order = record.order;
  if (typeof order !== "number" || !Number.isInteger(order) || order < 1) {
    errors.push("order must be a whole number from one upwards");
  }

  const state = record.state;
  if (typeof state !== "string" || !isState(state)) {
    errors.push(`state must be ${THEME_STATES.join(" or ")}`);
  }

  const dataVersion = record.dataVersion;
  if (typeof dataVersion !== "number" || !Number.isInteger(dataVersion)) {
    errors.push("dataVersion must be an integer");
  } else if (!servesDataVersion(dataVersion)) {
    errors.push(
      `dataVersion ${dataVersion} is not served; this host serves ${SUPPORTED_THEME_DATA_VERSIONS.join(", ")}`,
    );
  }

  const entriesRaw = record.entries;
  const entries: ThemeEntries = { template: "", styles: "", script: "" };
  if (typeof entriesRaw !== "object" || entriesRaw === null) {
    errors.push("entries must name a template, a stylesheet and a script");
  } else {
    // Read under the leaf name whilst every complaint names the whole path, so
    // a message points at the line somebody has to edit.
    const entryRecord = entriesRaw as Record<string, unknown>;
    refuseUnknownKeys(entryRecord, ENTRY_KEYS, "entries", errors);
    entries.template = readNested(entryRecord, "template", "entries.template", errors);
    entries.styles = readNested(entryRecord, "styles", "entries.styles", errors);
    entries.script = readNested(entryRecord, "script", "entries.script", errors);
  }

  const layoutsRaw = record.layouts;
  const layouts: ThemeLayout[] = [];
  if (!Array.isArray(layoutsRaw) || layoutsRaw.length === 0) {
    errors.push("layouts must list at least one supported layout");
  } else {
    for (const entry of layoutsRaw) {
      if (typeof entry !== "string" || !isLayout(entry)) {
        errors.push(
          `layouts may only contain ${THEME_LAYOUTS.join(" or ")}, not ${JSON.stringify(entry)}`,
        );
        continue;
      }
      if (layouts.includes(entry)) {
        errors.push(`layouts names ${entry} twice`);
        continue;
      }
      layouts.push(entry);
    }
  }

  const readingsRaw = record.readings;
  if (typeof readingsRaw !== "string" || !isReadings(readingsRaw)) {
    errors.push(`readings must be ${THEME_READINGS.join(" or ")}`);
  }

  const featuresRaw = record.features ?? {};
  const features: ThemeFeature[] = [];
  if (
    typeof featuresRaw !== "object" ||
    featuresRaw === null ||
    Array.isArray(featuresRaw)
  ) {
    errors.push("features must be a table, or absent where a theme offers none");
  } else {
    for (const [key, value] of Object.entries(featuresRaw)) {
      const feature = readFeature(key, value, errors);
      if (feature) features.push(feature);
    }
  }

  const era = record.era;
  if (era !== undefined && (typeof era !== "string" || era.trim() === "")) {
    errors.push("era, where it is given, must be a non-empty string");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    manifest: {
      id,
      name,
      description,
      ...(typeof era === "string" ? { era } : {}),
      version,
      order: order as number,
      state: state as ThemeState,
      dataVersion: dataVersion as number,
      entries,
      layouts,
      readings: readingsRaw as ThemeReadings,
      features,
    },
  };
}

/** Every file a manifest names, in the order the host loads them. */
export function manifestFiles(manifest: ThemeManifest): string[] {
  return [
    manifest.entries.template,
    manifest.entries.styles,
    manifest.entries.script,
  ];
}

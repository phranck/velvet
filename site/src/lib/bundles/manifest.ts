/**
 * The manifest, which is everything the host knows about a bundle before it
 * loads one.
 *
 * The rule the manifest exists to enforce is that nothing about a design is
 * discovered by inspecting its stylesheet. Two hacks in the mockups did exactly
 * that: the toolbar read `--layout-cards` out of the computed style to decide
 * which layout buttons to offer, and the page read `--service-display-display`
 * to decide whether a reading went into a panel or into an overlay. Both are
 * facts about a design, both were kept in a place meant for values, and both
 * are fields here instead.
 *
 * A manifest is parsed rather than trusted. `parseBundleManifest` returns either
 * the manifest or the list of everything wrong with it, because a design with
 * two mistakes should not have to be fixed twice.
 */

import { servesDataVersion, SUPPORTED_BUNDLE_DATA_VERSIONS } from "./data.js";

/** The layouts a design can declare support for. */
export const BUNDLE_LAYOUTS = ["grouped", "cards"] as const;
export type BundleLayout = (typeof BUNDLE_LAYOUTS)[number];

/** Where a design shows a protocol's reading. */
export const BUNDLE_READINGS = ["panel", "overlay"] as const;
export type BundleReadings = (typeof BUNDLE_READINGS)[number];

/** The files a bundle names, each relative to the bundle's own directory. */
export interface BundleEntries {
  /** Builds the markup from the data. */
  template: string;
  /** The whole appearance. */
  styles: string;
  /** Behaviour attached to the markup once it exists. */
  script: string;
}

/** A plugin a bundle uses, named with the major version it was written against. */
export interface BundlePluginUse {
  name: string;
  version: number;
}

export interface BundleManifest {
  /** Matches the directory name, so a bundle cannot be renamed by half. */
  id: string;
  /** The name an operator sees. */
  name: string;
  /** One line an operator reads to tell this design from the others. */
  description: string;
  /** The period the design belongs to, where it belongs to one. */
  era?: string;
  /** The bundle's own version, so a design can change without changing its name. */
  version: string;
  /** The version of the status data shape this design understands. */
  dataVersion: number;
  /** The files the host loads. */
  entries: BundleEntries;
  /** The layouts the design supports; at least one. */
  layouts: BundleLayout[];
  /** Where the design puts a protocol's reading. */
  readings: BundleReadings;
  /** A picture of the design, relative to the bundle directory. */
  preview: string;
  /** The plugins the design uses, each with the major version it expects. */
  plugins: BundlePluginUse[];
}

/** Either a parsed manifest or everything that is wrong with it. */
export type ManifestResult =
  | { ok: true; manifest: BundleManifest }
  | { ok: false; errors: string[] };

/** A path inside a bundle: relative, no escaping, no scheme. */
const RELATIVE_PATH = /^(?!\/)(?!\w+:)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+$/;
/** An identifier: lowercase, digits and hyphens, which is also a directory name. */
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Three numbers separated by dots, which is what every other version here is. */
const SEMVER = /^\d+\.\d+\.\d+$/;

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

/** Reads a path field and checks it stays inside the bundle. */
function pathField(
  raw: Record<string, unknown>,
  field: string,
  errors: string[],
): string {
  const value = stringField(raw, field, errors);
  if (value !== "" && !RELATIVE_PATH.test(value)) {
    errors.push(
      `${field} must be a relative path inside the bundle, not "${value}"`,
    );
  }
  return value;
}

/**
 * Turns whatever was in `bundle.json` into a manifest, or says why it cannot.
 *
 * @param raw - The parsed contents of a manifest file.
 * @returns The manifest, or every complaint about it at once.
 */
export function parseBundleManifest(raw: unknown): ManifestResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["the manifest must be a JSON object"] };
  }
  const record = raw as Record<string, unknown>;

  const id = stringField(record, "id", errors);
  if (id !== "" && !IDENTIFIER.test(id)) {
    errors.push(`id must be lowercase words joined by hyphens, not "${id}"`);
  }
  const name = stringField(record, "name", errors);
  const description = stringField(record, "description", errors);
  const version = stringField(record, "version", errors);
  if (version !== "" && !SEMVER.test(version)) {
    errors.push(`version must be major.minor.patch, not "${version}"`);
  }

  const dataVersion = record.dataVersion;
  if (typeof dataVersion !== "number" || !Number.isInteger(dataVersion)) {
    errors.push("dataVersion must be an integer");
  } else if (!servesDataVersion(dataVersion)) {
    errors.push(
      `dataVersion ${dataVersion} is not served; this host serves ${SUPPORTED_BUNDLE_DATA_VERSIONS.join(", ")}`,
    );
  }

  const entriesRaw = record.entries;
  const entries: BundleEntries = { template: "", styles: "", script: "" };
  if (typeof entriesRaw !== "object" || entriesRaw === null) {
    errors.push("entries must name a template, a stylesheet and a script");
  } else {
    // Read under the leaf name whilst every complaint names the whole path, so
    // a message points at the line somebody has to edit.
    const entryRecord = entriesRaw as Record<string, unknown>;
    entries.template = readNested(entryRecord, "template", "entries.template", errors);
    entries.styles = readNested(entryRecord, "styles", "entries.styles", errors);
    entries.script = readNested(entryRecord, "script", "entries.script", errors);
  }

  const layoutsRaw = record.layouts;
  const layouts: BundleLayout[] = [];
  if (!Array.isArray(layoutsRaw) || layoutsRaw.length === 0) {
    errors.push("layouts must list at least one supported layout");
  } else {
    for (const entry of layoutsRaw) {
      if (typeof entry !== "string" || !isLayout(entry)) {
        errors.push(
          `layouts may only contain ${BUNDLE_LAYOUTS.join(" or ")}, not ${JSON.stringify(entry)}`,
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
    errors.push(`readings must be ${BUNDLE_READINGS.join(" or ")}`);
  }

  const preview = pathField(record, "preview", errors);

  const pluginsRaw = record.plugins ?? [];
  const plugins: BundlePluginUse[] = [];
  if (!Array.isArray(pluginsRaw)) {
    errors.push("plugins must be a list, or absent where a bundle uses none");
  } else {
    for (const entry of pluginsRaw) {
      if (typeof entry !== "object" || entry === null) {
        errors.push("every plugin must name itself and the version it expects");
        continue;
      }
      const pluginRecord = entry as Record<string, unknown>;
      const pluginName = pluginRecord.name;
      const pluginVersion = pluginRecord.version;
      if (typeof pluginName !== "string" || !IDENTIFIER.test(pluginName)) {
        errors.push(
          `a plugin name must be lowercase words joined by hyphens, not ${JSON.stringify(pluginName)}`,
        );
        continue;
      }
      if (typeof pluginVersion !== "number" || !Number.isInteger(pluginVersion)) {
        errors.push(`plugin ${pluginName} must name an integer version`);
        continue;
      }
      if (plugins.some((used) => used.name === pluginName)) {
        errors.push(`plugins names ${pluginName} twice`);
        continue;
      }
      plugins.push({ name: pluginName, version: pluginVersion });
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
      dataVersion: dataVersion as number,
      entries,
      layouts,
      readings: readingsRaw as BundleReadings,
      preview,
      plugins,
    },
  };
}

/** Reads one nested path field, complaining under its full name. */
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
      `${label} must be a relative path inside the bundle, not "${value}"`,
    );
    return "";
  }
  return value;
}

function isLayout(value: string): value is BundleLayout {
  return (BUNDLE_LAYOUTS as readonly string[]).includes(value);
}

function isReadings(value: string): value is BundleReadings {
  return (BUNDLE_READINGS as readonly string[]).includes(value);
}

/** Every file a manifest names, in the order the host loads them. */
export function manifestFiles(manifest: BundleManifest): string[] {
  return [
    manifest.entries.template,
    manifest.entries.styles,
    manifest.entries.script,
    manifest.preview,
  ];
}

/**
 * Checking what an operator set on a theme against what that theme offers.
 *
 * `statusPage.themeSettings` carries the values as a flat mapping of feature key
 * to value. The schema cannot check them, because which keys exist and what they
 * may take is the named theme's answer and the name is only known once the
 * configuration has been read.
 *
 * The feature table is handed in rather than fetched, so this package needs no
 * TOML parser and the same check runs at both ends: the build reads the table
 * with `Bun.TOML.parse`, and a browser reads it out of the generated catalogue.
 */

/** What a feature may be set to, which decides how a value is checked. */
export type ThemeFeatureType =
  | "colour"
  | "switch"
  | "choice"
  | "number"
  | "arrangement";

/**
 * One feature as this check needs to see it.
 *
 * A structural subset of what a theme's manifest declares, so a caller can hand
 * the manifest's own features over unchanged.
 */
export interface ThemeFeatureShape {
  key: string;
  type: ThemeFeatureType;
  /**
   * What a choice may be set to, each with what it is called.
   *
   * The label is nothing to this check and everything to whoever offers the
   * choice: the values are CSS, and a list of lengths is no answer to
   * "narrow, ordinary, wide".
   */
  choices?: readonly { value: string; label: string }[];
  minimum?: number;
  maximum?: number;
}

/** A value an operator set, as YAML hands it over. */
export type ThemeSettingValue = string | number | boolean;

/** What is wrong with one setting, and which one. */
export interface ThemeSettingProblem {
  /** The feature key, as it stands in the configuration. */
  key: string;
  /** What is wrong, in a sentence an operator can act on. */
  message: string;
}

/** A six-digit hex colour, which is what a colour feature takes. */
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Places, separated by semicolons, each a pair of lengths or percentages. */
const ARRANGEMENT = /^-?[\d.]+%? -?[\d.]+%?(;-?[\d.]+%? -?[\d.]+%?)*$/u;

/**
 * Checks every set value against the theme that offers the features.
 *
 * Reports every fault rather than the first, because a configuration with two
 * mistakes should not have to be fixed twice.
 *
 * @param settings - What the configuration set, keyed by feature.
 * @param features - What the named theme offers.
 * @returns One problem per fault, empty where every value is accepted.
 */
export function checkThemeSettings(
  settings: Readonly<Record<string, ThemeSettingValue>>,
  features: readonly ThemeFeatureShape[],
): ThemeSettingProblem[] {
  const problems: ThemeSettingProblem[] = [];
  const offered = new Map(features.map((feature) => [feature.key, feature]));

  for (const [key, value] of Object.entries(settings)) {
    const feature = offered.get(key);
    if (!feature) {
      const names = [...offered.keys()].sort();
      problems.push({
        key,
        message:
          names.length === 0
            ? `this theme offers nothing to set, and "${key}" was set on it`
            : `this theme has no setting called "${key}"; it offers ${names.join(", ")}`,
      });
      continue;
    }
    const problem = checkOne(feature, value);
    if (problem) problems.push({ key, message: problem });
  }
  return problems;
}

/**
 * Checks one value against the feature it was set on.
 *
 * @param feature - The feature the theme offers.
 * @param value - What the configuration set.
 * @returns What is wrong with it, or null where it is accepted.
 */
function checkOne(
  feature: ThemeFeatureShape,
  value: ThemeSettingValue,
): string | null {
  if (feature.type === "colour") {
    return typeof value === "string" && HEX_COLOUR.test(value)
      ? null
      : `must be a colour such as "#6366f1"`;
  }
  if (feature.type === "switch") {
    return typeof value === "boolean" ? null : "must be true or false";
  }
  if (feature.type === "choice") {
    const choices = (feature.choices ?? []).map((choice) => choice.value);
    return typeof value === "string" && choices.includes(value)
      ? null
      : `must be one of ${choices.join(", ")}`;
  }
  if (feature.type === "arrangement") {
    // What reaches a stylesheet is constrained rather than trusted: lengths,
    // percentages and the spaces between them, and nothing else. The bound on
    // the whole is what keeps a configuration from carrying a page of it.
    return typeof value === "string" &&
      value.length <= 240 &&
      ARRANGEMENT.test(value)
      ? null
      : 'must be places such as "12% 0%;88% 4%"';
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "must be a number";
  }
  const minimum = feature.minimum ?? Number.NEGATIVE_INFINITY;
  const maximum = feature.maximum ?? Number.POSITIVE_INFINITY;
  return value >= minimum && value <= maximum
    ? null
    : `must lie between ${minimum} and ${maximum}, not ${value}`;
}

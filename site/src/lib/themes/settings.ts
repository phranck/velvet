/**
 * What a theme is published with, as the custom properties it reads.
 *
 * A theme names one custom property per feature and reads it without a
 * fallback, because a fallback in the stylesheet would be a second answer to
 * what the manifest already states. Everything that renders a theme writes this
 * block instead: the build, the gallery, the preview and the conformance suite.
 * That is what makes a theme look the same wherever it is drawn.
 *
 * Every feature is written whether or not it was set, so a page never depends on
 * a property nobody declared.
 */

import type { ThemeFeature } from "./manifest.js";

/** What an operator set, keyed by the feature it belongs to. */
export type ThemeSettings = Readonly<Record<string, string | number | boolean>>;

/**
 * The value one feature is published with.
 *
 * @param feature - The feature the theme offers.
 * @param settings - What the configuration set, already checked.
 * @returns What its custom property reads.
 */
function valueOf(feature: ThemeFeature, settings: ThemeSettings): string {
  const given = settings[feature.key];
  if (feature.type === "switch") {
    const on = typeof given === "boolean" ? given : feature.default;
    return on ? feature.on : feature.off;
  }
  if (feature.type === "number") {
    const value = typeof given === "number" ? given : feature.default;
    return `${value}${feature.unit}`;
  }
  return typeof given === "string" ? given : feature.default;
}

/**
 * Every feature as a declaration, in the order the theme declares them.
 *
 * @param features - What the theme offers.
 * @param settings - What the configuration set, already checked.
 * @returns One `--property: value;` per feature.
 */
export function themeSettingDeclarations(
  features: readonly ThemeFeature[],
  settings: ThemeSettings = {},
): string[] {
  return features.map(
    (feature) => `${feature.property}: ${valueOf(feature, settings)};`,
  );
}

/**
 * The declarations as a style element, ready to put in a document's head.
 *
 * On `:root` rather than on the theme's own element, because a theme reads these
 * with `var()` and never declares them itself, so there is nothing further down
 * to override.
 *
 * @param features - What the theme offers.
 * @param settings - What the configuration set, already checked.
 * @returns A style element, or an empty string where the theme offers nothing.
 */
export function themeSettingsStyle(
  features: readonly ThemeFeature[],
  settings: ThemeSettings = {},
): string {
  const declarations = themeSettingDeclarations(features, settings);
  if (declarations.length === 0) return "";
  return `<style>:root { ${declarations.join(" ")} }</style>`;
}

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
  // An arrangement is written property by property by the caller, because one
  // of them is several values and this answers with one.
  if (feature.type === "arrangement") return "";
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
 * A feature the theme states itself is written only where somebody set it.
 * Writing its default as well would put a value in front of whatever the theme
 * decides otherwise, and a palette that moves a dozen colours would be
 * overruled by the defaults of the three the operator can also set.
 *
 * Everything else is written whether or not it was set, because the theme
 * reads it without a fallback and an unwritten property leaves the page with
 * nothing at all.
 *
 * @param features - What the theme offers.
 * @param settings - What the configuration set, already checked.
 * @returns One `--property: value;` per feature that has something to say.
 */
export function themeSettingDeclarations(
  features: readonly ThemeFeature[],
  settings: ThemeSettings = {},
): string[] {
  return features
    .filter(
      (feature) => !feature.declared || settings[feature.key] !== undefined,
    )
    .flatMap((feature) => {
      if (feature.type === "arrangement") {
        const given = settings[feature.key];
        const places = (typeof given === "string" ? given : feature.default)
          .split(";");
        // One property per place, in the order the theme states them. A value
        // short of the properties leaves the rest to the theme, which is what
        // an older configuration written against fewer of them looks like.
        return feature.properties
          .map((property, index) =>
            places[index] === undefined
              ? ""
              : `${property}: ${places[index]};`,
          )
          .filter((declaration) => declaration !== "");
      }
      return [`${feature.property}: ${valueOf(feature, settings)};`];
    });
}

/**
 * The declarations as a style element, ready to put in a document's head.
 *
 * Written twice, onto two elements, because the two things a theme does with
 * these properties need them in two places.
 *
 * **On the theme's own root**, which is what a theme *reads*. A theme declares
 * the same properties there itself, as its own defaults and in whatever a
 * palette changes, and a value inherited from an ancestor loses to a
 * declaration on the element itself however specific it is. At the same
 * element and after the theme's stylesheet, an operator's value wins over
 * both.
 *
 * **On the document's root**, which is what a theme can *query*. A style query
 * reads the nearest ancestor container and never the element itself, so a
 * theme keying a block on one of these values needs it above the element that
 * block styles.
 *
 * Written rather than reasoned about per feature: which of the two a property
 * is for is the theme's business, and one block that covers both costs a
 * duplicate line and no decision.
 *
 * @param root - The theme's root element, as its manifest states it.
 * @param features - What the theme offers.
 * @param settings - What the configuration set, already checked.
 * @returns A style element, or an empty string where the theme offers nothing.
 */
export function themeSettingsStyle(
  root: string,
  features: readonly ThemeFeature[],
  settings: ThemeSettings = {},
): string {
  const declarations = themeSettingDeclarations(features, settings).join(" ");
  if (declarations === "") return "";
  return `<style>:root { ${declarations} } ${root} { ${declarations} }</style>`;
}

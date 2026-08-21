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
 * What the page decides for every theme rather than any theme for itself.
 *
 * A page setting is about what the page reports; a feature is about how one
 * theme draws it. This is written into the same block as the features, so a
 * theme reads it exactly as it reads its own and needs no fallback either.
 */
export interface PageSettings {
  /** Whether the response-time chart is shown under each service. */
  responseChart: boolean;
}

/**
 * The custom property each page setting is published as.
 *
 * Named here rather than at each theme, so four stylesheets cannot disagree
 * about what the property is called.
 */
export const RESPONSE_CHART_DISPLAY = "--velvet-response-chart-display";

/**
 * The properties a theme hides its chart and everything reaching it by.
 *
 * One per element rather than one for all of them, because what each is laid
 * out as when shown differs and only the theme knows it. A theme declares the
 * ones it has and reads them without a fallback; the page setting overrules
 * them all to `none` and states nothing otherwise.
 *
 * A theme whose service panel carries more than the chart declares only the
 * first, because its panel is still worth opening with the chart gone.
 */
export const RESPONSE_CHART_PROPERTIES = [
  RESPONSE_CHART_DISPLAY,
  "--velvet-response-open-display",
  "--velvet-response-toggle-display",
] as const;

/**
 * Every page setting that has something to say, as a declaration.
 *
 * Only what is switched off. What a shown chart is laid out as differs between
 * themes, and only the theme knows it, so each declares this property itself
 * and the page setting overrules it to hide the chart. Writing a value for the
 * shown case here would mean deciding one layout for every theme.
 *
 * @param page - What the page decided, already resolved to its defaults.
 * @returns One `--property: value;` per page setting that changes something.
 */
export function pageSettingDeclarations(page: PageSettings): string[] {
  if (page.responseChart) return [];
  return RESPONSE_CHART_PROPERTIES.map((property) => `${property}: none;`);
}

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
  page: PageSettings = { responseChart: true },
): string {
  const declarations = [
    ...pageSettingDeclarations(page),
    ...themeSettingDeclarations(features, settings),
  ].join(" ");
  if (declarations === "") return "";
  return `<style>:root { ${declarations} } ${root} { ${declarations} }</style>`;
}

/**
 * The window a page opens in, as a page reads it.
 *
 * A configuration names it `30d`, `90d`, or `all`, and a page reads `month`,
 * `quarter`, or `all`. `scripts/generate-config.mjs` translates the same pair
 * for a published page and carries a few older labels besides; this is here
 * because the configurator has to hand the monitor what a page reads and
 * cannot import that script.
 */
export const PAGE_RANGE_KEYS: Readonly<Record<string, string>> = {
  "30d": "month",
  "90d": "quarter",
  all: "all",
};

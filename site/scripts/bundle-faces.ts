/**
 * Which typeface each design carries.
 *
 * Stated here rather than read out of a stylesheet, because a `@font-face`
 * names a file that has to exist before the stylesheet is read, and a list
 * derived from the thing it is meant to produce cannot catch a face nobody
 * copied.
 *
 * Held in a file of its own rather than beside the script that copies them,
 * because two things read it: `bundle-fonts.ts` to do the copying, and
 * `test/third-party-notices.test.ts` to check that every face named here is
 * credited and that nothing is credited which no design carries. That test
 * exists because Tangerine was removed from Cassette on 2026-08-12 whilst its
 * dependency and its notice stayed, and the notice is copied into every
 * installation.
 */

/** One face, and the weights a design asks for. */
export interface Face {
  /** The `@fontsource` package, without the scope. */
  package: string;
  /** The family name the design's stylesheet writes. */
  family: string;
  /** The weights to copy, as the numbers the package names its files with. */
  weights: number[];
  /** Whether the italic of each weight is copied as well. */
  italic?: number[];
}

/** What each design carries, keyed by the bundle directory. */
export const BUNDLES: Record<string, Face[]> = {
  velvet: [
    { package: "inter", family: "Inter", weights: [400, 500, 600, 700] },
    { package: "fira-code", family: "Fira Code", weights: [400, 600] },
    { package: "plaster", family: "Plaster", weights: [400] },
  ],
  cassette: [
    { package: "atomic-age", family: "Atomic Age", weights: [400] },
    { package: "audiowide", family: "Audiowide", weights: [400] },
    { package: "doto", family: "Doto", weights: [400, 600, 700] },
    {
      package: "ibm-plex-mono",
      family: "IBM Plex Mono",
      weights: [400, 500, 600],
      italic: [400],
    },
    { package: "monoton", family: "Monoton", weights: [400] },
    { package: "plaster", family: "Plaster", weights: [400] },
  ],
  "twenty-forty-nine": [
    { package: "rajdhani", family: "Rajdhani", weights: [300, 400, 500, 600, 700] },
    { package: "share-tech-mono", family: "Share Tech Mono", weights: [400] },
    { package: "plaster", family: "Plaster", weights: [400] },
  ],
  "ncc-1701-d": [
    { package: "antonio", family: "Antonio", weights: [400, 600, 700] },
    { package: "jura", family: "Jura", weights: [400, 500, 600, 700] },
    { package: "plaster", family: "Plaster", weights: [400] },
  ],
};

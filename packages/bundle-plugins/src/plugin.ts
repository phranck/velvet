/**
 * What a plugin is, and what it is not.
 *
 * Bundles are redundant by design and each works on its own. Some things are
 * still worth sharing — a canvas that draws a month of days without costing
 * ninety elements, the arithmetic behind a response curve, a panel that animates
 * its own height, a floating reading that no `clip-path` can cut — and those are
 * offered here. A bundle may use one. A bundle that uses none is complete.
 *
 * **A plugin owns behaviour, never markup.** It draws into an element a bundle
 * gives it, or answers a question a bundle asks. It never assumes what the page
 * around it looks like, never selects an element it was not handed, and never
 * declares a style outside the element it was given. Everything it draws is
 * described by options the bundle passes, so two designs using the same plugin
 * do not have to look alike.
 *
 * **A plugin is versioned by a whole number.** A design names the version it was
 * written against in its manifest, and the host refuses a bundle that names a
 * version this package no longer offers. The number rises when a change would
 * make a design that used the previous version render something else: an option
 * removed or renamed, a default changed, or a drawing rule reversed. Adding an
 * option with a default that preserves what already happened does not raise it.
 *
 * That is the whole of the mechanism. It exists because a plugin changing under
 * a design that has been published for a year is exactly what "shared code"
 * used to mean here, and the property contract is what came of it.
 */

/** The name a manifest uses for each plugin. */
export const PLUGIN_NAMES = [
  "uptime-strip",
  "response-chart",
  "disclosure",
  "overlay",
] as const;

export type PluginName = (typeof PLUGIN_NAMES)[number];

/**
 * The version each plugin currently offers.
 *
 * The host reads this to decide whether a bundle's manifest can be served. A
 * plugin's own module exports the same number, so the two cannot disagree
 * without the gate in `packages/bundle-plugins/test/versions.test.ts` saying so.
 */
export const PLUGIN_VERSIONS: Record<PluginName, number> = {
  "uptime-strip": 1,
  "response-chart": 1,
  disclosure: 1,
  overlay: 1,
};

/** Whether a name is one of the plugins this package offers. */
export function isPluginName(name: string): name is PluginName {
  return (PLUGIN_NAMES as readonly string[]).includes(name);
}

/**
 * Whether a plugin can be served at the version a manifest asks for.
 *
 * @param name - The plugin a bundle named.
 * @param version - The major version it was written against.
 * @returns Why it cannot be served, or null where it can.
 */
export function pluginProblem(name: string, version: number): string | null {
  if (!isPluginName(name)) {
    return `there is no plugin called "${name}"`;
  }
  const offered = PLUGIN_VERSIONS[name];
  if (offered !== version) {
    return `plugin "${name}" is at version ${offered}, and this design was written against ${version}`;
  }
  return null;
}

/**
 * What somebody has changed and not yet published, kept in their browser.
 *
 * Nothing here reaches the operator's repository. A draft is what the
 * configurator is showing, and publishing it is a separate act with its own
 * button, so leaving the page or reloading it must not lose the work and must
 * not change the page either.
 *
 * Kept per installation, because somebody who configures two pages is
 * configuring two different things, and per theme within one, because the same
 * key means something else in another theme or nothing at all. Returning to a
 * theme that was already adjusted therefore finds its values again.
 */

import { remember, remembered } from "./remembered.js";

/** Where the drafts live, beside whatever else this browser holds. */
const STORAGE_KEY = "velvet:configurator:drafts";

/** What one feature can be set to, which is what a theme's manifest allows. */
export type DraftValue = string | number | boolean;

/** One installation's unpublished state. */
export interface InstallationDraft {
  /**
   * The theme being shown, or none chosen since this page was last published.
   *
   * Null rather than the published theme, so the two are told apart: nothing
   * chosen means the configurator opens on whatever the page carries today,
   * and that is read from the service rather than remembered here.
   */
  theme: string | null;
  /** What is set on each theme, keyed by theme and then by feature. */
  settings: Record<string, Record<string, DraftValue>>;
}

/** An installation nobody has changed anything on. */
export function emptyDraft(): InstallationDraft {
  return { theme: null, settings: {} };
}

/**
 * Reads what is stored, dropping anything that is not usable.
 *
 * Every value is checked rather than trusted. What is stored survives a
 * release, so it can carry a theme this Velvet no longer ships or a feature
 * shaped the way an older version wrote it.
 *
 * @param stored - Whatever was in storage.
 * @returns One draft per installation, by repository.
 */
function interpret(stored: unknown): Record<string, InstallationDraft> {
  if (typeof stored !== "object" || stored === null) return {};
  const drafts: Record<string, InstallationDraft> = {};
  for (const [repository, value] of Object.entries(
    stored as Record<string, unknown>,
  )) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const settings: Record<string, Record<string, DraftValue>> = {};
    if (typeof record.settings === "object" && record.settings !== null) {
      for (const [theme, values] of Object.entries(
        record.settings as Record<string, unknown>,
      )) {
        if (typeof values !== "object" || values === null) continue;
        const kept: Record<string, DraftValue> = {};
        for (const [key, one] of Object.entries(
          values as Record<string, unknown>,
        )) {
          if (
            typeof one === "string" ||
            typeof one === "number" ||
            typeof one === "boolean"
          ) {
            kept[key] = one;
          }
        }
        settings[theme] = kept;
      }
    }
    drafts[repository] = {
      theme: typeof record.theme === "string" ? record.theme : null,
      settings,
    };
  }
  return drafts;
}

/**
 * What is unpublished for one installation.
 *
 * @param repository - The repository's identifier, as the listing carries it.
 * @returns Its draft, empty where there is none.
 */
export function readDraft(repository: string): InstallationDraft {
  return remembered(STORAGE_KEY, interpret)[repository] ?? emptyDraft();
}

/**
 * Writes one installation's draft back, leaving every other one alone.
 *
 * Read and written whole, because two installations are configured one at a
 * time and the cost of carrying the others through one write is nothing beside
 * the cost of losing them.
 *
 * @param repository - The repository's identifier.
 * @param draft - What to keep for it.
 */
export function writeDraft(repository: string, draft: InstallationDraft): void {
  remember(STORAGE_KEY, {
    ...remembered(STORAGE_KEY, interpret),
    [repository]: draft,
  });
}

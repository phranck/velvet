import type { VelvetConfig } from "./config";
import type {
  IncidentsDocument,
  RangeKey,
  ResponseTimesDocument,
  StatusDocument,
} from "./types";

/** Where the prerendered state is written into the published document. */
export const INITIAL_STATE_ELEMENT_ID = "velvet-initial-state";

/**
 * Everything the build already knew, handed to the page it published.
 *
 * A status page is opened when something is already broken, often over a
 * connection that is part of what is broken, so it renders at build time rather
 * than fetching three documents before it can say anything. The build has all
 * of it: the page is rebuilt whenever the data changes, which is what the
 * pipeline does anyway.
 *
 * This is also the contract hydration rests on. The browser starts from exactly
 * these values, because a first client render that computed better ones would
 * disagree with the markup it is meant to adopt.
 *
 * Formatted times are not carried here. They are derived from the locale in
 * `locale.svelte.ts`, which holds the build's locale until hydration has
 * finished, so both renders produce the same string without passing it along.
 *
 * @property config - The configuration the build read, already normalised.
 * @property status - Service availability as of the build.
 * @property responseTimes - Response samples as of the build.
 * @property incidents - Incidents and maintenance as of the build.
 * @property range - The range the markup was rendered for, which is the
 *   configured default. A visitor's own choice lives in `localStorage`, which
 *   a build cannot read, so it is applied after hydration instead.
 */
export interface VelvetInitialState {
  config: VelvetConfig;
  status: StatusDocument;
  responseTimes: ResponseTimesDocument;
  incidents: IncidentsDocument;
  range: RangeKey;
}

/**
 * Reads the state the build wrote into the document.
 *
 * @param document - The document to read it from.
 * @returns The prerendered state, or undefined where the page carries none,
 *   which is every page built before this existed and any served without a
 *   prerender. The caller then loads everything itself, as it always did.
 */
export function readInitialState(
  document: Document,
): VelvetInitialState | undefined {
  const element = document.getElementById(INITIAL_STATE_ELEMENT_ID);
  if (!element?.textContent) return undefined;
  try {
    return JSON.parse(element.textContent) as VelvetInitialState;
  } catch {
    // A document whose state cannot be read is not a document to fail on: the
    // page can still fetch everything itself, which is what it did before.
    return undefined;
  }
}

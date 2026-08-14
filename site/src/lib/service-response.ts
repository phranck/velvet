/**
 * Reading an answer from the setup service, for the applications it hosts.
 *
 * The onboarding and the configurator both talk to the same origin and both
 * have to survive an answer that is not what they asked for. Stated once here
 * rather than in each, because a bound written twice is a bound that drifts,
 * and the one that drifts upwards is the one that stops bounding anything.
 */

/**
 * The largest answer either application reads into memory.
 *
 * Every response they ask for is a small JSON document: a session, a listing,
 * a status. This is far above any of them and far below what an answer would
 * have to reach to matter, which is the point. A caller that decides how much
 * the browser allocates is a caller deciding something it should not.
 */
export const MAX_RESPONSE_BYTES = 256 * 1_024;

/**
 * Reads a JSON body, refusing one that is oversized or not JSON at all.
 *
 * The declared length is checked first so an oversized answer is refused
 * before it is read, and the actual length afterwards because the header is
 * the sender's claim rather than a fact.
 *
 * @param response - The answer, whose body has not been read yet.
 * @param failure - Thrown on any refusal, so each application reports this in
 *   its own vocabulary rather than leaking one shared error code into both.
 * @returns The parsed body, still unvalidated. Whoever asked holds it against
 *   its contract.
 */
export async function readJsonResponse(
  response: Response,
  failure: () => Error,
): Promise<unknown> {
  if (!response.body) throw failure();
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw failure();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw failure();
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw failure();
  }
}

/**
 * Leaves the page for another address.
 *
 * A function rather than a call, so a test can watch where an application
 * would have gone instead of following it there.
 *
 * @param url - Where to go, same-origin or a GitHub address the caller has
 *   already checked.
 */
export function browserNavigate(url: string): void {
  if (!globalThis.location) throw new Error("Navigation needs a browser.");
  globalThis.location.assign(url);
}

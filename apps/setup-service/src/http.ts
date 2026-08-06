/**
 * Request and response helpers shared by every route of the service.
 *
 * They exist as one module so that a body limit or a caching header is decided
 * once. A second copy of either is how one route quietly stops enforcing what
 * the others do.
 */
import { MAX_SETUP_REQUEST_BYTES } from "@velvet/contracts";

/**
 * Largest request body any route accepts.
 *
 * Read from the contract rather than stated here, because the browser sizes a
 * logo against the same number. Two copies drift, and the way that drift
 * surfaces is a file the field accepted and this then refused.
 */
export const MAX_REQUEST_BYTES = MAX_SETUP_REQUEST_BYTES;

/** Thrown when a body exceeds {@link MAX_REQUEST_BYTES}. */
export class RequestTooLargeError extends Error {}

/**
 * Reads a JSON body without letting a caller decide how much memory to use.
 *
 * The declared length is checked first so an oversized body is refused before
 * it is read, and the actual length is checked afterwards because the declared
 * one is a claim rather than a fact.
 *
 * @param request - The incoming request.
 * @returns The parsed body, still untrusted and awaiting validation.
 * @throws {RequestTooLargeError} When the body is larger than the limit.
 */
export async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError();
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES) throw new RequestTooLargeError();
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Builds a JSON response that is never cached.
 *
 * Everything this service answers is either session-specific or a live view of
 * a repository, so a cached copy is always wrong.
 */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

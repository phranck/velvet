/**
 * Verifies the proof a GitHub Actions run offers about which repository it is.
 *
 * A workflow with `id-token: write` can ask GitHub for a short-lived token
 * naming the repository it runs in. Nothing is distributed to make this work:
 * the proof is minted at the moment of the call and cannot be replayed from
 * another repository, which is what makes it usable as an identity by a service
 * that holds no secret for any installation.
 *
 * This module answers one question, being which repository is calling. What
 * that repository is then allowed to do is decided elsewhere.
 */
import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

/** The issuer every GitHub Actions OIDC token names. */
export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

/**
 * Largest document accepted from the issuer.
 *
 * The discovery document and the key set are both small. A bound is stated
 * because they are fetched from outside and an unbounded read is a memory cost
 * somebody else decides.
 */
const MAX_DOCUMENT_BYTES = 64 * 1_024;

/** How long a fetched key set is reused before it is read again. */
const DEFAULT_KEY_CACHE_MS = 10 * 60_000;

/**
 * How far a token's own timestamps may disagree with this machine's clock.
 *
 * GitHub mints the token seconds before it arrives, so a service running a
 * little ahead would refuse a token that is perfectly valid. One minute is
 * enough for that and short enough to be worthless to anybody replaying an
 * expired one.
 */
const CLOCK_TOLERANCE_SECONDS = 60;

/** Why a token was refused, as a reason the caller can log. */
export class OidcVerificationError extends Error {
  constructor(reason: string, options: { cause?: unknown } = {}) {
    super(reason, options);
    this.name = "OidcVerificationError";
  }
}

/** What a verified token says about the run that presented it. */
export interface GitHubWorkflowIdentity {
  /** The repository as `owner/name`, for a log line a person reads. */
  repository: string;
  /** The account the repository belongs to. */
  repositoryOwner: string;
  /**
   * The repository's numeric id.
   *
   * The only one of the three that survives a rename, so everything binding is
   * decided against this rather than against the name.
   */
  repositoryId: number;
}

export interface GitHubOidcVerifierOptions {
  /**
   * The audience a token has to name.
   *
   * A workflow chooses the audience when it asks GitHub for the token, so
   * requiring one means a token minted for somebody else's service does not
   * verify here. Without it, any repository's default token would.
   */
  audience: string;
  issuer?: string;
  fetch?: (request: Request) => Promise<Response>;
  nowSeconds?: () => number;
  keyCacheMs?: number;
}

export interface GitHubOidcVerifier {
  verify(token: string): Promise<GitHubWorkflowIdentity>;
}

/**
 * Builds a verifier that reads GitHub's published keys and checks tokens.
 *
 * The key set is fetched on first use and reused for a while, because a token
 * arrives on every alarm and the keys change rarely. An unknown key id forces
 * one immediate refetch, which is what a rotation looks like from here.
 *
 * @param options - The audience to require, plus seams for testing.
 * @returns A verifier that resolves to the calling repository's identity.
 */
export function createGitHubOidcVerifier(
  options: GitHubOidcVerifierOptions,
): GitHubOidcVerifier {
  const issuer = options.issuer ?? GITHUB_OIDC_ISSUER;
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const nowSeconds =
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
  const keyCacheMs = options.keyCacheMs ?? DEFAULT_KEY_CACHE_MS;

  let keys: Map<string, KeyObject> | null = null;
  let keysReadAt = 0;

  const readKeys = async (): Promise<Map<string, KeyObject>> => {
    const discovery = await readJson(
      fetchImplementation,
      `${issuer}/.well-known/openid-configuration`,
    );
    const jwksUri = isRecord(discovery) ? discovery.jwks_uri : undefined;
    if (typeof jwksUri !== "string" || !jwksUri.startsWith(`${issuer}/`)) {
      throw new OidcVerificationError(
        "The issuer's discovery document named no key set of its own.",
      );
    }
    const document = await readJson(fetchImplementation, jwksUri);
    const entries = isRecord(document) ? document.keys : undefined;
    if (!Array.isArray(entries)) {
      throw new OidcVerificationError("The issuer's key set was not a list.");
    }
    const parsed = new Map<string, KeyObject>();
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.kid !== "string") continue;
      if (entry.kty !== "RSA") continue;
      try {
        parsed.set(entry.kid, createPublicKey({ key: entry, format: "jwk" }));
      } catch {
        // A key this runtime cannot import is left out rather than failing the
        // whole set, because the set carries the key currently in use beside
        // ones being rotated in and out.
      }
    }
    if (parsed.size === 0) {
      throw new OidcVerificationError("The issuer published no usable keys.");
    }
    return parsed;
  };

  const keyFor = async (kid: string): Promise<KeyObject> => {
    const stale = keys === null || Date.now() - keysReadAt > keyCacheMs;
    if (stale) {
      keys = await readKeys();
      keysReadAt = Date.now();
    }
    const known = keys!.get(kid);
    if (known) return known;
    // An unknown id after a fresh read is an id the issuer does not publish.
    // After a cached one it is a rotation, so the set is read once more.
    if (!stale) {
      keys = await readKeys();
      keysReadAt = Date.now();
      const rotated = keys.get(kid);
      if (rotated) return rotated;
    }
    throw new OidcVerificationError("The token names a key the issuer does not publish.");
  };

  return {
    async verify(token) {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new OidcVerificationError("The token is not a signed JWT.");
      }
      const [encodedHeader, encodedPayload, encodedSignature] = parts as [
        string,
        string,
        string,
      ];
      const header = decodeSegment(encodedHeader, "header");
      if (header.alg !== "RS256" || typeof header.kid !== "string") {
        throw new OidcVerificationError(
          "The token is not signed with RS256 under a named key.",
        );
      }
      const key = await keyFor(header.kid);
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${encodedHeader}.${encodedPayload}`);
      verifier.end();
      if (!verifier.verify(key, Buffer.from(encodedSignature, "base64url"))) {
        throw new OidcVerificationError("The token's signature does not verify.");
      }

      const claims = decodeSegment(encodedPayload, "payload");
      if (claims.iss !== issuer) {
        throw new OidcVerificationError("The token names a different issuer.");
      }
      if (!audienceMatches(claims.aud, options.audience)) {
        throw new OidcVerificationError("The token was minted for a different audience.");
      }
      const now = nowSeconds();
      if (
        typeof claims.exp !== "number" ||
        claims.exp + CLOCK_TOLERANCE_SECONDS <= now
      ) {
        throw new OidcVerificationError("The token has expired.");
      }
      if (
        typeof claims.nbf === "number" &&
        claims.nbf - CLOCK_TOLERANCE_SECONDS > now
      ) {
        throw new OidcVerificationError("The token is not valid yet.");
      }
      const repository = claims.repository;
      const repositoryOwner = claims.repository_owner;
      const repositoryId = Number(claims.repository_id);
      if (
        typeof repository !== "string" ||
        typeof repositoryOwner !== "string" ||
        !Number.isSafeInteger(repositoryId) ||
        repositoryId < 1
      ) {
        throw new OidcVerificationError("The token names no repository.");
      }
      return { repository, repositoryOwner, repositoryId };
    },
  };
}

/**
 * Reads a JSON document from the issuer, bounded and without redirects.
 *
 * Redirects are not followed, because the destination would then be chosen by
 * whoever answered rather than by the issuer this verifier is configured with.
 */
async function readJson(
  fetchImplementation: (request: Request) => Promise<Response>,
  url: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(
      new Request(url, { redirect: "error", headers: { Accept: "application/json" } }),
    );
  } catch (cause) {
    throw new OidcVerificationError("The issuer could not be reached.", { cause });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new OidcVerificationError(
      `The issuer answered ${response.status} for one of its own documents.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new OidcVerificationError("The issuer's document exceeded the allowed size.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (cause) {
    throw new OidcVerificationError("The issuer's document was not JSON.", { cause });
  }
}

/** Decodes one segment of a JWT into the object it has to be. */
function decodeSegment(segment: string, what: string): Record<string, unknown> {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8"),
    );
    if (!isRecord(decoded)) throw new Error("not an object");
    return decoded;
  } catch (cause) {
    throw new OidcVerificationError(`The token's ${what} could not be read.`, {
      cause,
    });
  }
}

/** Whether the token's audience claim, in either shape, names this service. */
function audienceMatches(claim: unknown, expected: string): boolean {
  if (typeof claim === "string") return claim === expected;
  if (Array.isArray(claim)) return claim.includes(expected);
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

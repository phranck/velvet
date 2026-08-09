/**
 * The subscription a monitor presents when it asks Velvet to raise an alarm.
 *
 * Proving which repository is calling is not enough on its own. Anybody can run
 * a Velvet installation, so anybody can obtain a valid proof of identity from
 * GitHub, and a relay that then accepted any Pushover key would let one
 * installation send alarms to another installation's operator.
 *
 * So a monitor never sends a bare key. It sends a grant Velvet itself issued,
 * carrying the repository and the key together under Velvet's own signature.
 * The relay reads the repository out of the grant and refuses unless it matches
 * the repository the identity proof names, which makes a grant lifted from one
 * repository worthless in another.
 *
 * The binding travels in the grant rather than being remembered, which is why
 * this service still needs no datastore.
 *
 * A grant does not expire. Rotating {@link NotificationGrantOptions.secret}
 * invalidates every grant at once, and an operator withdraws their own by
 * unsubscribing at Pushover, so the alternative would be a renewal somebody has
 * to perform who may not be watching.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The shape of a Pushover user or group key.
 *
 * Quoting Pushover's API reference: "User and group identifiers are 30
 * characters long, case-sensitive, and may contain the character set
 * `[A-Za-z0-9]`."
 */
export const PUSHOVER_KEY_PATTERN = /^[A-Za-z0-9]{30}$/u;

/** Smallest secret this will sign with, in bytes. */
const MINIMUM_SECRET_BYTES = 32;

/** What a verified grant says the caller may do. */
export interface NotificationGrant {
  /** The repository this subscription belongs to, by its immutable id. */
  repositoryId: number;
  /** Where an alarm for that repository goes. */
  userKey: string;
}

export interface NotificationGrantOptions {
  /**
   * The key grants are signed with.
   *
   * Its own secret rather than the session secret, so rotating a session key
   * does not silently switch off notifications for every installation at once.
   */
  secret: string;
}

export interface NotificationGrantIssuer {
  /**
   * Signs a subscription so it can be presented later.
   *
   * Nothing calls this yet, because obtaining a grant in the first place is the
   * subscription flow and its own piece of work. It lives here so that the
   * signing and the verification cannot come to disagree about the format.
   *
   * @param grant - The repository and the key it sends to.
   * @returns The grant as a single string, safe to store in a repository secret.
   * @throws {TypeError} When the repository id or the key is not usable.
   */
  issue(grant: NotificationGrant): string;
  /**
   * Reads a grant back, refusing anything this service did not sign.
   *
   * @param value - The grant exactly as the caller presented it.
   * @returns What it grants, or `null` when it does not verify.
   */
  verify(value: string): NotificationGrant | null;
}

/**
 * Builds the issuer and verifier for notification grants.
 *
 * @param options - The signing secret.
 * @returns The pair, which share one format by construction.
 * @throws {TypeError} When the secret is too short to sign with.
 */
export function createNotificationGrants(
  options: NotificationGrantOptions,
): NotificationGrantIssuer {
  if (Buffer.byteLength(options.secret, "utf8") < MINIMUM_SECRET_BYTES) {
    throw new TypeError(
      `NOTIFY_GRANT_SECRET must contain at least ${MINIMUM_SECRET_BYTES} bytes.`,
    );
  }

  const sign = (payload: string): string =>
    createHmac("sha256", options.secret).update(payload).digest("base64url");

  return {
    issue(grant) {
      if (!Number.isSafeInteger(grant.repositoryId) || grant.repositoryId < 1) {
        throw new TypeError("A grant needs a positive repository id.");
      }
      if (!PUSHOVER_KEY_PATTERN.test(grant.userKey)) {
        throw new TypeError("A grant needs a Pushover user or group key.");
      }
      const payload = Buffer.from(
        JSON.stringify({
          repositoryId: grant.repositoryId,
          userKey: grant.userKey,
        }),
        "utf8",
      ).toString("base64url");
      return `${payload}.${sign(payload)}`;
    },

    verify(value) {
      const [payload, signature, extra] = value.split(".");
      if (extra !== undefined || !payload || !signature) return null;
      if (!safeEqual(signature, sign(payload))) return null;
      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (typeof decoded !== "object" || decoded === null) return null;
      const { repositoryId, userKey } = decoded as Record<string, unknown>;
      if (!Number.isSafeInteger(repositoryId) || (repositoryId as number) < 1) {
        return null;
      }
      if (typeof userKey !== "string" || !PUSHOVER_KEY_PATTERN.test(userKey)) {
        return null;
      }
      return { repositoryId: repositoryId as number, userKey };
    },
  };
}

/**
 * Compares two strings without letting their contents decide how long it takes.
 *
 * A signature compared with `===` returns sooner the earlier it differs, and
 * that difference is enough to work out a valid signature one byte at a time.
 */
function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

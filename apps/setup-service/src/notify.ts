/**
 * Forwards one installation's alarm to Pushover on that installation's behalf.
 *
 * It exists so that Velvet's Pushover application token never leaves the
 * server. An installation sending directly would need the token in its own
 * repository, and a repository owner can read their own secrets, which would
 * put the token in everyone's hands.
 *
 * Three things are checked before anything is sent, and each has its own
 * refusal, because a monitor run reports what it was told and only some of
 * these are the operator's to fix:
 *
 * 1. Which repository is calling, proved by GitHub rather than asserted.
 * 2. That the recipient belongs to that repository, proved by Velvet's own
 *    signature over the two together. See `notify-grant.ts` for why identity
 *    alone is not enough.
 * 3. That neither this installation's allowance nor the shared Pushover quota
 *    has run out.
 *
 * Nothing is stored. The alarm text passes through, and the service keeps no
 * record of which installation alerted about what, because a relay that kept
 * such a record would be Velvet watching its users.
 */
import type { NotifyRequest } from "@velvet/contracts";

import type { GitHubOidcVerifier } from "./oidc.js";
import type { NotificationGrantIssuer } from "./notify-grant.js";
import type { RateLimiter } from "./rate-limit.js";
import { SetupServiceError } from "./setup-error.js";

/** Where Pushover takes a message. */
export const PUSHOVER_MESSAGES_URL = "https://api.pushover.net/1/messages.json";

/**
 * The header Pushover answers with, naming what the account has left.
 *
 * The quota is the account's rather than this application's: Pushover's API
 * reference states that an account may send 10,000 messages a month "with all
 * applications belonging that user sharing the monthly quota". So the floor
 * below protects room that something other than Velvet may also be spending.
 */
export const PUSHOVER_REMAINING_HEADER = "X-Limit-App-Remaining";

/** Largest answer read from Pushover, which returns a short JSON object. */
const MAX_RESPONSE_BYTES = 16 * 1_024;

/**
 * What a log line may carry about one relayed alarm.
 *
 * Named fields over an index signature, so that what is allowed in a log line
 * is stated rather than left to whoever adds the next one. The recipient's key,
 * the grant carrying it, and the alarm text are absent by construction: this
 * type is the only thing the relay reports, so none of the three can reach a
 * log through it.
 *
 * The index signature is what lets the audit logger take it directly, and it is
 * bounded to the same three kinds of value that logger accepts.
 */
export interface NotifyContext extends Record<string, string | number | boolean> {
  /** The calling repository as `owner/name`, once GitHub has proved it. */
  repository?: string;
  /** Its immutable id, which is what every decision here is bound to. */
  repositoryId?: number;
  /** What Pushover last reported the account has left this month. */
  remaining?: number;
}

export type NotifyResult =
  | { outcome: "delivered"; context: NotifyContext }
  | {
      outcome: "refused";
      error: SetupServiceError;
      context: NotifyContext;
      /**
       * How long the caller should wait, where waiting is the answer.
       *
       * Only a spent allowance sets it, because that is the one refusal that
       * resolves on its own. The caller turns it into `Retry-After`.
       */
      retryAfterSeconds?: number;
    };

export interface NotifyRelayOptions {
  /** Velvet's own Pushover application token, from the server's environment. */
  applicationToken: string;
  /** Verifies which repository is calling. */
  identity: GitHubOidcVerifier;
  /** Verifies that the recipient belongs to that repository. */
  grants: NotificationGrantIssuer;
  /**
   * What one installation may send in a window, counted against its repository
   * id. In memory, so it does not survive a restart, which is acceptable for a
   * guard against runaway sending and is not a billing ledger.
   */
  allowance: RateLimiter;
  /**
   * The remaining account quota below which nothing is forwarded for anybody.
   *
   * Without it, one installation flapping between up and down every five
   * minutes would spend roughly 8,600 messages a month and silence every other
   * operator.
   */
  quotaFloor: number;
  fetch?: (request: Request) => Promise<Response>;
}

export interface NotifyRelay {
  relay(input: {
    identityToken: string;
    request: NotifyRequest;
  }): Promise<NotifyResult>;
}

/**
 * Builds the relay.
 *
 * @param options - The application token, the two verifiers, and the limits.
 * @returns A relay that reports what it did rather than throwing, so the caller
 *   can log the outcome and answer with it in one place.
 */
export function createNotifyRelay(options: NotifyRelayOptions): NotifyRelay {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  /**
   * What Pushover said was left the last time it answered.
   *
   * `null` until the first answer, and the floor is not enforced before then,
   * because refusing on an unknown figure would mean refusing everything after
   * every restart.
   */
  let remaining: number | null = null;

  return {
    async relay({ identityToken, request }) {
      let repository: string;
      let repositoryId: number;
      try {
        const verified = await options.identity.verify(identityToken);
        repository = verified.repository;
        repositoryId = verified.repositoryId;
      } catch (cause) {
        return refused(
          new SetupServiceError(
            "NOTIFY_IDENTITY_REJECTED",
            "GitHub did not confirm which repository this alarm came from.",
            { status: 401, cause },
          ),
          {},
        );
      }

      const context: NotifyContext = {
        repository,
        repositoryId,
        ...(remaining === null ? {} : { remaining }),
      };

      const grant = options.grants.verify(request.grant);
      if (!grant) {
        return refused(
          new SetupServiceError(
            "NOTIFY_GRANT_REJECTED",
            "This subscription was not issued by Velvet. Subscribe again.",
            { status: 403 },
          ),
          context,
        );
      }
      // The one check that stops an installation alarming somebody else's
      // operator. A grant lifted from another repository verifies perfectly and
      // fails here, because the two identities have to agree.
      if (grant.repositoryId !== repositoryId) {
        return refused(
          new SetupServiceError(
            "NOTIFY_GRANT_MISMATCHED",
            "This subscription belongs to a different repository.",
            { status: 403 },
          ),
          context,
        );
      }

      // Checked before the allowance is spent, so an installation is not
      // charged for a call that was never going to be sent.
      if (remaining !== null && remaining < options.quotaFloor) {
        return refused(
          new SetupServiceError(
            "NOTIFY_QUOTA_EXHAUSTED",
            "Velvet has too little Pushover quota left this month to forward alarms.",
            { status: 503, recoverable: true },
          ),
          context,
        );
      }

      const spent = options.allowance.consume(String(repositoryId));
      if (!spent.allowed) {
        return refused(
          new SetupServiceError(
            "NOTIFY_ALLOWANCE_SPENT",
            "This installation has sent as many alarms as it may for now.",
            { status: 429, recoverable: true },
          ),
          context,
          spent.retryAfterSeconds,
        );
      }

      let response: Response;
      try {
        response = await fetchImplementation(
          new Request(PUSHOVER_MESSAGES_URL, {
            method: "POST",
            redirect: "error",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              token: options.applicationToken,
              user: grant.userKey,
              message: request.message,
              ...(request.title === undefined ? {} : { title: request.title }),
            }).toString(),
          }),
        );
      } catch (cause) {
        return refused(
          new SetupServiceError(
            "NOTIFY_DELIVERY_FAILED",
            "Pushover could not be reached.",
            { status: 502, recoverable: true, cause },
          ),
          context,
        );
      }

      const reported = Number(response.headers.get(PUSHOVER_REMAINING_HEADER));
      if (Number.isSafeInteger(reported) && reported >= 0) {
        remaining = reported;
        context.remaining = reported;
      }

      const accepted = await pushoverAccepted(response);
      if (!accepted) {
        return refused(
          new SetupServiceError(
            "NOTIFY_DELIVERY_FAILED",
            "Pushover refused this alarm.",
            { status: 502, recoverable: true },
          ),
          context,
        );
      }
      return { outcome: "delivered", context };
    },
  };
}

/**
 * Whether Pushover accepted the message.
 *
 * Pushover answers 200 with `status: 1` when it did and a 4xx with `status: 0`
 * otherwise, so both are checked: a 200 carrying `status: 0` is a refusal, and
 * treating the code alone as the answer would report it as delivered.
 *
 * The body is consumed either way, so nothing is left open.
 */
async function pushoverAccepted(response: Response): Promise<boolean> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || bytes.byteLength > MAX_RESPONSE_BYTES) return false;
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { status?: unknown }).status === 1
    );
  } catch {
    return false;
  }
}

/** One shape for every refusal, so none of them forgets its context. */
function refused(
  error: SetupServiceError,
  context: NotifyContext,
  retryAfterSeconds?: number,
): NotifyResult {
  return {
    outcome: "refused",
    error,
    context,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

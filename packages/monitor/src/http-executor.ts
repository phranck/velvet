import { isReservedSecretName, type NormalizedHttpCheck } from "@velvet/contracts";
import { lookup as dnsLookup } from "node:dns";
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  RequestOptions,
} from "node:http";
import { request as httpRequest, validateHeaderValue } from "node:http";
import { request as httpsRequest } from "node:https";
import { performance } from "node:perf_hooks";

import { assertionsMatch } from "./json-assertions.js";
import type {
  CheckFailureCode,
  HttpCheckExecutionResult,
  HttpExecutorDependencies,
} from "./types.js";

const MAX_JSON_RESPONSE_BYTES = 64 * 1_024;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

const FAILURE_MESSAGES: Record<CheckFailureCode, string> = {
  ASSERTION_MISMATCH: "JSON response assertion failed.",
  CANCELLED: "Check was cancelled.",
  CONNECTION_ERROR: "Connection failed.",
  DNS_ERROR: "DNS lookup failed.",
  INVALID_JSON: "Response body is not valid JSON.",
  INVALID_REDIRECT: "Redirect location is not a valid HTTP(S) URL.",
  INVALID_REQUEST_HEADER: "A configured request header value is invalid.",
  RESPONSE_BODY_TOO_LARGE: "JSON response exceeded the safe size limit.",
  SECRET_NOT_FOUND: "A configured request-header secret is unavailable.",
  TIMEOUT: "Check timed out.",
  TLS_ERROR: "TLS negotiation failed.",
  TOO_MANY_REDIRECTS: "Redirect limit was exceeded.",
  UNEXPECTED_STATUS: "Final HTTP status was not expected.",
  UNKNOWN_ERROR: "HTTP check failed.",
};

type ResolvedHeaders =
  | { success: true; headers: OutgoingHttpHeaders }
  | {
      success: false;
      code: "INVALID_REQUEST_HEADER" | "SECRET_NOT_FOUND";
    };

type RequestFailure = {
  kind: "failure";
  code: CheckFailureCode;
};

type RequestResponse = {
  kind: "response";
  response: IncomingMessage;
  receivedAt: number;
};

type RequestOutcome = RequestFailure | RequestResponse;

type BodyOutcome =
  | { success: true; body: Buffer; receivedAt: number }
  | { success: false; code: CheckFailureCode; receivedAt: number };

type Lookup = NonNullable<RequestOptions["lookup"]>;

/**
 * Reads a header secret from the environment, refusing the runner's own.
 *
 * Configuration validation already rejects a header naming a runner variable,
 * so this is the second line: a name reserved to the runner resolves to
 * nothing here even if a check reached this point unvalidated, so `GITHUB_TOKEN`
 * and its kind can never be sent to a checked endpoint.
 */
const defaultResolveSecret = (name: string): string | undefined =>
  isReservedSecretName(name) ? undefined : process.env[name];

const forceIpv4Lookup = (resolver: Lookup): Lookup =>
  (hostname, options, callback) =>
    resolver(hostname, { ...options, family: 4 }, callback);

function resolveHeaders(
  check: NormalizedHttpCheck,
  resolveSecret: (name: string) => string | undefined,
): ResolvedHeaders {
  const headers: OutgoingHttpHeaders = {};
  try {
    for (const header of check.headers) {
      const value = resolveSecret(header.secret);
      if (value === undefined) {
        return { success: false, code: "SECRET_NOT_FOUND" };
      }
      try {
        validateHeaderValue(header.name, value);
      } catch {
        return { success: false, code: "INVALID_REQUEST_HEADER" };
      }
      headers[header.name] = value;
    }
  } catch {
    return { success: false, code: "SECRET_NOT_FOUND" };
  }
  return { success: true, headers };
}

function failureCode(error: unknown): CheckFailureCode {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (["ENOTFOUND", "EAI_AGAIN", "ENODATA"].includes(code)) {
    return "DNS_ERROR";
  }
  if (
    code.startsWith("ERR_TLS") ||
    code.includes("CERT") ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "EPROTO"
  ) {
    return "TLS_ERROR";
  }
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EPIPE",
    ].includes(code)
  ) {
    return "CONNECTION_ERROR";
  }
  return "UNKNOWN_ERROR";
}

function requestOnce(
  url: URL,
  method: "GET" | "HEAD",
  headers: OutgoingHttpHeaders,
  timeoutMs: number,
  dependencies: Required<
    Pick<HttpExecutorDependencies, "monotonicNow">
  > &
    Pick<HttpExecutorDependencies, "lookup" | "signal">,
): Promise<RequestOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const finish = (outcome: RequestOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      dependencies.signal?.removeEventListener("abort", cancel);
      resolve(outcome);
    };
    const request = transport(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        family: 4,
        lookup: forceIpv4Lookup(dependencies.lookup ?? dnsLookup),
        agent: false,
      },
      (response) =>
        finish({
          kind: "response",
          response,
          receivedAt: dependencies.monotonicNow(),
        }),
    );
    const timeout = setTimeout(() => {
      finish({ kind: "failure", code: "TIMEOUT" });
      request.destroy();
    }, Math.max(1, timeoutMs));
    const cancel = () => {
      finish({ kind: "failure", code: "CANCELLED" });
      request.destroy();
    };

    if (dependencies.signal?.aborted) {
      cancel();
      return;
    }
    dependencies.signal?.addEventListener("abort", cancel, { once: true });
    request.on("error", (error) =>
      finish({ kind: "failure", code: failureCode(error) }),
    );
    request.end();
  });
}

function readJsonBody(
  response: IncomingMessage,
  timeoutMs: number,
  dependencies: Required<
    Pick<HttpExecutorDependencies, "monotonicNow">
  > &
    Pick<HttpExecutorDependencies, "signal">,
): Promise<BodyOutcome> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let settled = false;
    const finish = (outcome: BodyOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      dependencies.signal?.removeEventListener("abort", cancel);
      response.removeAllListeners();
      resolve(outcome);
    };
    const fail = (code: CheckFailureCode) => {
      finish({
        success: false,
        code,
        receivedAt: dependencies.monotonicNow(),
      });
      response.destroy();
    };
    const cancel = () => fail("CANCELLED");
    const timeout = setTimeout(() => fail("TIMEOUT"), Math.max(1, timeoutMs));

    if (dependencies.signal?.aborted) {
      cancel();
      return;
    }
    dependencies.signal?.addEventListener("abort", cancel, { once: true });
    response.on("data", (chunk: Buffer | Uint8Array | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.byteLength;
      if (byteLength > MAX_JSON_RESPONSE_BYTES) {
        fail("RESPONSE_BODY_TOO_LARGE");
        return;
      }
      chunks.push(buffer);
    });
    response.on("end", () => {
      finish({
        success: true,
        body: Buffer.concat(chunks),
        receivedAt: dependencies.monotonicNow(),
      });
    });
    response.on("aborted", () => fail("CONNECTION_ERROR"));
    response.on("error", (error) => fail(failureCode(error)));
  });
}

function redirectUrl(response: IncomingMessage, currentUrl: URL): URL | null {
  const location = response.headers.location;
  if (!location) return null;
  try {
    const target = new URL(location, currentUrl);
    if (
      (target.protocol !== "http:" && target.protocol !== "https:") ||
      target.username ||
      target.password ||
      target.hash
    ) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}

function result(
  checkId: string,
  wallNow: () => Date,
  startedAt: number | null,
  finishedAt: number,
  statusCode: number | null,
  errorCode: CheckFailureCode | null,
): HttpCheckExecutionResult {
  return {
    checkId,
    checkedAt: wallNow().toISOString(),
    outcome: errorCode === null ? "success" : "failure",
    latencyMs:
      startedAt === null ? 0 : Math.max(0, finishedAt - startedAt),
    statusCode,
    error:
      errorCode === null
        ? null
        : { code: errorCode, message: FAILURE_MESSAGES[errorCode] },
  };
}

export async function executeHttpCheck(
  check: NormalizedHttpCheck,
  dependencies: HttpExecutorDependencies = {},
): Promise<HttpCheckExecutionResult> {
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const wallNow = dependencies.wallNow ?? (() => new Date());
  const resolvedHeaders = resolveHeaders(
    check,
    dependencies.resolveSecret ?? defaultResolveSecret,
  );
  if (!resolvedHeaders.success) {
    return result(check.id, wallNow, null, 0, null, resolvedHeaders.code);
  }
  if (dependencies.signal?.aborted) {
    return result(check.id, wallNow, null, 0, null, "CANCELLED");
  }

  const startedAt = monotonicNow();
  const deadline = startedAt + check.timeoutMs;
  let currentUrl: URL;
  try {
    currentUrl = new URL(check.url);
  } catch {
    return result(
      check.id,
      wallNow,
      startedAt,
      monotonicNow(),
      null,
      "UNKNOWN_ERROR",
    );
  }
  let headers = resolvedHeaders.headers;
  let redirects = 0;

  while (true) {
    const remainingMs = deadline - monotonicNow();
    if (remainingMs <= 0) {
      return result(
        check.id,
        wallNow,
        startedAt,
        monotonicNow(),
        null,
        "TIMEOUT",
      );
    }
    const outcome = await requestOnce(
      currentUrl,
      check.method,
      headers,
      remainingMs,
      {
        monotonicNow,
        ...(dependencies.lookup ? { lookup: dependencies.lookup } : {}),
        ...(dependencies.signal ? { signal: dependencies.signal } : {}),
      },
    );
    if (outcome.kind === "failure") {
      return result(
        check.id,
        wallNow,
        startedAt,
        monotonicNow(),
        null,
        outcome.code,
      );
    }

    const statusCode = outcome.response.statusCode ?? 0;
    if (REDIRECT_STATUS_CODES.has(statusCode)) {
      const nextUrl = redirectUrl(outcome.response, currentUrl);
      outcome.response.destroy();
      if (nextUrl === null) {
        return result(
          check.id,
          wallNow,
          startedAt,
          outcome.receivedAt,
          statusCode,
          "INVALID_REDIRECT",
        );
      }
      if (redirects >= check.maxRedirects) {
        return result(
          check.id,
          wallNow,
          startedAt,
          outcome.receivedAt,
          statusCode,
          "TOO_MANY_REDIRECTS",
        );
      }
      if (nextUrl.origin !== currentUrl.origin) headers = {};
      currentUrl = nextUrl;
      redirects += 1;
      continue;
    }

    if (!check.expectedStatusCodes.includes(statusCode)) {
      outcome.response.destroy();
      return result(
        check.id,
        wallNow,
        startedAt,
        outcome.receivedAt,
        statusCode,
        "UNEXPECTED_STATUS",
      );
    }

    if (check.jsonAssertions.length === 0) {
      outcome.response.destroy();
      return result(
        check.id,
        wallNow,
        startedAt,
        outcome.receivedAt,
        statusCode,
        null,
      );
    }

    const body = await readJsonBody(
      outcome.response,
      deadline - monotonicNow(),
      {
        monotonicNow,
        ...(dependencies.signal ? { signal: dependencies.signal } : {}),
      },
    );
    if (!body.success) {
      return result(
        check.id,
        wallNow,
        startedAt,
        body.receivedAt,
        statusCode,
        body.code,
      );
    }

    let document: unknown;
    try {
      document = JSON.parse(body.body.toString("utf8"));
    } catch {
      return result(
        check.id,
        wallNow,
        startedAt,
        body.receivedAt,
        statusCode,
        "INVALID_JSON",
      );
    }
    return result(
      check.id,
      wallNow,
      startedAt,
      body.receivedAt,
      statusCode,
      assertionsMatch(document, check.jsonAssertions)
        ? null
        : "ASSERTION_MISMATCH",
    );
  }
}

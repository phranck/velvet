import {
  validateSetupEvent,
  validateSetupSession,
  validateSetupStatus,
  type SetupErrorCode,
  type SetupEvent,
} from "@velvet/contracts";

import {
  SetupClientError,
  type SetupClient,
  type SetupFailure,
  type SetupProgressStage,
} from "./state.js";

const BACKGROUND_PROGRESS_STAGES = new Set<SetupProgressStage>([
  "starting-monitor",
  "checking-services",
  "publishing-data",
  "building-page",
  "deploying-page",
  "waiting-for-deployment",
]);
const MAX_RESPONSE_BYTES = 256 * 1_024;
const MAX_STATUS_CHECKS = 125;
const STATUS_POLL_INTERVAL_MS = 2_000;

export type SetupFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createBrowserSetupClient(
  fetchImplementation: SetupFetchImplementation = globalThis.fetch,
  endpoint = "/api/setup",
  navigate: (url: string) => void = browserNavigate,
): SetupClient {
  return {
    async provision(request, onProgress) {
      let lastProgressStage: SetupProgressStage | undefined;
      const reportProgress = (stage: SetupProgressStage): void => {
        if (stage === lastProgressStage) return;
        lastProgressStage = stage;
        onProgress?.(stage);
      };
      reportProgress("authenticating");
      const sessionResponse = await fetchImplementation("/api/session", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!sessionResponse.ok) throw new Error("SETUP_FAILED");
      const session = validateSetupSession(await readJsonResponse(sessionResponse));
      if (!session.success) throw new Error("SETUP_FAILED");
      if (!session.data.authenticated) {
        navigate("/api/auth/start");
        throw new Error("SETUP_REDIRECT_STARTED");
      }
      if (!session.data.csrfToken) throw new Error("SETUP_FAILED");

      const response = await fetchImplementation(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/x-ndjson",
          "Content-Type": "application/json",
          "X-Velvet-CSRF": session.data.csrfToken,
        },
        body: JSON.stringify(request),
      });
      if (response.status === 401) {
        navigate("/api/auth/start");
        throw new Error("SETUP_REDIRECT_STARTED");
      }
      if (!response.ok || !response.body) throw new Error("SETUP_FAILED");
      if (
        !response.headers
          .get("Content-Type")
          ?.toLowerCase()
          .startsWith("application/x-ndjson")
      ) {
        throw new Error("SETUP_FAILED");
      }

      const events = readSetupEvents(response.body);
      let deploymentStarted = false;
      for await (const event of events) {
        if (event.type === "progress") {
          reportProgress(event.stage);
          deploymentStarted ||= BACKGROUND_PROGRESS_STAGES.has(event.stage);
        } else if (event.type === "permission-required") {
          navigate(safeGitHubInstallationUrl(event.installationUrl, event.access));
          throw new Error("SETUP_REDIRECT_STARTED");
        } else if (event.type === "success") {
          return {
            installationUrl: safeInstallationUrl(event.installationUrl),
            // Present only when the instance issues serials at all.
            ...(typeof event.serial === "number" ? { serial: event.serial } : {}),
          };
        } else if (event.type === "error") {
          throw setupClientError(event);
        }
      }
      if (deploymentStarted) {
        return pollSetupStatus(fetchImplementation, reportProgress);
      }
      throw new Error("SETUP_FAILED");
    },
  };
}

async function pollSetupStatus(
  fetchImplementation: SetupFetchImplementation,
  onProgress: (stage: SetupProgressStage) => void,
): Promise<{ installationUrl: string; serial?: number }> {
  for (let check = 0; check < MAX_STATUS_CHECKS; check += 1) {
    const response = await fetchImplementation("/api/setup/status", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("SETUP_FAILED");
    const status = validateSetupStatus(await readJsonResponse(response));
    if (!status.success) throw new Error("SETUP_FAILED");
    if (status.data.stage) onProgress(status.data.stage);
    if (status.data.state === "succeeded") {
      if (!status.data.installationUrl) throw new Error("SETUP_FAILED");
      return {
        installationUrl: safeInstallationUrl(status.data.installationUrl),
      };
    }
    if (status.data.state === "failed" && status.data.error) {
      throw setupClientError({
        error: status.data.error,
        recoverable: status.data.recoverable === true,
        ...(status.data.repositoryUrl
          ? { repositoryUrl: status.data.repositoryUrl }
          : {}),
        ...(status.data.workflowRunId
          ? { workflowRunId: status.data.workflowRunId }
          : {}),
      });
    }
    if (status.data.state !== "running") throw new Error("SETUP_FAILED");
    await wait(STATUS_POLL_INTERVAL_MS);
  }
  throw new Error("SETUP_FAILED");
}

function setupClientError(input: {
  error: { code?: SetupErrorCode; message: string; errorId: string };
  recoverable: boolean;
  repositoryUrl?: string;
  workflowRunId?: number;
}): SetupClientError {
  const repositoryUrl = input.repositoryUrl
    ? safeGitHubRepositoryUrl(input.repositoryUrl)
    : undefined;
  const failure: SetupFailure = {
    message: input.error.message,
    errorId: input.error.errorId,
    recoverable: input.recoverable,
    ...(input.error.code ? { code: input.error.code } : {}),
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(repositoryUrl && input.workflowRunId
      ? { workflowUrl: `${repositoryUrl}/actions/runs/${input.workflowRunId}` }
      : {}),
  };
  return new SetupClientError(failure);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function* readSetupEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SetupEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) throw new Error("SETUP_FAILED");
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield parseSetupEvent(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield parseSetupEvent(buffer);
  } finally {
    if (!finished) {
      try {
        await reader.cancel();
      } catch {
        // The caller already has the final result; cancellation is best effort.
      }
    }
    reader.releaseLock();
  }
}

function parseSetupEvent(source: string): SetupEvent {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("SETUP_FAILED");
  }
  const result = validateSetupEvent(value);
  if (!result.success) throw new Error("SETUP_FAILED");
  return result.data;
}

function safeInstallationUrl(source: string): string {
  const url = new URL(source);
  if (url.protocol !== "https:") throw new Error("SETUP_FAILED");
  return url.href;
}

function safeGitHubRepositoryUrl(source: string): string {
  const url = new URL(source);
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    url.origin !== "https://github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments.length !== 2 ||
    segments.some(
      (segment) =>
        segment.length > 100 || !/^[A-Za-z0-9_.-]+$/.test(segment),
    )
  ) {
    throw new Error("SETUP_FAILED");
  }
  return `https://github.com/${segments[0]}/${segments[1]}`;
}

function safeGitHubInstallationUrl(
  source: string,
  access: "temporary-account" | "repository",
): string {
  const url = new URL(source);
  const allowedParameters = new Set([
    "state",
    "suggested_target_id",
    "repository_ids[]",
  ]);
  if (
    url.origin !== "https://github.com" ||
    !/^\/apps\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/installations\/new\/permissions$/.test(
      url.pathname,
    ) ||
    url.searchParams.getAll("state").length !== 1 ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(url.searchParams.get("state") ?? "") ||
    !singlePositiveIdentifier(url.searchParams, "suggested_target_id") ||
    (access === "repository"
      ? !singlePositiveIdentifier(url.searchParams, "repository_ids[]")
      : url.searchParams.has("repository_ids[]")) ||
    [...url.searchParams.keys()].some((key) => !allowedParameters.has(key))
  ) {
    throw new Error("SETUP_FAILED");
  }
  return url.href;
}

function singlePositiveIdentifier(
  parameters: URLSearchParams,
  key: string,
): boolean {
  const values = parameters.getAll(key);
  if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0] ?? "")) return false;
  const value = Number(values[0]);
  return Number.isSafeInteger(value);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("SETUP_FAILED");
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("SETUP_FAILED");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("SETUP_FAILED");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("SETUP_FAILED");
  }
}

function browserNavigate(url: string): void {
  if (!globalThis.location) throw new Error("SETUP_FAILED");
  globalThis.location.assign(url);
}

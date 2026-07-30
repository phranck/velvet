import {
  validateSetupEvent,
  validateSetupSession,
  type SetupEvent,
} from "@velvet/contracts";

import type { SetupClient, SetupProgressStage } from "./state.js";

const PROGRESS_STAGES = new Set<SetupProgressStage>([
  "authenticating",
  "creating-repository",
  "writing-configuration",
  "enabling-pages",
  "starting-monitor",
  "waiting-for-deployment",
]);
const MAX_RESPONSE_BYTES = 256 * 1_024;

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
      onProgress?.("authenticating");
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
      for await (const event of events) {
        if (event.type === "progress") {
          onProgress?.(event.stage);
        } else if (event.type === "permission-required") {
          navigate(safeGitHubInstallationUrl(event.installationUrl));
          throw new Error("SETUP_REDIRECT_STARTED");
        } else if (event.type === "success") {
          return { installationUrl: safeInstallationUrl(event.installationUrl) };
        } else if (event.type === "error") {
          throw new Error("SETUP_FAILED");
        }
      }
      throw new Error("SETUP_FAILED");
    },
  };
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
  if (
    result.data.type === "progress" &&
    !PROGRESS_STAGES.has(result.data.stage as SetupProgressStage)
  ) {
    throw new Error("SETUP_FAILED");
  }
  return result.data;
}

function safeInstallationUrl(source: string): string {
  const url = new URL(source);
  if (url.protocol !== "https:") throw new Error("SETUP_FAILED");
  return url.href;
}

function safeGitHubInstallationUrl(source: string): string {
  const url = new URL(source);
  if (
    url.origin !== "https://github.com" ||
    !/^\/apps\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/installations\/new$/.test(
      url.pathname,
    ) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(url.searchParams.get("state") ?? "") ||
    [...url.searchParams.keys()].some((key) => key !== "state")
  ) {
    throw new Error("SETUP_FAILED");
  }
  return url.href;
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

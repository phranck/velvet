import type {
  SetupClient,
  SetupProgressStage,
} from "./state.js";

const PROGRESS_STAGES = new Set<SetupProgressStage>([
  "authenticating",
  "creating-repository",
  "writing-configuration",
  "enabling-pages",
  "starting-monitor",
  "waiting-for-deployment",
]);
const MAX_RESPONSE_BYTES = 256 * 1_024;

interface SetupEvent {
  type: "progress" | "permission-required" | "success" | "error";
  stage?: SetupProgressStage;
  installationUrl?: string;
}

export type SetupFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createBrowserSetupClient(
  fetchImplementation: SetupFetchImplementation = globalThis.fetch,
  endpoint = "./api/setup",
): SetupClient {
  return {
    async provision(request, onProgress) {
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error("SETUP_PERMISSION_REQUIRED");
      }
      if (!response.ok || !response.body) throw new Error("SETUP_FAILED");

      const events = readSetupEvents(response.body);
      for await (const event of events) {
        if (event.type === "progress" && event.stage) {
          onProgress?.(event.stage);
        } else if (event.type === "permission-required") {
          throw new Error("SETUP_PERMISSION_REQUIRED");
        } else if (event.type === "success" && event.installationUrl) {
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
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("SETUP_FAILED");
  }
  if (
    value.type === "progress" &&
    typeof value.stage === "string" &&
    PROGRESS_STAGES.has(value.stage as SetupProgressStage)
  ) {
    return { type: "progress", stage: value.stage as SetupProgressStage };
  }
  if (value.type === "permission-required") return { type: value.type };
  if (value.type === "error") return { type: value.type };
  if (value.type === "success" && typeof value.installationUrl === "string") {
    return { type: value.type, installationUrl: value.installationUrl };
  }
  throw new Error("SETUP_FAILED");
}

function safeInstallationUrl(source: string): string {
  const url = new URL(source);
  if (url.protocol !== "https:") throw new Error("SETUP_FAILED");
  return url.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

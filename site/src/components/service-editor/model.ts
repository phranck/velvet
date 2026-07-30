export type AssertionValueType = "string" | "number" | "boolean" | "null";

export interface HeaderDraft {
  id: string;
  name: string;
  secret: string;
}

export interface JsonAssertionDraft {
  id: string;
  path: string;
  valueType: AssertionValueType;
  value: string;
}

export interface ServiceDraft {
  id: string;
  name: string;
  url: string;
  icon: string | null;
  advanced: boolean;
  method: "GET" | "HEAD";
  expectedStatusCodes: string;
  maxRedirects: number;
  timeoutMs: number;
  headers: HeaderDraft[];
  jsonAssertions: JsonAssertionDraft[];
}

let nextDraftId = 0;

export function createServiceDraft(id = createDraftId("service")): ServiceDraft {
  return {
    id,
    name: "",
    url: "",
    icon: null,
    advanced: false,
    method: "GET",
    expectedStatusCodes: "200",
    maxRedirects: 5,
    timeoutMs: 10_000,
    headers: [],
    jsonAssertions: [],
  };
}

export function createHeaderDraft(): HeaderDraft {
  return { id: createDraftId("header"), name: "", secret: "" };
}

export function createJsonAssertionDraft(): JsonAssertionDraft {
  return {
    id: createDraftId("assertion"),
    path: "",
    valueType: "string",
    value: "",
  };
}

function createDraftId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${++nextDraftId}`;
}

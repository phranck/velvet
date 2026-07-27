import {
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
  type ContractValidationResult,
  type IncidentsDocument,
  type ResponseTimesDocument,
  type StatusDocument,
} from "@velvet/contracts";

export interface VelvetSnapshot {
  status: StatusDocument;
  responseTimes: ResponseTimesDocument;
  incidents: IncidentsDocument;
}

export type VelvetDataErrorCode =
  | "DATA_UNAVAILABLE"
  | "INVALID_DOCUMENT"
  | "UNSUPPORTED_SCHEMA_VERSION";

export class VelvetDataError extends Error {
  readonly code: VelvetDataErrorCode;

  constructor(code: VelvetDataErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VelvetDataError";
    this.code = code;
  }
}

export interface VelvetDataClient {
  loadStatus(): Promise<StatusDocument>;
  loadResponseTimes(): Promise<ResponseTimesDocument>;
  loadIncidents(): Promise<IncidentsDocument>;
  loadSnapshot(): Promise<VelvetSnapshot>;
}

type Validator<T> = (value: unknown) => ContractValidationResult<T>;

export function createVelvetDataClient(
  dataBaseUrl: string,
  fetchImplementation: typeof fetch = globalThis.fetch,
): VelvetDataClient {
  const baseUrl = dataBaseUrl.replace(/\/+$/, "");

  async function loadDocument<T>(
    fileName: string,
    validate: Validator<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImplementation(`${baseUrl}/${fileName}`, {
        cache: "no-cache",
      });
    } catch (error) {
      throw new VelvetDataError(
        "DATA_UNAVAILABLE",
        "Velvet status data is temporarily unavailable.",
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new VelvetDataError(
        "DATA_UNAVAILABLE",
        "Velvet status data is temporarily unavailable.",
      );
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      throw new VelvetDataError(
        "INVALID_DOCUMENT",
        "Velvet status data is invalid.",
        { cause: error },
      );
    }
    const result = validate(value);
    if (!result.success) {
      const unsupported = result.errors.some(
        ({ code }) => code === "UNSUPPORTED_SCHEMA_VERSION",
      );
      throw new VelvetDataError(
        unsupported ? "UNSUPPORTED_SCHEMA_VERSION" : "INVALID_DOCUMENT",
        unsupported
          ? "This Velvet data schema version is not supported."
          : "Velvet status data is invalid.",
      );
    }
    return result.data;
  }

  const client: VelvetDataClient = {
    loadStatus: () => loadDocument("status.json", validateStatusDocument),
    loadResponseTimes: () =>
      loadDocument("response-times.json", validateResponseTimesDocument),
    loadIncidents: () =>
      loadDocument("incidents.json", validateIncidentsDocument),
    async loadSnapshot() {
      const [status, responseTimes, incidents] = await Promise.all([
        client.loadStatus(),
        client.loadResponseTimes(),
        client.loadIncidents(),
      ]);
      return { status, responseTimes, incidents };
    },
  };
  return client;
}

export async function refreshIncidentsDocument(
  client: VelvetDataClient,
  current: () => IncidentsDocument,
): Promise<IncidentsDocument> {
  let candidate: IncidentsDocument;
  try {
    candidate = await client.loadIncidents();
  } catch {
    return current();
  }
  const latest = current();
  return candidate.generatedAt > latest.generatedAt ? candidate : latest;
}

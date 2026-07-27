import { validateVelvetDocuments } from "./conversion.js";
import type { VelvetDocuments } from "./types.js";

export function serializeVelvetDocuments(
  documents: VelvetDocuments,
): Record<"status.json" | "response-times.json" | "incidents.json", string> {
  const validated = validateVelvetDocuments(documents);
  return {
    "status.json": `${JSON.stringify(validated.status, null, 2)}\n`,
    "response-times.json": `${JSON.stringify(validated.responseTimes, null, 2)}\n`,
    "incidents.json": `${JSON.stringify(validated.incidents, null, 2)}\n`,
  };
}

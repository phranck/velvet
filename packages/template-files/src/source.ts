import { createHash } from "node:crypto";

import type { VelvetManagedFile } from "@velvet/contracts";

import type { TemplateSourceError, TemplateSourceErrorCode } from "./types.js";

const MAX_TEMPLATE_SOURCE_BYTES = 1_048_576;

function sourceError(
  code: TemplateSourceErrorCode,
  path: string,
  message: string,
): TemplateSourceError {
  return { code, path, message };
}

export function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function verifyTemplateSource(
  file: VelvetManagedFile,
  sources: Readonly<Record<string, string>>,
): { source: string } | { error: TemplateSourceError } {
  if (!("sourcePath" in file)) {
    return {
      error: sourceError(
        "MISSING_TEMPLATE_SOURCE",
        file.path,
        "The managed template file has no immutable source path.",
      ),
    };
  }
  const source = sources[file.sourcePath];
  if (source === undefined) {
    return {
      error: sourceError(
        "MISSING_TEMPLATE_SOURCE",
        file.path,
        "The release source does not contain the required managed template file.",
      ),
    };
  }
  if (Buffer.byteLength(source, "utf8") > MAX_TEMPLATE_SOURCE_BYTES) {
    return {
      error: sourceError(
        "INVALID_TEMPLATE_SOURCE",
        file.path,
        "The managed template source exceeds the supported size.",
      ),
    };
  }
  if (sha256(source) !== file.sha256) {
    return {
      error: sourceError(
        "TEMPLATE_SOURCE_HASH_MISMATCH",
        file.path,
        "The managed template source does not match the release manifest.",
      ),
    };
  }
  return { source };
}

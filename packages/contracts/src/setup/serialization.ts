import { dump } from "js-yaml";

import type { NormalizedVelvetConfiguration } from "../configuration/types.js";
import { validateVelvetConfiguration } from "../configuration/validation.js";

const YAML_OPTIONS = {
  forceQuotes: false,
  lineWidth: 100,
  noRefs: true,
  quotingType: '"',
} as const;

export function serializeVelvetConfiguration(
  configuration: NormalizedVelvetConfiguration,
): string {
  const validated = validateVelvetConfiguration(configuration);
  if (!validated.success) {
    throw new TypeError("Only a valid Velvet configuration can be serialized.");
  }
  return dump(validated.data, YAML_OPTIONS);
}

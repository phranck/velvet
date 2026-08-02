import {
  validateVelvetReleaseManifest,
  validateVelvetVersionLock,
  type NormalizedVelvetConfiguration,
  type VelvetManagedFile,
  type VelvetReleaseManifest,
} from "@velvet/contracts";
import { dump, load } from "js-yaml";

import type {
  ManagedTemplateFilesResult,
  MaterializeManagedTemplateFilesInput,
  MaterializedTemplateFile,
  TemplateFilesError,
  TemplateFilesErrorCode,
} from "./types.js";
import { sha256, verifyTemplateSource } from "./source.js";

type UnknownRecord = Record<string, unknown>;

const YAML_OPTIONS = {
  forceQuotes: false,
  lineWidth: 120,
  noRefs: true,
  quotingType: '"',
} as const;

const templateError = (
  code: TemplateFilesErrorCode,
  path: string,
  message: string,
): TemplateFilesError => ({ code, path, message });

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseYamlRecord(
  source: string,
  path: string,
): { value: UnknownRecord } | { error: TemplateFilesError } {
  try {
    const value = load(source);
    if (isRecord(value)) return { value };
  } catch {
    // The stable error below deliberately omits parser details and source text.
  }
  return {
    error: templateError(
      "INVALID_TEMPLATE_SOURCE",
      path,
      "The managed template source does not have the required YAML structure.",
    ),
  };
}

function renderYaml(value: UnknownRecord): string {
  return dump(value, YAML_OPTIONS);
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function maintenanceOptions(
  configuration: NormalizedVelvetConfiguration,
): string[] {
  return configuration.services.flatMap((service) => [
    `${oneLine(service.name)} (all checks) [${service.id}/*]`,
    ...service.checks.map(
      (check) =>
        `${oneLine(service.name)} / ${oneLine(check.name)} [${service.id}/${check.id}]`,
    ),
  ]);
}

function renderMaintenanceIssueTemplate(
  source: string,
  path: string,
  configuration: NormalizedVelvetConfiguration,
): { content: string } | { error: TemplateFilesError } {
  const parsed = parseYamlRecord(source, path);
  if ("error" in parsed) return parsed;
  if (!Array.isArray(parsed.value.body)) {
    return invalidStructure(path);
  }
  const dropdown = parsed.value.body.find(
    (entry) => isRecord(entry) && entry.id === "affected-targets",
  );
  if (!isRecord(dropdown) || !isRecord(dropdown.attributes)) {
    return invalidStructure(path);
  }
  const options = maintenanceOptions(configuration);
  dropdown.attributes.options = options;
  return { content: renderYaml(parsed.value) };
}

function renderMaintenanceWorkflow(
  source: string,
  path: string,
  configuration: NormalizedVelvetConfiguration,
): { content: string } | { error: TemplateFilesError } {
  const parsed = parseYamlRecord(source, path);
  if ("error" in parsed) return parsed;
  const trigger = parsed.value.on;
  const dispatch = isRecord(trigger) ? trigger.workflow_dispatch : undefined;
  const inputs = isRecord(dispatch) ? dispatch.inputs : undefined;
  const services = isRecord(inputs) ? inputs.services : undefined;
  if (!isRecord(services)) return invalidStructure(path);
  services.default = configuration.services[0]!.id;
  return { content: renderYaml(parsed.value) };
}

function configuredSecretNames(
  configuration: NormalizedVelvetConfiguration,
): string[] {
  return [
    ...new Set(
      configuration.services.flatMap((service) =>
        service.checks.flatMap((check) =>
          check.headers.map((header) => header.secret),
        ),
      ),
    ),
  ].sort();
}

function renderMonitorWorkflow(
  source: string,
  path: string,
  configuration: NormalizedVelvetConfiguration,
): { content: string } | { error: TemplateFilesError } {
  const parsed = parseYamlRecord(source, path);
  if ("error" in parsed) return parsed;
  const jobs = parsed.value.jobs;
  const monitor = isRecord(jobs) ? jobs.monitor : undefined;
  const steps = isRecord(monitor) ? monitor.steps : undefined;
  if (!Array.isArray(steps)) return invalidStructure(path);
  const actionSteps = steps.filter(
    (step) =>
      isRecord(step) &&
      typeof step.uses === "string" &&
      /^phranck\/velvet\/actions\/monitor@[a-f0-9]{40}$/u.test(step.uses),
  );
  if (actionSteps.length !== 1 || !isRecord(actionSteps[0])) {
    return invalidStructure(path);
  }
  const action = actionSteps[0];
  const names = configuredSecretNames(configuration);
  if (names.length === 0) {
    delete action.env;
  } else {
    action.env = Object.fromEntries(
      names.map((name) => [name, "${{ secrets." + name + " }}"]),
    );
  }
  return { content: renderYaml(parsed.value) };
}

/**
 * Builds the version lock for a release.
 *
 * @param manifest - Release being installed, which supplies every field but one.
 * @param serial - The installation's running number, carried in from outside
 *   because the manifest cannot know it. Absent for installations issued before
 *   serials existed, and the field is then left out entirely rather than
 *   written as a null.
 */
function renderVersionLock(
  manifest: VelvetReleaseManifest,
  serial: number | undefined,
): string {
  const lock = {
    schemaVersion: 1 as const,
    installedVersion: manifest.version,
    template: { ...manifest.template },
    configurationSchemaVersion:
      manifest.compatibility.configurationSchemaVersion,
    dataSchemaVersion: manifest.compatibility.dataSchemaVersion,
    ...(serial === undefined ? {} : { serial }),
  };
  const validation = validateVelvetVersionLock(lock);
  if (!validation.success) {
    throw new TypeError("Validated release manifest produced an invalid lock.");
  }
  return `${JSON.stringify(validation.data, null, 2)}\n`;
}

function invalidStructure(
  path: string,
): { error: TemplateFilesError } {
  return {
    error: templateError(
      "INVALID_TEMPLATE_SOURCE",
      path,
      "The managed template source does not have the required YAML structure.",
    ),
  };
}

function generateFile(
  file: VelvetManagedFile,
  source: string | undefined,
  configuration: NormalizedVelvetConfiguration,
  manifest: VelvetReleaseManifest,
  serial: number | undefined,
): { content: string } | { error: TemplateFilesError } {
  if (file.strategy === "replace") return { content: source! };
  switch (file.generator) {
    case "maintenance-issue-template-v1":
      return renderMaintenanceIssueTemplate(source!, file.path, configuration);
    case "maintenance-workflow-v1":
      return renderMaintenanceWorkflow(source!, file.path, configuration);
    case "pages-workflow-v1":
    case "response-times-workflow-v1":
    case "status-workflow-v1":
      return renderMonitorWorkflow(source!, file.path, configuration);
    case "version-lock-v1":
      return { content: renderVersionLock(manifest, serial) };
    default:
      return {
        error: templateError(
          "UNSUPPORTED_TEMPLATE_GENERATOR",
          "/managedFiles",
          "The release requests an unsupported template generator.",
        ),
      };
  }
}

export function materializeManagedTemplateFiles(
  input: MaterializeManagedTemplateFilesInput,
): ManagedTemplateFilesResult {
  const manifestValidation = validateVelvetReleaseManifest(input.manifest);
  if (!manifestValidation.success) {
    return {
      success: false,
      errors: [
        templateError(
          "INVALID_RELEASE_MANIFEST",
          manifestValidation.errors[0]?.path ?? "/",
          "The release manifest is invalid.",
        ),
      ],
    };
  }
  const manifest = manifestValidation.data;
  const verifiedSources = new Map<string, string>();
  for (const file of manifest.managedFiles) {
    if (
      file.strategy === "generate" &&
      file.generator === "version-lock-v1"
    ) {
      continue;
    }
    const verified = verifyTemplateSource(file, input.sources);
    if ("error" in verified) {
      return { success: false, errors: [verified.error] };
    }
    verifiedSources.set(file.path, verified.source);
  }

  const files: MaterializedTemplateFile[] = [];
  for (const file of manifest.managedFiles) {
    const rendered = generateFile(
      file,
      verifiedSources.get(file.path),
      input.configuration,
      manifest,
      input.serial,
    );
    if ("error" in rendered) {
      return { success: false, errors: [rendered.error] };
    }
    files.push({
      path: file.path,
      content: rendered.content,
      sha256: sha256(rendered.content),
    });
  }
  return { success: true, data: { files } };
}

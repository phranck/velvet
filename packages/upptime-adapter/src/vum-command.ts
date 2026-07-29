import { UpptimeAdapterError } from "./errors.js";
import { loadUpptimeMigrationSnapshot } from "./github.js";
import { materializeUpptimeMigration } from "./migration-materialization.js";
import {
  createUpptimeMigration,
  hasUpptimeMigrationCutoverBlockers,
} from "./migration.js";
import type {
  LoadedUpptimeMigrationSnapshot,
} from "./github.js";
import type {
  UpptimeMigrationResult,
} from "./migration-types.js";
import type { UpptimeSnapshot } from "./types.js";

interface VumOptions {
  repository: string;
  ref?: string;
  destination?: string;
  json: boolean;
  write: boolean;
  help: boolean;
}

export interface VumDependencies {
  load?: typeof loadUpptimeMigrationSnapshot;
  create?: (
    snapshot: UpptimeSnapshot,
    source: LoadedUpptimeMigrationSnapshot["source"],
  ) => UpptimeMigrationResult;
  materialize?: typeof materializeUpptimeMigration;
  write?: (value: string) => void;
}

export const VUM_USAGE = `Usage: vum --repository owner/repository [options]

Options:
  --ref <ref>               Pin a branch, tag, or commit before migration
  --json                    Print the machine-readable report
  --write                   Materialize the validated migration bundle
  --destination <directory> New or empty destination used with --write
  --help                    Show this help
`;

function invalidArguments(message: string): never {
  throw new UpptimeAdapterError("INVALID_INPUT", message);
}

function parseArguments(args: string[]): VumOptions {
  let repository: string | undefined;
  let ref: string | undefined;
  let destination: string | undefined;
  let json = false;
  let write = false;
  let help = false;
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined || !argument.startsWith("--")) {
      invalidArguments(`Unexpected argument ${argument ?? ""}`);
    }
    if (seen.has(argument)) {
      invalidArguments(`Duplicate option ${argument}`);
    }
    seen.add(argument);
    if (["--repository", "--ref", "--destination"].includes(argument)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--") || value.length === 0) {
        invalidArguments(`Missing value for ${argument}`);
      }
      index += 1;
      if (argument === "--repository") repository = value;
      if (argument === "--ref") ref = value;
      if (argument === "--destination") destination = value;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--write") {
      write = true;
      continue;
    }
    if (argument === "--help") {
      help = true;
      continue;
    }
    invalidArguments(`Unknown option ${argument}`);
  }

  if (help) {
    return {
      repository: repository ?? "",
      ...(ref === undefined ? {} : { ref }),
      ...(destination === undefined ? {} : { destination }),
      json,
      write,
      help,
    };
  }
  if (repository === undefined) {
    invalidArguments("Missing required option --repository");
  }
  if (write && destination === undefined) {
    invalidArguments("--write requires --destination");
  }
  if (!write && destination !== undefined) {
    invalidArguments("--destination requires --write");
  }
  return {
    repository,
    ...(ref === undefined ? {} : { ref }),
    ...(destination === undefined ? {} : { destination }),
    json,
    write,
    help,
  };
}

export async function runVum(
  args: string[],
  environment: Record<string, string | undefined> = process.env,
  dependencies: VumDependencies = {},
): Promise<void> {
  const options = parseArguments(args);
  const writeOutput = dependencies.write ?? ((value) => process.stdout.write(value));
  if (options.help) {
    writeOutput(VUM_USAGE);
    return;
  }
  const load = dependencies.load ?? loadUpptimeMigrationSnapshot;
  const create = dependencies.create ?? createUpptimeMigration;
  const materialize = dependencies.materialize ?? materializeUpptimeMigration;
  const loaded = await load({
    repository: options.repository,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
    ...(environment.GITHUB_TOKEN === undefined ||
    environment.GITHUB_TOKEN.length === 0
      ? {}
      : { token: environment.GITHUB_TOKEN }),
    ...(environment.GITHUB_API_URL === undefined ||
    environment.GITHUB_API_URL.length === 0
      ? {}
      : { apiBaseUrl: environment.GITHUB_API_URL }),
  });
  const migration = create(loaded.snapshot, loaded.source);
  if (options.write) {
    if (hasUpptimeMigrationCutoverBlockers(migration.report)) {
      throw new UpptimeAdapterError(
        "INVALID_INPUT",
        "Resolve every legacy incident reported as a cutover blocker before writing the migration bundle",
      );
    }
    await materialize(options.destination!, migration);
  }
  writeOutput(
    options.json
      ? `${JSON.stringify(migration.report, null, 2)}\n`
      : migration.reportMarkdown,
  );
}

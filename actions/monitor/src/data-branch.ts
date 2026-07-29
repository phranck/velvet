import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
  type IncidentsDocument,
} from "@velvet/contracts";
import {
  readMonitorState,
  updateMonitorState,
  type MonitorPersistentState,
  type MonitorRun,
  type MonitorStateContent,
} from "@velvet/monitor";

import { MonitorActionError } from "./errors.js";

const DATA_BRANCH = "velvet-data";
const STATE_PATH = ".velvet/monitor-state.json";
const STATUS_PATH = "velvet-data/v1/status.json";
const RESPONSE_TIMES_PATH = "velvet-data/v1/response-times.json";
const INCIDENTS_PATH = "velvet-data/v1/incidents.json";
const OWNED_PATHS = [
  STATE_PATH,
  INCIDENTS_PATH,
  RESPONSE_TIMES_PATH,
  STATUS_PATH,
] as const;
const DAY_MS = 86_400_000;
const ROOT_DATE_PREFIX = "Velvet-Root-Date: ";

type GitResult = { stdout: string; stderr: string };

export interface DataBranchSnapshot {
  revision: string | null;
  oldestCommitAt: string | null;
  state: MonitorPersistentState | null;
  incidents: IncidentsDocument | null;
}

export interface PublishDataBranchInput {
  run: MonitorRun;
  content: MonitorStateContent;
  incidents: IncidentsDocument;
  retentionDays: number;
}

export interface PublishDataBranchResult {
  outcome: "written" | "duplicate" | "stale";
  revision: string | null;
  compacted: boolean;
}

function git(
  workspace: string,
  arguments_: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      arguments_,
      { cwd: workspace, env, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            Object.assign(error, {
              stdout: String(stdout),
              stderr: String(stderr),
            }),
          );
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

async function remoteRevision(workspace: string): Promise<string | null> {
  let result: GitResult;
  try {
    result = await git(workspace, [
      "ls-remote",
      "--heads",
      "origin",
      `refs/heads/${DATA_BRANCH}`,
    ]);
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_GIT_FAILED", { cause });
  }
  const line = result.stdout.trim();
  if (line === "") return null;
  const revision = line.split(/\s+/u)[0];
  return revision?.match(/^[0-9a-f]{40}$/u) ? revision : null;
}

async function fetchDataRevision(
  workspace: string,
  revision: string,
): Promise<void> {
  try {
    await git(workspace, ["fetch", "--no-tags", "origin", revision]);
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_GIT_FAILED", { cause });
  }
}

async function show(
  workspace: string,
  revision: string,
  path: string,
): Promise<string> {
  try {
    return (await git(workspace, ["show", `${revision}:${path}`])).stdout;
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_INVALID", { cause });
  }
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_INVALID", { cause });
  }
}

async function parseState(source: string): Promise<MonitorPersistentState> {
  const directory = await mkdtemp(join(tmpdir(), "velvet-data-state-"));
  const path = join(directory, "monitor-state.json");
  try {
    await writeFile(path, source, { encoding: "utf8", mode: 0o600 });
    const state = await readMonitorState(path);
    if (state === null) {
      throw new MonitorActionError("DATA_BRANCH_INVALID");
    }
    return state;
  } catch (cause) {
    if (cause instanceof MonitorActionError) throw cause;
    throw new MonitorActionError("DATA_BRANCH_INVALID", { cause });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function rootDate(message: string): string | null {
  const value = message
    .split("\n")
    .find((line) => line.startsWith(ROOT_DATE_PREFIX))
    ?.slice(ROOT_DATE_PREFIX.length);
  if (value === undefined) return null;
  try {
    return new Date(value).toISOString() === value ? value : null;
  } catch {
    return null;
  }
}

export async function loadDataBranch(
  workspace: string,
): Promise<DataBranchSnapshot> {
  const revision = await remoteRevision(workspace);
  if (revision === null) {
    return {
      revision: null,
      oldestCommitAt: null,
      state: null,
      incidents: null,
    };
  }
  await fetchDataRevision(workspace, revision);

  let listedPaths: string[];
  let message: string;
  try {
    listedPaths = (
      await git(workspace, ["ls-tree", "-r", "--name-only", revision])
    ).stdout
      .trim()
      .split("\n")
      .filter(Boolean);
    message = (
      await git(workspace, ["show", "-s", "--format=%B", revision])
    ).stdout;
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_GIT_FAILED", { cause });
  }
  if (
    listedPaths.length !== OWNED_PATHS.length ||
    listedPaths.some((path, index) => path !== OWNED_PATHS[index])
  ) {
    throw new MonitorActionError("DATA_BRANCH_INVALID");
  }

  const [stateSource, statusSource, responseTimesSource, incidentsSource] =
    await Promise.all([
      show(workspace, revision, STATE_PATH),
      show(workspace, revision, STATUS_PATH),
      show(workspace, revision, RESPONSE_TIMES_PATH),
      show(workspace, revision, INCIDENTS_PATH),
    ]);
  const state = await parseState(stateSource);
  const status = parseJson(statusSource);
  const responseTimes = parseJson(responseTimesSource);
  const incidents = parseJson(incidentsSource);
  if (
    !validateStatusDocument(status).success ||
    !validateResponseTimesDocument(responseTimes).success ||
    !validateIncidentsDocument(incidents).success ||
    JSON.stringify(status) !== JSON.stringify(state.documents.status) ||
    JSON.stringify(responseTimes) !==
      JSON.stringify(state.documents.responseTimes)
  ) {
    throw new MonitorActionError("DATA_BRANCH_INVALID");
  }
  const oldestCommitAt = rootDate(message);
  if (oldestCommitAt === null) {
    throw new MonitorActionError("DATA_BRANCH_INVALID");
  }
  return {
    revision,
    oldestCommitAt,
    state,
    incidents: incidents as IncidentsDocument,
  };
}

async function persistedState(
  base: MonitorPersistentState | null,
  run: MonitorRun,
  content: MonitorStateContent,
): Promise<{
  outcome: "written" | "duplicate" | "stale";
  state: MonitorPersistentState;
}> {
  const directory = await mkdtemp(join(tmpdir(), "velvet-data-candidate-"));
  const path = join(directory, STATE_PATH);
  try {
    await mkdir(dirname(path), { recursive: true });
    if (base !== null) {
      await writeFile(path, `${JSON.stringify(base, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    }
    return await updateMonitorState(path, run, () => content);
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_INVALID", { cause });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createTree(
  workspace: string,
  files: ReadonlyMap<string, string>,
): Promise<{ tree: string; cleanup: () => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), "velvet-data-tree-"));
  const indexPath = join(directory, "index");
  const gitEnvironment = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    await git(workspace, ["read-tree", "--empty"], gitEnvironment);
    for (const path of OWNED_PATHS) {
      const filePath = join(directory, "files", path);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, files.get(path)!, "utf8");
      const blob = (
        await git(workspace, ["hash-object", "-w", filePath])
      ).stdout.trim();
      await git(
        workspace,
        ["update-index", "--add", "--cacheinfo", "100644", blob, path],
        gitEnvironment,
      );
    }
    const tree = (
      await git(workspace, ["write-tree"], gitEnvironment)
    ).stdout.trim();
    return {
      tree,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (cause) {
    await rm(directory, { recursive: true, force: true });
    throw new MonitorActionError("DATA_BRANCH_GIT_FAILED", { cause });
  }
}

async function createCommit(
  workspace: string,
  tree: string,
  parent: string | null,
  run: MonitorRun,
  rootStartedAt: string,
): Promise<string> {
  const subject =
    run.kind === "uptime"
      ? "Chore: update Velvet status [skip ci]"
      : "Chore: sample Velvet response times [skip ci]";
  const arguments_ = [
    "commit-tree",
    tree,
    ...(parent === null ? [] : ["-p", parent]),
    "-m",
    subject,
    "-m",
    `${ROOT_DATE_PREFIX}${rootStartedAt}`,
  ];
  try {
    return (
      await git(workspace, arguments_, {
        ...process.env,
        GIT_AUTHOR_NAME: "github-actions[bot]",
        GIT_AUTHOR_EMAIL:
          "41898282+github-actions[bot]@users.noreply.github.com",
        GIT_COMMITTER_NAME: "github-actions[bot]",
        GIT_COMMITTER_EMAIL:
          "41898282+github-actions[bot]@users.noreply.github.com",
        GIT_AUTHOR_DATE: run.completedAt,
        GIT_COMMITTER_DATE: run.completedAt,
      })
    ).stdout.trim();
  } catch (cause) {
    throw new MonitorActionError("DATA_BRANCH_GIT_FAILED", { cause });
  }
}

export async function publishDataBranch(
  workspace: string,
  base: DataBranchSnapshot,
  input: PublishDataBranchInput,
): Promise<PublishDataBranchResult> {
  const currentRemote = await remoteRevision(workspace);
  if (currentRemote !== base.revision) {
    throw new MonitorActionError("DATA_BRANCH_CONFLICT");
  }
  if (!validateIncidentsDocument(input.incidents).success) {
    throw new MonitorActionError("DATA_BRANCH_INVALID");
  }
  const persisted = await persistedState(
    base.state,
    input.run,
    input.content,
  );
  if (persisted.outcome !== "written") {
    return {
      outcome: persisted.outcome,
      revision: base.revision,
      compacted: false,
    };
  }

  const compacted =
    base.oldestCommitAt !== null &&
    Date.parse(base.oldestCommitAt) <
      Date.parse(input.run.completedAt) - input.retentionDays * DAY_MS;
  const rootStartedAt = compacted
    ? input.run.completedAt
    : (base.oldestCommitAt ?? input.run.completedAt);
  const files = new Map<string, string>([
    [STATE_PATH, `${JSON.stringify(persisted.state, null, 2)}\n`],
    [STATUS_PATH, `${JSON.stringify(persisted.state.documents.status, null, 2)}\n`],
    [
      RESPONSE_TIMES_PATH,
      `${JSON.stringify(persisted.state.documents.responseTimes, null, 2)}\n`,
    ],
    [INCIDENTS_PATH, `${JSON.stringify(input.incidents, null, 2)}\n`],
  ]);
  const { tree, cleanup } = await createTree(workspace, files);
  try {
    const commit = await createCommit(
      workspace,
      tree,
      compacted ? null : base.revision,
      input.run,
      rootStartedAt,
    );
    const pushArguments = [
      "push",
      ...(compacted && base.revision !== null
        ? [
            `--force-with-lease=refs/heads/${DATA_BRANCH}:${base.revision}`,
          ]
        : []),
      "origin",
      `${commit}:refs/heads/${DATA_BRANCH}`,
    ];
    try {
      await git(workspace, pushArguments);
    } catch (cause) {
      const latest = await remoteRevision(workspace).catch(() => null);
      if (latest !== base.revision) {
        throw new MonitorActionError("DATA_BRANCH_CONFLICT", { cause });
      }
      throw new MonitorActionError("DATA_BRANCH_GIT_FAILED", { cause });
    }
    return { outcome: "written", revision: commit, compacted };
  } finally {
    await cleanup();
  }
}

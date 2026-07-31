import { createHash, randomUUID } from "node:crypto";

import {
  serializeVelvetConfiguration,
  type NormalizedVelvetConfiguration,
  type SetupEvent,
  type SetupProgressStage,
  type SetupRequest,
} from "@velvet/contracts";
import { materializeManagedTemplateFiles } from "@velvet/template-files";

import {
  GitHubApiError,
  VERSION_LOCK_PATH,
  type GitHubSetupClient,
  type GitHubWorkflowJob,
} from "./github.js";
import { embeddedVelvetReleases } from "./update-releases.js";
import type { ManagedUpdateReleaseProvider } from "./update-orchestrator-types.js";
import type { SetupServerSession } from "./session.js";
import { publicSetupError, SetupServiceError } from "./setup-error.js";

type SetupSuccessEvent = Extract<SetupEvent, { type: "success" }>;

const DEPLOYMENT_STAGES = [
  "checking-services",
  "publishing-data",
  "building-page",
  "deploying-page",
] as const satisfies readonly SetupProgressStage[];

const WORKFLOW_JOB_NAMES = {
  monitor: "Check services and publish initial data",
  build: "Build status page",
  deploy: "Deploy to GitHub Pages",
} as const;

interface ProvisionVelvetInput {
  session: SetupServerSession;
  request: SetupRequest;
  github: GitHubSetupClient;
  onEvent: (event: SetupEvent) => void;
  releases?: ManagedUpdateReleaseProvider;
  operationId?: () => string;
  errorId?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  maxConfigurationAccessChecks?: number;
  maxWorkflowChecks?: number;
}

export async function provisionVelvet(
  input: ProvisionVelvetInput,
): Promise<SetupSuccessEvent> {
  const userToken = input.session.githubUserToken;
  if (!userToken) {
    throw new SetupServiceError(
      "AUTHENTICATION_REQUIRED",
      "Connect your GitHub account before starting setup.",
      { status: 401, recoverable: true },
    );
  }
  const owner = input.request.configuration.repository.owner;
  const repositoryName = input.request.configuration.repository.name;
  const customDomain = input.request.configuration.statusPage.customDomain;
  const source = serializeVelvetConfiguration(input.request.configuration);
  const configurationHash = createHash("sha256").update(source).digest("hex");
  const existing = input.session.provisioning;
  if (existing && existing.configurationHash !== configurationHash) {
    throw new SetupServiceError(
      "SETUP_PARTIAL",
      "This session already started a different setup. Sign out before starting another one.",
      { status: 409 },
    );
  }
  if (
    existing?.installationUrl &&
    existing.repository &&
    input.session.operation?.state === "succeeded"
  ) {
    return {
      type: "success",
      installationUrl: existing.installationUrl,
      repositoryUrl: existing.repository.htmlUrl,
      ...(existing.workflowRunId
        ? { workflowRunId: existing.workflowRunId }
        : {}),
    };
  }

  const operationId =
    input.session.operation?.operationId ??
    (input.operationId ?? (() => randomUUID().replaceAll("-", "")))();
  const errorId = input.errorId ?? (() => randomUUID().replaceAll("-", ""));
  const sleep = input.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const state =
    existing ??
    (input.session.provisioning = {
      configurationHash,
    });
  let stage: SetupProgressStage = "creating-repository";
  let lastEmittedStage: SetupProgressStage | null = null;
  let deploymentStageIndex = -1;

  const progress = (nextStage: SetupProgressStage): void => {
    if (nextStage === lastEmittedStage) return;
    stage = nextStage;
    lastEmittedStage = nextStage;
    input.session.operation = {
      operationId,
      state: "running",
      stage,
      ...(state.repository ? { repositoryUrl: state.repository.htmlUrl } : {}),
      ...(state.workflowRunId ? { workflowRunId: state.workflowRunId } : {}),
    };
    input.onEvent({ type: "progress", stage });
  };

  const progressThrough = (nextStage: (typeof DEPLOYMENT_STAGES)[number]): void => {
    const nextIndex = DEPLOYMENT_STAGES.indexOf(nextStage);
    for (let index = deploymentStageIndex + 1; index <= nextIndex; index += 1) {
      progress(DEPLOYMENT_STAGES[index]!);
    }
    deploymentStageIndex = Math.max(deploymentStageIndex, nextIndex);
  };

  try {
    if (!state.repository) {
      progress("creating-repository");
      const installation = installationForOwner(input.session, owner);
      if (!installation) {
        const target = state.target ?? await input.github.account(userToken, owner);
        if (target.login.toLowerCase() !== owner.toLowerCase()) {
          throw new SetupServiceError(
            "GITHUB_API_FAILED",
            "GitHub returned an unexpected installation target.",
            { recoverable: true },
          );
        }
        state.target = target;
        throw installationRequired(false);
      }
      const repository = await input.github.createRepositoryFromTemplate(
        userToken,
        owner,
        repositoryName,
      );
      if (
        repository.owner.toLowerCase() !== owner.toLowerCase() ||
        repository.name !== repositoryName
      ) {
        throw new SetupServiceError(
          "GITHUB_API_FAILED",
          "GitHub returned an unexpected repository.",
          { recoverable: true },
        );
      }
      state.repository = {
        id: repository.id,
        owner: repository.owner,
        ownerId: repository.ownerId,
        name: repository.name,
        htmlUrl: repository.htmlUrl,
      };
    }

    const installation = installationForOwner(input.session, owner);
    if (!installation) {
      throw installationRequired(true);
    }
    if (installation.repositorySelection === "all") {
      await input.github.deleteInstallation(installation.id);
      delete input.session.installation;
      throw installationRequired(true);
    }
    const installationToken = await input.github.createInstallationToken(
      installation.id,
      state.repository.id,
    );

    if (!state.configurationCommitted) {
      progress("writing-configuration");
      const configurationSha = await waitForConfigurationAccess({
        github: input.github,
        installationToken,
        owner: state.repository.owner,
        repository: state.repository.name,
        sleep,
        maxChecks: input.maxConfigurationAccessChecks ?? 20,
      });
      await input.github.writeConfiguration(
        installationToken,
        state.repository.owner,
        state.repository.name,
        source,
        configurationSha,
      );
      state.configurationCommitted = true;
    }

    if (!state.versionLockCommitted) {
      await input.github.writeVersionLock(
        installationToken,
        state.repository.owner,
        state.repository.name,
        await versionLockSource(
          input.releases ?? embeddedVelvetReleases(),
          input.request.configuration,
        ),
      );
      state.versionLockCommitted = true;
    }

    if (!state.pagesEnabled) {
      progress("enabling-pages");
      try {
        await input.github.enablePages(
          installationToken,
          state.repository.owner,
          state.repository.name,
        );
      } catch (error) {
        if (!(error instanceof GitHubApiError) || error.status !== 409) throw error;
        await input.github.pages(
          installationToken,
          state.repository.owner,
          state.repository.name,
        );
      }
      if (customDomain) {
        await input.github.configurePagesCustomDomain(
          installationToken,
          state.repository.owner,
          state.repository.name,
          customDomain,
        );
      }
      state.pagesEnabled = true;
    }

    if (state.workflowFailed) {
      delete state.workflowRunId;
      delete state.workflowFailed;
    }
    if (!state.workflowRunId) {
      progress("starting-monitor");
      state.workflowRunId = await input.github.dispatchWorkflow(
        installationToken,
        state.repository.owner,
        state.repository.name,
      );
    }

    const maxWorkflowChecks = input.maxWorkflowChecks ?? 120;
    let completed = false;
    for (let check = 0; check < maxWorkflowChecks; check += 1) {
      const jobs = await input.github.workflowJobs(
        installationToken,
        state.repository.owner,
        state.repository.name,
        state.workflowRunId,
      );
      const currentDeploymentStage = deploymentStageForJobs(jobs);
      if (currentDeploymentStage) progressThrough(currentDeploymentStage);
      const run = await input.github.workflowRun(
        installationToken,
        state.repository.owner,
        state.repository.name,
        state.workflowRunId,
      );
      if (run.status === "completed") {
        if (run.conclusion !== "success") {
          state.workflowFailed = true;
          throw new SetupServiceError(
            "WORKFLOW_FAILED",
            "The initial Velvet workflow did not complete successfully.",
            { recoverable: true },
          );
        }
        delete state.workflowFailed;
        completed = true;
        break;
      }
      await sleep(2_000);
    }
    if (!completed) {
      throw new SetupServiceError(
        "SETUP_PARTIAL",
        "The repository is configured, but deployment is still running. You can retry this check.",
        { status: 202, recoverable: true },
      );
    }

    progressThrough("deploying-page");
    progress("waiting-for-deployment");

    const pages = await input.github.pages(
      installationToken,
      state.repository.owner,
      state.repository.name,
    );
    const installationUrl = customDomain
      ? `https://${customDomain}/`
      : pages.htmlUrl;
    state.installationUrl = installationUrl;
    const result: SetupSuccessEvent = {
      type: "success",
      installationUrl,
      repositoryUrl: state.repository.htmlUrl,
      workflowRunId: state.workflowRunId,
    };
    input.session.operation = {
      operationId,
      state: "succeeded",
      stage,
      installationUrl,
      repositoryUrl: state.repository.htmlUrl,
      workflowRunId: state.workflowRunId,
    };
    input.onEvent(result);
    return result;
  } catch (error) {
    const setupError = classifyProvisioningError(error, stage, Boolean(state.repository));
    const publicError = publicSetupError(setupError, errorId());
    input.session.operation = {
      operationId,
      state: "failed",
      stage,
      ...(state.repository ? { repositoryUrl: state.repository.htmlUrl } : {}),
      ...(state.workflowRunId ? { workflowRunId: state.workflowRunId } : {}),
      error: publicError,
      recoverable: setupError.recoverable,
    };
    throw setupError;
  }
}

/**
 * Renders the version lock that records which Velvet release an installation
 * starts on.
 *
 * The lock is produced by the same generator a managed update uses, so a fresh
 * installation records exactly what an update would write for that release.
 * Without it an installation has no version to compare against and can never
 * be updated.
 *
 * @param releases - Source describing the release being installed.
 * @param configuration - Validated configuration for the new repository.
 * @returns The serialized `velvet.lock.json` content.
 * @throws When the release cannot produce a lock, which means the compiled-in
 *   release artefact is broken and setup must not continue.
 */
async function versionLockSource(
  releases: ManagedUpdateReleaseProvider,
  configuration: NormalizedVelvetConfiguration,
): Promise<string> {
  const release = await releases.get(releases.latest());
  const materialized = materializeManagedTemplateFiles({
    manifest: release.manifest,
    configuration,
    sources: release.sources,
  });
  const lock = materialized.success
    ? materialized.data.files.find((file) => file.path === VERSION_LOCK_PATH)
    : undefined;
  if (!lock) {
    throw new SetupServiceError(
      "CONFIGURATION_COMMIT_FAILED",
      "The repository was created, but its Velvet version could not be recorded.",
      { recoverable: true },
    );
  }
  return lock.content;
}

function deploymentStageForJobs(
  jobs: readonly GitHubWorkflowJob[],
): (typeof DEPLOYMENT_STAGES)[number] | null {
  const byName = new Map(jobs.map((job) => [job.name, job]));
  const deploy = byName.get(WORKFLOW_JOB_NAMES.deploy);
  if (deploy?.status === "in_progress" || deploy?.status === "completed") {
    return "deploying-page";
  }
  const build = byName.get(WORKFLOW_JOB_NAMES.build);
  if (build?.status === "in_progress" || build?.status === "completed") {
    return "building-page";
  }
  const monitor = byName.get(WORKFLOW_JOB_NAMES.monitor);
  if (monitor?.status === "completed" && monitor.conclusion === "success") {
    return "publishing-data";
  }
  return monitor ? "checking-services" : null;
}

async function waitForConfigurationAccess(input: {
  github: GitHubSetupClient;
  installationToken: string;
  owner: string;
  repository: string;
  sleep: (milliseconds: number) => Promise<void>;
  maxChecks: number;
}): Promise<string> {
  for (let check = 0; check < input.maxChecks; check += 1) {
    try {
      return await input.github.getConfigurationSha(
        input.installationToken,
        input.owner,
        input.repository,
      );
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    }
    if (check + 1 < input.maxChecks) await input.sleep(500);
  }
  throw new SetupServiceError(
    "SETUP_PARTIAL",
    "GitHub is still granting Velvet access to the new repository. Retry setup.",
    { status: 503, recoverable: true },
  );
}

function installationForOwner(
  session: SetupServerSession,
  owner: string,
): SetupServerSession["installation"] | undefined {
  const installation = session.installation;
  return installation?.accountLogin.toLowerCase() === owner.toLowerCase()
    ? installation
    : undefined;
}

function installationRequired(repositoryCreated: boolean): SetupServiceError {
  return new SetupServiceError(
    "INSTALLATION_REQUIRED",
    repositoryCreated
      ? "Install Velvet for the selected repository before continuing."
      : "Temporarily install Velvet so it can create the selected repository.",
    { status: 403, recoverable: true },
  );
}

function classifyProvisioningError(
  error: unknown,
  stage: SetupProgressStage,
  repositoryCreated: boolean,
): SetupServiceError {
  if (error instanceof SetupServiceError) return error;
  if (
    error instanceof GitHubApiError &&
    (error.status === 429 ||
      (error.status === 403 && error.retryAfterSeconds !== null))
  ) {
    return new SetupServiceError(
      "GITHUB_RATE_LIMITED",
      "GitHub temporarily limited setup requests. Try again later.",
      { status: 503, recoverable: true, cause: error },
    );
  }
  if (
    stage === "creating-repository" &&
    error instanceof GitHubApiError &&
    error.status === 422
  ) {
    return new SetupServiceError(
      "REPOSITORY_CONFLICT",
      "A repository with this name already exists or cannot be created.",
      { status: 409, cause: error },
    );
  }

  const stageErrors: Partial<
    Record<SetupProgressStage, { code: SetupServiceError["code"]; message: string }>
  > = {
    "writing-configuration": {
      code: "CONFIGURATION_COMMIT_FAILED",
      message: "The repository was created, but its Velvet configuration could not be written.",
    },
    "enabling-pages": {
      code: "PAGES_ENABLE_FAILED",
      message: "The repository was configured, but GitHub Pages could not be enabled.",
    },
    "starting-monitor": {
      code: "WORKFLOW_DISPATCH_FAILED",
      message: "Velvet was configured, but the initial workflow could not be started.",
    },
    "waiting-for-deployment": {
      code: "SETUP_PARTIAL",
      message: "Velvet setup is incomplete. You can retry without creating another repository.",
    },
  };
  const mapped = stageErrors[stage];
  if (mapped) {
    return new SetupServiceError(mapped.code, mapped.message, {
      recoverable: true,
      cause: error,
    });
  }
  return new SetupServiceError(
    repositoryCreated ? "SETUP_PARTIAL" : "GITHUB_API_FAILED",
    repositoryCreated
      ? "Velvet setup is incomplete. You can retry without creating another repository."
      : "GitHub could not create the Velvet repository.",
    { recoverable: true, cause: error },
  );
}

import { createHash, randomUUID } from "node:crypto";

import {
  INITIAL_TEMPLATE_PATHS,
  serializeVelvetConfiguration,
  type SetupLogo,
  type NormalizedVelvetConfiguration,
  type SetupEvent,
  type SetupProgressStage,
  type SetupRequest,
} from "@velvet/contracts";
import { materializeManagedTemplateFiles } from "@velvet/template-files";

import {
  GitHubApiError,
  VERSION_LOCK_PATH,
  type GitHubManagedSetupFile,
  type GitHubSetupClient,
  type GitHubWorkflowJob,
} from "./github.js";
import { embeddedVelvetReleases } from "./update-releases.js";
import type { ManagedUpdateReleaseProvider } from "./update-orchestrator-types.js";
import type { InstallationSerialCounter } from "./serial.js";
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
  /**
   * Issues the installation's serial, when the instance has a registry.
   *
   * Absent on an instance without one, and a failure to claim is swallowed
   * rather than raised, because a repository that is already built, monitored,
   * and published must not be reported as failed over a number.
   */
  serials?: InstallationSerialCounter;
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
  /*
   * A logo travels with the request as a file and is written into the
   * installation's own repository, so the configuration names a path beside
   * `velvet.yml` rather than a host somebody else controls. The page build
   * copies it into the published output, where that same relative path
   * resolves.
   */
  const logo = input.request.logo
    ? { path: logoPath(input.request.logo.type), content: input.request.logo.content }
    : null;
  const configuration = logo
    ? {
        ...input.request.configuration,
        statusPage: {
          ...input.request.configuration.statusPage,
          logoUrl: `./${logo.path}`,
        },
      }
    : input.request.configuration;
  const source = serializeVelvetConfiguration(configuration);
  const configurationHash = createHash("sha256").update(source).digest("hex");
  /*
   * A session holds the state of the setup it started. Where a different
   * configuration arrives, that state belongs to something else and cannot be
   * continued.
   *
   * It only has to be defended where a repository exists, because that is the
   * thing a second setup could damage. An attempt that created nothing leaves
   * nothing to protect, and refusing there stranded anybody who corrected a
   * name after a failure: the message asked them to sign out, and the
   * onboarding offers no way to.
   */
  const existing =
    input.session.provisioning?.configurationHash === configurationHash
      ? input.session.provisioning
      : undefined;
  if (input.session.provisioning && !existing) {
    const stranded = input.session.provisioning.repository;
    if (stranded) {
      throw new SetupServiceError(
        "SETUP_PARTIAL",
        `This session already created ${stranded.owner}/${stranded.name}. Sign out before starting another setup.`,
        { status: 409 },
      );
    }
    delete input.session.provisioning;
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
      ...(existing.serial ? { serial: existing.serial } : {}),
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
        throw installationRequired("create");
      }
      // Asked before anything is created, and before the approval GitHub would
      // otherwise demand first. Finding out that a name is taken after two
      // approvals and a redirect is a worse way to learn it.
      const taken = await input.github.findRepository(
        userToken,
        owner,
        repositoryName,
      );
      if (taken) {
        if (input.request.replaceExistingRepository !== true) {
          throw new SetupServiceError(
            "REPOSITORY_EXISTS",
            `${owner}/${repositoryName} already exists.`,
            { status: 409, recoverable: true },
          );
        }
        // A user token reaches every public repository, so setup can see one it
        // is not installed on and could not delete. Asked before the deletion
        // rather than discovered by attempting it, because GitHub's refusal
        // arrives as a bare 403 that says nothing about what to do next.
        const managing = await input.github.repositoryInstallationId(
          owner,
          repositoryName,
        );
        if (managing !== installation.id) {
          throw new SetupServiceError(
            "REPOSITORY_NOT_DELETABLE",
            `Velvet cannot delete ${owner}/${repositoryName}, because it does not manage it. Delete it on GitHub yourself, or choose another name.`,
            { status: 409, recoverable: true },
          );
        }
        // Only here, and only because a request said so by name. What goes with
        // the repository cannot be brought back by anything in this product.
        await input.github.deleteRepository(userToken, owner, repositoryName);
      }
      const repository = await input.github.createRepository(
        userToken,
        owner,
        repositoryName,
        // Public unless asked otherwise, which is what every installation made
        // before the choice existed received.
        input.request.repositoryVisibility ?? "public",
        input.session.user?.login.toLowerCase() === owner.toLowerCase(),
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
      throw installationRequired("use");
    }
    if (installation.repositorySelection === "all") {
      await input.github.deleteInstallation(installation.id);
      delete input.session.installation;
      throw installationRequired("use");
    }
    const setupToken = await input.github.createInstallationToken(
      installation.id,
      state.repository.id,
    );
    const installationToken = setupToken.token;

    if (!state.configurationCommitted) {
      progress("writing-configuration");
      await waitForRepositoryAccess({
        github: input.github,
        installationToken,
        owner: state.repository.owner,
        repository: state.repository.name,
        sleep,
        maxChecks: input.maxConfigurationAccessChecks ?? 20,
      });
      // Null on a first setup, where Velvet creates this file, and a SHA on a
      // repeated one, where it replaces what the previous attempt left.
      const configurationSha = await input.github.getConfigurationSha(
        installationToken,
        state.repository.owner,
        state.repository.name,
      );
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
      await input.github.writeManagedFiles(
        installationToken,
        state.repository.owner,
        state.repository.name,
        await managedSetupFiles(
          input.releases ?? embeddedVelvetReleases(),
          configuration,
          setupToken.canWriteWorkflows,
          undefined,
          true,
          logo,
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
    // Claimed here, at the last step, so a number is never spent on a setup
    // that stopped earlier. A retry reuses the one already recorded on the
    // session rather than taking a second.
    if (state.serial === undefined) {
      const claimed = await claimSerial(input, {
        repository: `${state.repository.owner}/${state.repository.name}`,
        statusPageName: input.request.configuration.statusPage.name,
        url: installationUrl,
        ...(customDomain ? { customDomain } : {}),
      });
      if (claimed !== undefined) state.serial = claimed;
      // Written a second time, because the lock went in at the
      // writing-configuration step and the number did not exist yet. Only the
      // lock is rewritten, and only when a number was actually issued.
      //
      // A failure here leaves the number issued in the registry but absent from
      // the installation, so its page shows nothing. That matches how the rest
      // of this feature fails: never by stopping a setup that has otherwise
      // succeeded.
      if (state.serial !== undefined && !state.serialRecorded) {
        try {
          await input.github.writeManagedFiles(
            installationToken,
            state.repository.owner,
            state.repository.name,
            await managedSetupFiles(
              input.releases ?? embeddedVelvetReleases(),
              configuration,
              false,
              state.serial,
            ),
          );
          state.serialRecorded = true;
        } catch {
          // Swallowed for the same reason claiming is: a repository that is
          // built, monitored, and published must not be reported as failed
          // over a number. The page then shows none.
        }
      }
    }
    const result: SetupSuccessEvent = {
      type: "success",
      installationUrl,
      repositoryUrl: state.repository.htmlUrl,
      workflowRunId: state.workflowRunId,
      ...(state.serial ? { serial: state.serial } : {}),
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
 * Claims the installation's serial, tolerating a registry that will not answer.
 *
 * A failure here is logged by the caller's error path and otherwise ignored. The
 * repository exists, its monitor ran, and its page is live; refusing to report
 * that because a counter was unreachable would turn a decorative number into a
 * cause of failed setups.
 *
 * @param input - The provisioning input, for the counter and the event sink.
 * @param installation - What to record against the number.
 * @returns The serial, or `undefined` when none could be issued.
 */
async function claimSerial(
  input: ProvisionVelvetInput,
  installation: {
    repository: string;
    statusPageName: string;
    url: string;
    customDomain?: string;
  },
): Promise<number | undefined> {
  if (!input.serials) return undefined;
  try {
    return await input.serials.claim(installation);
  } catch {
    return undefined;
  }
}

/**
 * Builds the Velvet-owned files a new installation starts with.
 *
 * They come from the same generator a managed update uses, so a fresh
 * installation is byte-identical to what an update would produce for that
 * configuration. This is what makes a check with a header secret work at all:
 * the template ships a commented-out placeholder where the secret mapping
 * belongs, and only this generator fills it in.
 *
 * @param releases - Source describing the release being installed.
 * @param configuration - Validated configuration for the new repository.
 * @param canWriteWorkflows - Whether the token may write workflow files. When
 *   it may not, only the version lock is written, so setup still completes on
 *   an installation whose app grant predates that permission.
 * @returns The files to commit, always including the version lock.
 * @throws When the release cannot produce them, because an installation
 *   without a lock could never be updated.
 */
async function managedSetupFiles(
  releases: ManagedUpdateReleaseProvider,
  configuration: NormalizedVelvetConfiguration,
  canWriteWorkflows: boolean,
  serial?: number,
  includeInitial = false,
  logo: { path: string; content: string } | null = null,
): Promise<GitHubManagedSetupFile[]> {
  const release = await releases.get(releases.latest());
  const materialized = materializeManagedTemplateFiles({
    manifest: release.manifest,
    configuration,
    sources: release.sources,
    ...(serial === undefined ? {} : { serial }),
  });
  if (!materialized.success) {
    throw new SetupServiceError(
      "CONFIGURATION_COMMIT_FAILED",
      "The repository was created, but its Velvet version could not be recorded.",
      { recoverable: true },
    );
  }
  const files: GitHubManagedSetupFile[] = materialized.data.files.map(
    ({ path, content }) => ({ path, content }),
  );
  /*
   * The files a new repository is given once and then owns: its licence, its
   * README, its `.gitattributes`. They travel in the same artefact as the
   * managed ones and are written only here, at creation, because an update
   * that replaced somebody's README would be taking back something Velvet
   * gave them.
   */
  if (includeInitial) {
    for (const path of INITIAL_TEMPLATE_PATHS) {
      const content = (release.sources as Record<string, string>)[path];
      if (typeof content !== "string") continue;
      files.push({
        path,
        content:
          path === "README.md" ? renderReadme(content, configuration) : content,
      });
    }
    // Written once, with the rest of what a repository starts with. An update
    // never touches it, so a logo replaced later stays replaced.
    if (logo) files.push({ path: logo.path, content: logo.content, encoding: "base64" });
  }
  const lock = files.find((file) => file.path === VERSION_LOCK_PATH);
  if (!lock) {
    throw new SetupServiceError(
      "CONFIGURATION_COMMIT_FAILED",
      "The repository was created, but its Velvet version could not be recorded.",
      { recoverable: true },
    );
  }
  return canWriteWorkflows ? files : [lock];
}

/**
 * Fills the README with what this installation is.
 *
 * Only its name and where it is published, both of which say what the
 * repository is for. Nothing countable goes in: the file is written once and
 * never touched again, whilst the services, the intervals, and the retention
 * live in `velvet.yml` and change without it.
 *
 * @param template - The README as the release carries it, with its placeholders.
 * @param configuration - The installation's own validated configuration.
 * @returns The README this repository keeps.
 */
function renderReadme(
  template: string,
  configuration: NormalizedVelvetConfiguration,
): string {
  const { owner, name } = configuration.repository;
  const domain = configuration.statusPage.customDomain;
  const url = domain
    ? `https://${domain}`
    : `https://${owner}.github.io/${name}/`;
  const link = `[${domain ?? `${owner}.github.io/${name}`}](${url})`;
  return template
    .replaceAll("{{statusPageName}}", configuration.statusPage.name)
    .replaceAll("{{statusPageUrl}}", link);
}

/**
 * The name a logo is written under, from what the file is.
 *
 * One name per format rather than the name it was uploaded with, so nothing a
 * person typed becomes a path in their repository, and so the page build knows
 * what to look for without being told.
 *
 * @param type - The media type the request declared.
 * @returns The path, beside `velvet.yml` in the repository root.
 */
function logoPath(type: SetupLogo["type"]): string {
  const names: Record<SetupLogo["type"], string> = {
    "image/svg+xml": "logo.svg",
    "image/png": "logo.png",
    "image/webp": "logo.webp",
    "image/jpeg": "logo.jpg",
  };
  return names[type];
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

/**
 * Waits until the installation token can read the new repository.
 *
 * GitHub takes a moment to grant a token access to a repository created a
 * second earlier, and every write that follows needs that access. The check
 * asks for the repository itself: the first file Velvet writes does not exist
 * until after this returns, so waiting for one would wait forever.
 */
async function waitForRepositoryAccess(input: {
  github: GitHubSetupClient;
  installationToken: string;
  owner: string;
  repository: string;
  sleep: (milliseconds: number) => Promise<void>;
  maxChecks: number;
}): Promise<void> {
  for (let check = 0; check < input.maxChecks; check += 1) {
    if (
      await input.github.repositoryReadable(
        input.installationToken,
        input.owner,
        input.repository,
      )
    ) {
      return;
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

/** What the missing installation is needed for, which is what somebody is told. */
type InstallationPurpose = "create" | "use";

const INSTALLATION_MESSAGES: Record<InstallationPurpose, string> = {
  create: "Temporarily install Velvet so it can create the selected repository.",
  use: "Install Velvet for the selected repository before continuing.",
};

function installationRequired(purpose: InstallationPurpose): SetupServiceError {
  return new SetupServiceError(
    "INSTALLATION_REQUIRED",
    INSTALLATION_MESSAGES[purpose],
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

import { VELVET_UPDATE_CHECK_NAME } from "@velvet/contracts";

import type { SetupServiceConfig } from "./config.js";
import type { GitHubSetupClient } from "./github.js";
import type { AuditLogger } from "./observability.js";
import {
  createAutomaticUpdateRunner,
  type AutomaticUpdateRunner,
} from "./update-automatic.js";
import { createGitHubUpdateClient } from "./update-github.js";
import { createManagedUpdateOrchestrator } from "./update-orchestrator.js";
import type {
  ManagedUpdateOrchestrator,
  ManagedUpdateReleaseProvider,
} from "./update-orchestrator-types.js";
import { createUpdateRoutes, type UpdateRoutes } from "./update-routes.js";

/**
 * Everything that acts on an installation, built around one orchestrator.
 *
 * Sharing the orchestrator is the point. It serialises work per repository, so
 * a person pressing install whilst a scheduled security sweep reaches the same
 * repository is queued behind it rather than racing it. Two orchestrators
 * would each keep their own queue and neither would know about the other.
 */
export interface UpdateServices {
  orchestrator: ManagedUpdateOrchestrator;
  routes: UpdateRoutes;
  automatic: AutomaticUpdateRunner;
}

export function createUpdateServices(input: {
  config: SetupServiceConfig;
  github: GitHubSetupClient;
  releases: ManagedUpdateReleaseProvider;
  logger: AuditLogger;
}): UpdateServices {
  const app = {
    appId: input.config.github.appId,
    privateKey: input.config.github.privateKey,
  };
  const orchestrator = createManagedUpdateOrchestrator({
    github: createGitHubUpdateClient(app),
    releases: input.releases,
    requiredCheckNames: [VELVET_UPDATE_CHECK_NAME],
  });

  return {
    orchestrator,
    routes: createUpdateRoutes({
      github: input.github,
      releases: input.releases,
      logger: input.logger,
      orchestrator,
    }),
    automatic: createAutomaticUpdateRunner({
      app,
      releases: input.releases,
      orchestrator,
      /*
       * A sweep reports twice over: one line per repository it acted on, and
       * one for the sweep itself however little it found. The second is what
       * separates a schedule that ran and had nothing to do from one that
       * stopped firing, which the per-repository lines alone cannot show.
       */
      log: (entry) => {
        if (entry.scope === "sweep") {
          input.logger({
            level: entry.failures > 0 ? "warn" : "info",
            requestId: "automatic-security",
            route: "/api/updates",
            operation: "automatic-security-sweep",
            status: entry.failures > 0 ? 502 : 200,
            outcome: entry.failures > 0 ? "failed" : "succeeded",
            ...(entry.code ? { code: entry.code } : {}),
            context: {
              version: entry.version,
              eligible: entry.eligible,
              installations: entry.installations,
              repositories: entry.repositories,
              reconciled: entry.reconciled,
              failures: entry.failures,
              truncated: entry.truncated,
            },
          });
          return;
        }
        input.logger({
          level: entry.outcome === "failed" ? "warn" : "info",
          requestId: "automatic-security",
          route: "/api/updates",
          operation: "automatic-security",
          status: entry.outcome === "failed" ? 502 : 200,
          outcome: entry.outcome === "failed" ? "failed" : "succeeded",
          ...(entry.code ? { code: entry.code } : {}),
          context: {
            installationId: entry.installationId,
            repositoryId: entry.repositoryId,
            version: entry.version,
            result: entry.outcome,
            ...(entry.state ? { state: entry.state } : {}),
            ...(entry.reason ? { reason: entry.reason } : {}),
          },
        });
      },
    }),
  };
}

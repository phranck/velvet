import { resolve } from "node:path";

import { loadSetupServiceConfig } from "./config.js";
import { createGitHubSetupClient } from "./github.js";
import { createSetupHandler } from "./handler.js";
import { createAuditLogger } from "./observability.js";
import { createSessionStore } from "./session.js";
import { createStaticAssetProvider } from "./static.js";
import { embeddedVelvetReleases } from "./update-releases.js";
import { createUpdateServices } from "./update-service.js";

const config = loadSetupServiceConfig(process.env);
const logger = createAuditLogger();
const github = createGitHubSetupClient(config.github);
const sessions = createSessionStore({ secret: config.sessionSecret });
const releases = embeddedVelvetReleases();
// Built once and shared, so a person pressing install and a scheduled security
// sweep reaching the same repository queue behind each other.
const updates = createUpdateServices({ config, github, releases, logger });
const handler = createSetupHandler({
  config,
  github,
  sessions,
  logger,
  releases,
  updates: updates.routes,
  staticAsset: createStaticAssetProvider(resolve(import.meta.dir, "public")),
});

Bun.serve({
  hostname: "0.0.0.0",
  port: config.port,
  fetch: handler,
});

if (config.automaticUpdateIntervalMs > 0) {
  // Unreferenced so a sweep waiting to run never keeps the process alive on
  // its own. Serving is what this process is for.
  setInterval(() => {
    void updates.automatic.run().catch((cause: unknown) => {
      logger({
        level: "error",
        requestId: "automatic-security",
        route: "/api/updates",
        operation: "automatic-security",
        status: 500,
        outcome: "failed",
        cause,
      });
    });
  }, config.automaticUpdateIntervalMs).unref();
}

logger({
  level: "info",
  requestId: "startup",
  route: "/healthz",
  operation: "listen",
  status: 200,
  outcome: "succeeded",
  context: {
    automaticUpdateIntervalMs: config.automaticUpdateIntervalMs,
  },
});

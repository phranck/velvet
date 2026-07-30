import { resolve } from "node:path";

import { loadSetupServiceConfig } from "./config.js";
import { createGitHubSetupClient } from "./github.js";
import { createSetupHandler } from "./handler.js";
import { createAuditLogger } from "./observability.js";
import { createSessionStore } from "./session.js";
import { createStaticAssetProvider } from "./static.js";

const config = loadSetupServiceConfig(process.env);
const logger = createAuditLogger();
const github = createGitHubSetupClient(config.github);
const sessions = createSessionStore({ secret: config.sessionSecret });
const handler = createSetupHandler({
  config,
  github,
  sessions,
  logger,
  staticAsset: createStaticAssetProvider(resolve(import.meta.dir, "public")),
});

Bun.serve({
  hostname: "0.0.0.0",
  port: config.port,
  fetch: handler,
});

logger({
  level: "info",
  requestId: "startup",
  route: "/healthz",
  operation: "listen",
  status: 200,
  outcome: "succeeded",
});

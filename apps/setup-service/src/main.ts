import { resolve } from "node:path";

import { loadSetupServiceConfig } from "./config.js";
import { createGitHubSetupClient } from "./github.js";
import { createSetupHandler } from "./handler.js";
import { createAuditLogger } from "./observability.js";
import { createInstallationSerialCounter } from "./serial.js";
import { createSessionStore } from "./session.js";
import { createStaticAssetProvider } from "./static.js";
import { embeddedVelvetReleases } from "./update-releases.js";
import { scheduleAutomaticSweeps } from "./update-schedule.js";
import { createUpdateServices } from "./update-service.js";

/** Long enough to be serving requests first, short enough to be this deploy. */
const SWEEP_START_DELAY_MS = 30_000;

const config = loadSetupServiceConfig(process.env);
const logger = createAuditLogger();
const github = createGitHubSetupClient(config.github);
const sessions = createSessionStore({ secret: config.sessionSecret });
const releases = embeddedVelvetReleases();
// Absent unless a registry repository is configured, in which case no serials
// are issued and setups complete exactly as they did before.
const serials = config.serialCounter
  ? createInstallationSerialCounter({
      repository: config.serialCounter.repository,
      path: config.serialCounter.path,
      appId: config.github.appId,
      privateKey: config.github.privateKey,
      userAgent: "velvet-setup-service",
    })
  : undefined;
// Built once and shared, so a person pressing install and a scheduled security
// sweep reaching the same repository queue behind each other.
const updates = createUpdateServices({
  config,
  github,
  releases,
  logger,
  ...(serials ? { serials } : {}),
});
const handler = createSetupHandler({
  config,
  github,
  sessions,
  logger,
  releases,
  ...(serials ? { serials } : {}),
  updates: updates.routes,
  // Served exactly as built. Nothing is inserted into a document on the way
  // out, because there is nothing left to insert: Velvet observes nobody.
  staticAsset: createStaticAssetProvider(resolve(import.meta.dir, "public")),
});

Bun.serve({
  hostname: "0.0.0.0",
  port: config.port,
  fetch: handler,
});

scheduleAutomaticSweeps({
  intervalMs: config.automaticUpdateIntervalMs,
  startDelayMs: SWEEP_START_DELAY_MS,
  run: () => {
    // Consent first, and independently of whether a release may install
    // itself. A withdrawal has to leave the gallery on the next pass rather
    // than waiting for whenever a security release next happens to exist.
    void updates.automatic
      .reconcileGallery()
      .then((reconciliation) => {
        // One line per pass, whatever it found. A pass that unlists an entry is
        // taking somebody off a public page, and a pass that finds nothing is
        // how a working schedule is told apart from a stopped one.
        logger({
          level: "info",
          requestId: "gallery-reconcile",
          route: "/api/references",
          operation: "gallery-reconcile",
          status: 200,
          outcome: "succeeded",
          context: { ...reconciliation },
        });
      })
      .catch((cause: unknown) => {
        logger({
          level: "error",
          requestId: "gallery-reconcile",
          route: "/api/references",
          operation: "gallery-reconcile",
          status: 500,
          outcome: "failed",
          cause,
        });
      });
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
  },
});

logger({
  level: "info",
  requestId: "startup",
  route: "/healthz",
  operation: "listen",
  status: 200,
  outcome: "succeeded",
  context: {
    automaticUpdateIntervalMs: config.automaticUpdateIntervalMs,
    serialRegistry: config.serialCounter?.repository ?? "none",
  },
});

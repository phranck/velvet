import { resolve } from "node:path";

import { deploymentFingerprint } from "./deployment-fingerprint.js";

/**
 * Where the deployed service answers. Overridable so the check can be pointed
 * at a staging instance without editing the workflow that runs it.
 */
const SERVICE_ORIGIN =
  process.env.VELVET_SERVICE_ORIGIN ?? "https://setup.velvet.li";
const TIMEOUT_MS = 15_000;

/**
 * The command that closes the gap this check reports.
 *
 * Quoted from `documentation/setup-service.md` rather than spelled a second
 * way. A deploy documented in one place and reported in another is the same
 * class of gap this check exists to close, so a test holds the two together.
 */
const DEPLOY_COMMAND =
  "zcli push setup --setup setup --workspace-state clean --zerops-yaml-path zerops.yaml";

/**
 * What the comparison concluded.
 *
 * `unreachable` is deliberately separate from `drifted`. A network failure says
 * nothing about what is deployed, and a check that cries wolf gets ignored,
 * which would leave the drift as invisible as it was before this existed.
 */
export type DriftStatus = "matching" | "drifted" | "unstamped" | "unreachable";

/** The conclusion together with what a person should read about it. */
export interface DriftReport {
  readonly status: DriftStatus;
  readonly message: string;
}

/**
 * Whether a status should fail the run that reported it.
 *
 * Only a knowable gap fails. An unreachable service is reported and passes,
 * because failing on it would train everyone to ignore the check.
 *
 * @param status - The conclusion the comparison reached.
 * @returns The process exit code for that conclusion.
 */
export function exitCodeFor(status: DriftStatus): number {
  return status === "matching" || status === "unreachable" ? 0 : 1;
}

/**
 * Asks the deployed service which sources it was built from.
 *
 * @param origin - Origin the service answers on, without a trailing slash.
 * @returns The reported fingerprint, or `null` when the service answered
 *   without one, which is what a build predating this check does.
 * @throws When the service cannot be reached or does not answer with success.
 */
async function deployedFingerprint(origin: string): Promise<string | null> {
  const response = await fetch(`${origin}/healthz`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`the service answered HTTP ${response.status}`);
  }

  const body = (await response.json()) as { fingerprint?: unknown };
  return typeof body.fingerprint === "string" ? body.fingerprint : null;
}

/**
 * Compares what is deployed against what these sources would build.
 *
 * It does not deploy. The service holds live sessions, so a failed deploy in
 * the middle of somebody's installation is worse than a stale one and the
 * release stays under a person's hand. What this removes is not knowing.
 *
 * @param origin - Origin the deployed service answers on.
 * @param expected - Fingerprint of the sources being compared against.
 * @returns The conclusion and the message describing it.
 */
export async function compareDeployment(
  origin: string,
  expected: string,
): Promise<DriftReport> {
  let deployed: string | null;
  try {
    deployed = await deployedFingerprint(origin);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "unknown error";
    return {
      status: "unreachable",
      message: `Could not read the deployed service at ${origin}: ${reason}.`,
    };
  }

  if (deployed === null) {
    return {
      status: "unstamped",
      message:
        "The deployed service reports no fingerprint, so it predates this check. Deploy it once to start comparing.",
    };
  }

  if (deployed === expected) {
    return {
      status: "matching",
      message: `The deployed service matches this commit (${expected.slice(0, 12)}).`,
    };
  }

  return {
    status: "drifted",
    message: [
      "The deployed setup service does not match this commit.",
      `  deployed: ${deployed.slice(0, 12)}`,
      `  main:     ${expected.slice(0, 12)}`,
      "",
      "Anything shared with the website is already live there and is not live here.",
      "Deploy with:",
      `  ${DEPLOY_COMMAND}`,
    ].join("\n"),
  };
}

if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  const report = await compareDeployment(
    SERVICE_ORIGIN,
    await deploymentFingerprint(repositoryRoot),
  );
  console.log(report.message);
  process.exitCode = exitCodeFor(report.status);
}

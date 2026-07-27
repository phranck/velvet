import type { ServiceCheck, ServiceStatus } from "./types";

export function statusColor(status: ServiceStatus): string {
  if (status === "operational") return "var(--accent-bright)";
  if (status === "unknown") return "var(--text-muted)";
  if (status === "degraded") return "var(--accent-deg)";
  return "var(--accent-down)";
}

export function statusText(status: ServiceStatus): string {
  if (status === "operational") return "Operational";
  if (status === "unknown") return "Unavailable";
  if (status === "degraded") return "Degraded";
  return "Down";
}

export function protocolLabel(
  check: Pick<ServiceCheck, "protocol">,
): string {
  return check.protocol === "ipv4" ? "IPv4" : "IPv6";
}

export function responseTimeText(check: ServiceCheck): string {
  return check.responseTimeMs === null
    ? "No response data"
    : `${Math.round(check.responseTimeMs)} ms`;
}

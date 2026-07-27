import type { ServiceCheck, ServiceStatus } from "./types";

export function statusColor(status: ServiceStatus): string {
  if (status === "operational") return "var(--grid-operational)";
  if (status === "unknown") return "var(--grid-no-data)";
  if (status === "degraded") return "var(--grid-degraded)";
  return "var(--grid-outage)";
}

export function protocolColor(
  check: Pick<ServiceCheck, "protocol">,
): string {
  return check.protocol === "ipv4"
    ? "var(--protocol-ipv4)"
    : "var(--protocol-ipv6)";
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

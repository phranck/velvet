/**
 * Phosphor (duotone web font) icon class per Velvet service ID.
 * Unknown IDs fall back to {@link DEFAULT_ICON}.
 */
const SERVICE_ICONS: Record<string, string> = {
  frontend: "ph-globe",
  api: "ph-brackets-curly",
  backend: "ph-gear-six",
  dashboard: "ph-gauge",
  database: "ph-database",
  email: "ph-envelope-simple",
  "developer-site": "ph-code",
};

const DEFAULT_ICON = "ph-circle";

/**
 * Resolve the Phosphor icon class for a service ID.
 *
 * @param serviceId - the Velvet service ID
 * @param overrides - per-service icon overrides from the consumer's config
 */
export function iconFor(serviceId: string, overrides: Record<string, string> = {}): string {
  return overrides[serviceId] ?? SERVICE_ICONS[serviceId] ?? DEFAULT_ICON;
}

/**
 * Phosphor (duotone web font) icon class per service slug.
 * Slugs come from Upptime (derived from the site name in `.upptimerc.yml`).
 * Unknown slugs fall back to {@link DEFAULT_ICON}.
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
 * Resolve the Phosphor icon class for a service slug.
 *
 * @param slug - the service slug
 * @param overrides - per-slug icon overrides from the consumer's config (win over defaults)
 */
export function iconFor(slug: string, overrides: Record<string, string> = {}): string {
  return overrides[slug] ?? SERVICE_ICONS[slug] ?? DEFAULT_ICON;
}

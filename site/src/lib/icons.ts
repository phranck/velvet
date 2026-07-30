export interface CuratedServiceIcon {
  icon: string;
  label: string;
}

/** Icons that setup and the Configurator may persist in `statusPage.icons`. */
export const CURATED_SERVICE_ICONS: readonly CuratedServiceIcon[] = [
  { icon: "ph-globe", label: "Website" },
  { icon: "ph-brackets-curly", label: "API" },
  { icon: "ph-gear-six", label: "Backend" },
  { icon: "ph-gauge", label: "Dashboard" },
  { icon: "ph-database", label: "Database" },
  { icon: "ph-hard-drives", label: "Storage" },
  { icon: "ph-envelope-simple", label: "Email" },
  { icon: "ph-cloud", label: "Cloud" },
  { icon: "ph-code", label: "Developer site" },
  { icon: "ph-shopping-cart", label: "Shop" },
  { icon: "ph-broadcast", label: "Network" },
  { icon: "ph-shield-check", label: "Security" },
  { icon: "ph-cpu", label: "Compute" },
  { icon: "ph-device-mobile", label: "Mobile app" },
  { icon: "ph-credit-card", label: "Payments" },
  { icon: "ph-chat-circle", label: "Chat" },
  { icon: "ph-phone", label: "Phone" },
  { icon: "ph-play-circle", label: "Media" },
  { icon: "ph-key", label: "Authentication" },
  { icon: "ph-map-pin", label: "Location" },
  { icon: "ph-calendar", label: "Calendar" },
] as const;

const CURATED_ICON_NAMES = new Set(
  CURATED_SERVICE_ICONS.map(({ icon }) => icon),
);

/** Automatic mappings used when a user does not choose an explicit icon. */
const SERVICE_ICONS: Readonly<Record<string, string>> = {
  website: "ph-globe",
  frontend: "ph-globe",
  api: "ph-brackets-curly",
  backend: "ph-gear-six",
  dashboard: "ph-gauge",
  database: "ph-database",
  storage: "ph-hard-drives",
  email: "ph-envelope-simple",
  cloud: "ph-cloud",
  shop: "ph-shopping-cart",
  network: "ph-broadcast",
  security: "ph-shield-check",
  "developer-site": "ph-code",
};

export const DEFAULT_SERVICE_ICON = "ph-circle";

export function isCuratedServiceIcon(value: string): boolean {
  return CURATED_ICON_NAMES.has(value);
}

/**
 * Resolve the Phosphor icon class for a service ID.
 *
 * @param serviceId - the Velvet service ID
 * @param overrides - per-service icon overrides from the consumer's config
 */
export function iconFor(serviceId: string, overrides: Record<string, string> = {}): string {
  const override = overrides[serviceId];
  if (override && isCuratedServiceIcon(override)) return override;
  return SERVICE_ICONS[serviceId] ?? DEFAULT_SERVICE_ICON;
}

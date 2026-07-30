import cloudyAutumnScreenshot from "../components/theme-card/assets/cloudy-autumn.png";
import sunnySpringScreenshot from "../components/theme-card/assets/sunny-spring.png";
import velvetDefaultScreenshot from "../components/theme-card/assets/velvet-default.png";
import violetVelvetScreenshot from "../components/theme-card/assets/violet-velvet.png";
import {
  EMBEDDED_THEME_REGISTRY,
  type RegistryTheme,
} from "../configurator/theme-registry.js";
export { canonicalSystemTheme } from "../lib/configuration-theme.js";

export interface SystemTheme extends RegistryTheme {
  screenshot: string;
}

const SCREENSHOTS: Readonly<Record<string, string>> = {
  "velvet-default": velvetDefaultScreenshot,
  "cloudy-autumn": cloudyAutumnScreenshot,
  "sunny-spring": sunnySpringScreenshot,
  "violet-velvet": violetVelvetScreenshot,
};

export const SYSTEM_THEMES: readonly SystemTheme[] =
  EMBEDDED_THEME_REGISTRY.themes.map((theme) => ({
    ...theme,
    screenshot: SCREENSHOTS[theme.id],
  }));

export function systemThemeById(id: string): SystemTheme | undefined {
  return SYSTEM_THEMES.find((theme) => theme.id === id);
}

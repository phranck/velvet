import cloudyAutumn from "./assets/themes/cloudy-autumn.png";
import sunnySpring from "./assets/themes/sunny-spring.png";
import velvetDefault from "./assets/themes/velvet-default.png";
import violetVelvet from "./assets/themes/violet-velvet.png";
import { EMBEDDED_THEME_REGISTRY } from "../configurator/theme-registry.js";

/** One theme, with the picture the start page shows of it. */
export interface GalleryTheme {
  id: string;
  name: string;
  picture: string;
}

/**
 * The picture of each theme with nothing wrong on the page.
 *
 * A second set rather than the one the picker uses, and the difference is the
 * point. Somebody choosing colours in the browser setup or the Configurator has
 * to see what a theme does with its warning and danger colours, so those
 * pictures show a degraded page. A visitor meeting Velvet for the first time
 * should not be shown four status pages reporting trouble, so these show a well
 * one.
 *
 * Both sets come from one run of `bun run --filter @velvet/site
 * theme-screenshots`, photographed from the real Configurator preview, so
 * neither can drift from what an installation actually looks like.
 *
 * Kept beside the start page rather than on `SystemTheme`, because the
 * onboarding renders the other set and a field it never reads would still put
 * these four files into its bundle.
 */
const PICTURES: Readonly<Record<string, string>> = {
  "velvet-default": velvetDefault,
  "cloudy-autumn": cloudyAutumn,
  "sunny-spring": sunnySpring,
  "violet-velvet": violetVelvet,
};

/** The four system themes, in the order the registry lists them. */
export const GALLERY_THEMES: readonly GalleryTheme[] =
  EMBEDDED_THEME_REGISTRY.themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    picture: PICTURES[theme.id]!,
  }));

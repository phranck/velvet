import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

import { HOSTED_APPS } from "./apps/setup-service/src/static.js";

export default defineConfig(
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "apps/setup-service/src/*.generated.ts",
    // The built browser applications the setup service serves from the tree.
    // They are bundler output rather than sources, so every rule here reports
    // on minified code nobody edits.
    ...HOSTED_APPS.map((app) => `${app}/assets/**`),
    "site/dist-website/**",
    "site/.svelte-kit/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: globals.bunBuiltin,
    },
  },
  {
    files: [
      "site/src/**/*.{ts,svelte}",
      "site/src/lib/page-script.js",
      "site/scripts/screenshot.mjs",
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.js", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
);

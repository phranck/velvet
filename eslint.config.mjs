import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "apps/setup-service/src/*.generated.ts",
    "onboarding/assets/**",
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

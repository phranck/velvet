import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(appRoot, "dist");
const onboardingDirectory = resolve(appRoot, "../../onboarding");

if (!outputDirectory.endsWith("/apps/setup-service/dist")) {
  throw new Error("Refusing to clean an unexpected build directory.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const result = await Bun.build({
  entrypoints: [resolve(appRoot, "src/main.ts")],
  outdir: outputDirectory,
  target: "bun",
  sourcemap: "external",
});
if (!result.success) {
  throw new AggregateError(result.logs, "Setup service bundle failed.");
}

await cp(onboardingDirectory, resolve(outputDirectory, "public"), {
  recursive: true,
});

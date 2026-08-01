import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { HOSTED_APPS } from "../src/static.js";

const appRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(appRoot, "dist");
const repositoryRoot = resolve(appRoot, "../..");

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

// Each hosted application keeps its own directory, because both ship an
// index.html and an assets directory and one would otherwise overwrite the
// other.
for (const app of HOSTED_APPS) {
  await cp(
    resolve(repositoryRoot, app),
    resolve(outputDirectory, "public", app),
    { recursive: true },
  );
}

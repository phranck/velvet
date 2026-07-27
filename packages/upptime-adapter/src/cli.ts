import { UpptimeAdapterError } from "./errors.js";
import { syncVelvetData } from "./sync.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Missing required environment variable ${name}`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  await syncVelvetData({
    repository: requiredEnvironment("GITHUB_REPOSITORY"),
    ref: requiredEnvironment("VELVET_SOURCE_REF"),
    outputDirectory: requiredEnvironment("VELVET_OUTPUT_DIRECTORY"),
    ...(process.env.GITHUB_TOKEN === undefined
      ? {}
      : { token: process.env.GITHUB_TOKEN }),
    ...(process.env.GITHUB_API_URL === undefined
      ? {}
      : { apiBaseUrl: process.env.GITHUB_API_URL }),
  });
}

try {
  await main();
} catch (error) {
  if (error instanceof UpptimeAdapterError) {
    console.error(`velvet sync failed [${error.code}]: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`velvet sync failed: ${error.message}`);
  } else {
    console.error("velvet sync failed: unknown error");
  }
  process.exitCode = 1;
}

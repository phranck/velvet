#!/usr/bin/env bun

import { UpptimeAdapterError } from "./errors.js";
import { runVum } from "./vum-command.js";

try {
  await runVum(process.argv.slice(2));
} catch (error) {
  if (error instanceof UpptimeAdapterError) {
    console.error(`vum failed [${error.code}]: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`vum failed: ${error.message}`);
  } else {
    console.error("vum failed: unknown error");
  }
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "bun:test";

const projectRoot = resolve(import.meta.dirname, "..");
const commandPath = resolve(projectRoot, "config");

test("provides the project-local configurator command surface", async () => {
  await access(commandPath, constants.X_OK);
  const cli = await import(pathToFileURL(commandPath).href);

  assert.equal(cli.CONFIGURATOR_URL, "http://127.0.0.1:2342");
  assert.match(cli.helpText(), /Usage: \.\/config <command>/);
  for (const command of ["start", "stop", "version", "help"]) {
    assert.match(cli.helpText(), new RegExp(`\\b${command}\\b`));
  }
  assert.equal(cli.parseCommand(["start"]), "start");
  assert.equal(cli.parseCommand(["stop"]), "stop");
  assert.equal(cli.parseCommand(["version"]), "version");
  assert.equal(cli.parseCommand(["help"]), "help");
  assert.equal(cli.parseCommand([]), "help");
  assert.throws(() => cli.parseCommand(["unknown"]), /Unknown command/);
});

test("keeps static file resolution inside the configurator directory", async () => {
  const cli = await import(pathToFileURL(commandPath).href);
  const webRoot = resolve(projectRoot, "configurator");

  assert.equal(cli.resolveStaticPath("/", webRoot), resolve(webRoot, "index.html"));
  assert.equal(
    cli.resolveStaticPath("/assets/configurator.css", webRoot),
    resolve(webRoot, "assets/configurator.css"),
  );
  assert.equal(cli.resolveStaticPath("/%2e%2e/package.json", webRoot), null);
});

import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const configuratorRoot = resolve(import.meta.dirname, "../configurator");

test("ships the configurator as separate HTML, CSS, JavaScript, and font assets", async () => {
  const html = await readFile(resolve(configuratorRoot, "index.html"), "utf8");
  const assets = await readdir(resolve(configuratorRoot, "assets"));

  assert.ok((await stat(resolve(configuratorRoot, "index.html"))).size < 10_000);
  assert.match(html, /<script[^>]+src="\.\/assets\/[^"]+\.js"/);
  assert.match(html, /<link[^>]+href="\.\/assets\/[^"]+\.css"/);
  assert.ok(assets.some((name) => name.endsWith(".js")));
  assert.ok(assets.some((name) => name.endsWith(".css")));
  assert.ok(assets.some((name) => name.endsWith(".woff2")));
});

test("ships the sidebar collapse control inside the scrolling header", async () => {
  const assets = await readdir(resolve(configuratorRoot, "assets"));
  const javascript = await Promise.all(
    assets
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(resolve(configuratorRoot, "assets", name), "utf8")),
  );
  const output = javascript.join("\n");

  assert.match(output, /data-sidebar-collapse-toggle/);
  assert.match(output, /sidebar-header-toggle/);
  assert.doesNotMatch(output, /data-sidebar-toggle/);
});

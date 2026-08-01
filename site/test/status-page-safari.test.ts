import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer } from "vite";

import { createViteTestCache } from "./vite-test-cache.js";

/**
 * Drives Safari itself, through Safari Remote Automation and WebDriver.
 *
 * WebKit through Playwright covers the engine, and that runs in CI. This
 * covers the browser: its own window management, its own settings, and the
 * automation surface a person's Safari actually exposes.
 *
 * It is not part of the default test run, because it depends on machine state
 * that CI does not have. One thing is required: `sudo safaridriver --enable`,
 * once, which registers the WebDriver service. Without it the driver still
 * answers `/status` whilst every session request times out, which reads like a
 * different problem entirely.
 *
 * A running Safari is not in the way. safaridriver launches its own instance
 * beside it, so nothing anyone has open needs closing to run this.
 *
 * Run it with `bun run test:safari` from `site`.
 */

const DRIVER_PORT = 4599;
const TIMEOUT_MS = 180_000;
const VIEWPORT = { width: 1280, height: 900 };

interface Driver {
  send(method: string, path: string, body?: unknown): Promise<unknown>;
  stop(): void;
}

/** Starts safaridriver and waits for it to answer. */
async function startDriver(): Promise<Driver> {
  const process = Bun.spawn(["safaridriver", "-p", String(DRIVER_PORT)], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const origin = `http://127.0.0.1:${DRIVER_PORT}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const ready = await fetch(`${origin}/status`);
      if (ready.ok) break;
    } catch {
      // The driver has not bound its port yet.
    }
    await Bun.sleep(250);
  }
  return {
    async send(method, path, body) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const parsed = (await response.json()) as { value?: unknown };
      if (!response.ok) {
        const value = parsed.value as { message?: string } | undefined;
        throw new Error(
          `${method} ${path} failed: ${value?.message ?? response.status}`,
        );
      }
      return parsed.value;
    },
    stop() {
      process.kill();
    },
  };
}

test("opens and closes every service in Safari at desktop width", async () => {
  const cache = await createViteTestCache("status-page-safari");
  const server = await createServer({
    root: resolve(import.meta.dirname, ".."),
    cacheDir: cache.path,
    configFile: false,
    logLevel: "silent",
    plugins: [svelte()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Missing Vite port.");

  const driver = await startDriver();
  let sessionId: string | undefined;
  try {
    const created = (await driver.send("POST", "/session", {
      capabilities: { alwaysMatch: { browserName: "safari" } },
    })) as { sessionId: string };
    sessionId = created.sessionId;
    const session = `/session/${sessionId}`;

    // Safari switches the page into its mobile layout below a threshold, so a
    // window left at whatever size it happened to have would test a layout
    // nobody was testing. The size is set and then read back from the page.
    await driver.send("POST", `${session}/window/rect`, {
      x: 0,
      y: 0,
      ...VIEWPORT,
    });
    await driver.send("POST", `${session}/url`, {
      url: `http://127.0.0.1:${address.port}/configurator.html`,
    });
    const width = (await driver.send("POST", `${session}/execute/sync`, {
      script: "return window.innerWidth;",
      args: [],
    })) as number;
    assert.ok(width >= 1_000, `desktop width, got ${width}`);

    const services = (await driver.send("POST", `${session}/execute/async`, {
      script: `
        const done = arguments[arguments.length - 1];
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        (async () => {
          for (let i = 0; i < 40 && !document.querySelector(".status-page .toggle-all"); i += 1) {
            await wait(250);
          }
          const details = () =>
            document.querySelectorAll(".status-page [id$='-details']").length;
          const hidden = () =>
            document.querySelectorAll(".status-page [id$='-details'][hidden]").length;
          const total = details();
          const openAtStart = hidden();
          const toggle = document.querySelector(".status-page .toggle-all");
          toggle.click();
          await wait(1200);
          const collapsed = hidden();
          toggle.click();
          await wait(1200);
          done({ total, openAtStart, collapsed, expanded: hidden() });
        })();
      `,
      args: [],
    })) as {
      total: number;
      openAtStart: number;
      collapsed: number;
      expanded: number;
    };

    assert.ok(services.total > 0, "the preview renders services");
    assert.equal(services.openAtStart, 0, "the preview opens with them expanded");
    assert.equal(services.collapsed, services.total, "collapse all hides every one");
    assert.equal(services.expanded, 0, "expand all shows every one again");
  } finally {
    if (sessionId) {
      await driver.send("DELETE", `/session/${sessionId}`).catch(() => undefined);
    }
    driver.stop();
    await server.close();
    await cache.cleanup();
  }
}, TIMEOUT_MS);

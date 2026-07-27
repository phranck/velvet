import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

import { resolveTheme } from "../src/lib/theme.js";
import { syncModalDialog } from "../src/configurator/dialog-lifecycle.js";
import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";

let renderer: SvelteRenderer;

before(async () => {
  renderer = await createSvelteRenderer();
});

after(async () => {
  await renderer.close();
});

test("asks for a distinct name in an accessible theme-colored modal", async () => {
  const theme = resolveTheme({
    palette: {
      canvas: "#101010",
      foreground: "#f0f0f0",
      accent: "#aabbcc",
    },
    card: { background: "#202020", border: "#303030" },
  });
  const html = await renderer.render(
    "/src/configurator/ThemeNameDialog.svelte",
    {
      open: true,
      theme,
      candidate: "Sunny Spring Copy",
      error: "Choose a distinct name.",
      onCandidateChange: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    },
  );

  assert.match(html, /<dialog[^>]+aria-labelledby="theme-name-dialog-title"/);
  assert.match(html, /Save as a new theme/);
  assert.match(html, /value="Sunny Spring Copy"/);
  assert.match(html, /Choose a distinct name/);
  assert.match(html, /--modal-surface:\s*#202020/);
  assert.match(html, /--modal-border:\s*#303030/);
  assert.match(html, /--modal-accent:\s*#aabbcc/);
});

test("keeps the native modal lifecycle independent from the reactive prop", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/configurator/ThemeNameDialog.svelte"),
    "utf8",
  );

  assert.doesNotMatch(source, /<dialog[\s\S]*?\{open\}/);
  assert.match(source, /syncModalDialog\(dialog, open\)/);
});

test("opens, cancels, and reopens the same native modal", () => {
  const calls: string[] = [];
  const dialog = {
    open: false,
    showModal() {
      calls.push("showModal");
      this.open = true;
    },
    close() {
      calls.push("close");
      this.open = false;
    },
  };

  syncModalDialog(dialog, true);
  syncModalDialog(dialog, false);
  syncModalDialog(dialog, true);

  assert.deepEqual(calls, ["showModal", "close", "showModal"]);
  assert.equal(dialog.open, true);
});

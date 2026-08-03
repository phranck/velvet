import assert from "node:assert/strict";
import { test } from "bun:test";

import { resolveRepositoryLinks } from "../src/lib/repository-links.js";

test("points a repository-relative link at the repository", () => {
  assert.equal(
    resolveRepositoryLinks("See [LICENSING.md](LICENSING.md) for the boundary."),
    "See [LICENSING.md](https://github.com/phranck/velvet/blob/main/LICENSING.md) for the boundary.",
  );
  assert.equal(
    resolveRepositoryLinks("[the reference](documentation/configuration.md)"),
    "[the reference](https://github.com/phranck/velvet/blob/main/documentation/configuration.md)",
  );
});

test("resolves a destination against the directory the document lives in", () => {
  // How `documentation/configuration.md` writes its links to the two documents
  // that stay at the repository root.
  assert.equal(
    resolveRepositoryLinks("[LICENSING.md](../LICENSING.md)", "documentation/"),
    "[LICENSING.md](https://github.com/phranck/velvet/blob/main/LICENSING.md)",
  );
  assert.equal(
    resolveRepositoryLinks("[contracts](contracts.md)", "documentation/"),
    "[contracts](https://github.com/phranck/velvet/blob/main/documentation/contracts.md)",
  );
});

test("leaves a destination that already resolves on its own", () => {
  for (const destination of [
    "https://setup.velvet.li/onboarding/",
    "http://example.com",
    "//example.com/protocol-relative",
    "/absolute-path",
    "#a-fragment",
    "mailto:someone@example.com",
  ]) {
    const source = `[label](${destination})`;
    assert.equal(
      resolveRepositoryLinks(source),
      source,
      `${destination} was rewritten and should not have been`,
    );
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { protocolColor, statusColor } from "../src/lib/protocol.js";

test("keeps protocol identity colours separate from status colours", () => {
  assert.equal(protocolColor({ protocol: "ipv4" }), "var(--protocol-ipv4)");
  assert.equal(protocolColor({ protocol: "ipv6" }), "var(--protocol-ipv6)");
  assert.equal(statusColor("operational"), "var(--grid-operational)");
  assert.equal(statusColor("unknown"), "var(--grid-no-data)");
  assert.equal(statusColor("degraded"), "var(--grid-degraded)");
  assert.equal(statusColor("outage"), "var(--grid-outage)");
});

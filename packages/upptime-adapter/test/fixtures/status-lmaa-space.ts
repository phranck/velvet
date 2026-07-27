import type { UpptimeSnapshot } from "../../src/index.js";

// Sanitized read-only capture of the status.lmaa.space Upptime source shape.
const checks = [
  {
    name: "Website",
    slug: "website",
    protocol: "ipv4",
    time: 708,
    downtime: 47,
    lastUpdated: "2026-07-25T23:22:41.290Z",
    startTime: "2026-07-05T10:00:00.000Z",
  },
  {
    name: "Website IPv6",
    slug: "website-ipv6",
    protocol: "ipv6",
    time: 185,
    downtime: 16,
    lastUpdated: "2026-07-25T23:23:00.000Z",
    startTime: "2026-07-05T10:01:00.000Z",
  },
  {
    name: "Dashboard",
    slug: "dashboard",
    protocol: "ipv4",
    time: 445,
    downtime: 47,
    lastUpdated: "2026-07-25T23:23:10.000Z",
    startTime: "2026-07-05T10:02:00.000Z",
  },
  {
    name: "Dashboard IPv6",
    slug: "dashboard-ipv6",
    protocol: "ipv6",
    time: 85,
    downtime: 16,
    lastUpdated: "2026-07-25T23:23:20.000Z",
    startTime: "2026-07-05T10:03:00.000Z",
  },
  {
    name: "Backend",
    slug: "backend",
    protocol: "ipv4",
    time: 421,
    downtime: 48,
    lastUpdated: "2026-07-25T23:23:30.000Z",
    startTime: "2026-07-05T10:04:00.000Z",
  },
  {
    name: "Backend IPv6",
    slug: "backend-ipv6",
    protocol: "ipv6",
    time: 61,
    downtime: 17,
    lastUpdated: "2026-07-25T23:23:40.000Z",
    startTime: "2026-07-05T10:05:00.000Z",
  },
  {
    name: "Database",
    slug: "database",
    protocol: "ipv4",
    time: 417,
    downtime: 46,
    lastUpdated: "2026-07-25T23:23:50.000Z",
    startTime: "2026-07-05T10:06:00.000Z",
  },
  {
    name: "Database IPv6",
    slug: "database-ipv6",
    protocol: "ipv6",
    time: 71,
    downtime: 16,
    lastUpdated: "2026-07-25T23:24:00.000Z",
    startTime: "2026-07-05T10:07:00.000Z",
  },
  {
    name: "Storage",
    slug: "storage",
    protocol: "ipv4",
    time: 413,
    downtime: 0,
    lastUpdated: "2026-07-25T23:24:10.000Z",
    startTime: "2026-07-05T10:08:00.000Z",
  },
  {
    name: "Storage IPv6",
    slug: "storage-ipv6",
    protocol: "ipv6",
    time: 75,
    downtime: 0,
    lastUpdated: "2026-07-25T23:24:20.000Z",
    startTime: "2026-07-05T10:09:00.000Z",
  },
] as const;

const configYaml = `
owner: phranck
repo: status.lmaa.space
sites:
${checks
  .map(
    (check) => `  - name: ${check.name}
    slug: ${check.slug}
    url: https://example.invalid/health/${check.slug.replace(/-ipv6$/, "")}${
      check.protocol === "ipv6"
        ? "\n    type: globalping\n    check: http\n    ipv6: true"
        : ""
    }`,
  )
  .join("\n")}
`;

export const statusLmaaSpaceSnapshot: UpptimeSnapshot = {
  configYaml,
  summaryJson: JSON.stringify(
    checks.map((check) => ({
      name: check.name,
      slug: check.slug,
      status: "up",
      time: check.time,
      dailyMinutesDown:
        check.downtime === 0 ? {} : { "2026-07-05": check.downtime },
    })),
  ),
  histories: Object.fromEntries(
    checks.map((check) => [
      check.slug,
      `status: up
responseTime: ${check.time}
lastUpdated: ${check.lastUpdated}
startTime: ${check.startTime}
generator: Upptime
`,
    ]),
  ),
  commits: Object.fromEntries(
    checks.map((check) => [
      check.slug,
      [
        {
          sha: `${check.slug}-latest`,
          committedAt: check.lastUpdated,
          message: `${check.name} is up (200 in ${check.time} ms) [skip ci] [upptime]`,
        },
      ],
    ]),
  ),
  issues: [
    {
      number: 5,
      title: "Website is down",
      body: "In [commit](https://github.com/example/status/commit/abc), Website (https://example.invalid/health/website) was **down**:\n- HTTP code: 404\n- Response time: 515 ms",
      state: "closed",
      createdAt: "2026-07-05T10:58:37.000Z",
      closedAt: "2026-07-05T11:45:20.000Z",
      labels: ["status", "website"],
    },
    {
      number: 6,
      title: "Website IPv6 is down",
      body: "In [commit](https://github.com/example/status/commit/def), Website IPv6 (https://example.invalid/health/website) was **down**:\n- HTTP code: 404\n- Response time: 296 ms",
      state: "closed",
      createdAt: "2026-07-05T10:58:52.000Z",
      closedAt: "2026-07-05T11:15:05.000Z",
      labels: ["status", "website-ipv6"],
    },
  ],
};

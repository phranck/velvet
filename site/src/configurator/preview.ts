import type { VelvetConfig } from "../lib/config";
import { resolveTheme } from "../lib/theme.js";
import type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "../lib/types";

const PREVIEW_SAMPLE_DAYS = 82;
const DAY_MS = 86_400_000;
const PREVIEW_GENERATED_AT = "2026-07-27T12:00:00.000Z";
const PREVIEW_MONITORING_STARTED_AT = "2026-05-07T00:00:00.000Z";

function previewResponseSamples(
  generatedAt: string,
  baseline: number,
  amplitude: number,
  phase: number,
) {
  const end = Date.parse(generatedAt);

  return Array.from({ length: PREVIEW_SAMPLE_DAYS }, (_, index) => {
    const daysBeforeEnd = PREVIEW_SAMPLE_DAYS - index - 1;
    const variation = Math.round(
      amplitude *
        (Math.sin(daysBeforeEnd * 0.47 + phase) - Math.sin(phase)) +
        (amplitude / 2) *
          (Math.cos(daysBeforeEnd * 0.19 + phase) - Math.cos(phase)),
    );

    return {
      timestamp: new Date(end - daysBeforeEnd * DAY_MS).toISOString(),
      responseTimeMs: baseline + variation,
    };
  });
}

function previewDailyAvailability(
  generatedAt: string,
  unavailableSecondsByDaysBeforeEnd: Readonly<Record<number, number>>,
) {
  const end = new Date(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);

  return Array.from({ length: PREVIEW_SAMPLE_DAYS }, (_, index) => {
    const daysBeforeEnd = PREVIEW_SAMPLE_DAYS - index - 1;
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - daysBeforeEnd);

    return {
      date: date.toISOString().slice(0, 10),
      monitoredSeconds: daysBeforeEnd === 0 ? 43_200 : 86_400,
      unavailableSeconds: unavailableSecondsByDaysBeforeEnd[daysBeforeEnd] ?? 0,
    };
  });
}

export const PREVIEW_CONFIG: VelvetConfig = {
  owner: "velvet-preview",
  repo: "status",
  dataBranch: "main",
  dataBaseUrl: "",
  name: "Velvet Preview",
  logoHeight: 72,
  showPoweredBy: true,
  navbar: [{ title: "Status", href: "/" }],
  layout: "grouped",
  defaultRange: "month",
  theme: resolveTheme(),
  icons: { website: "ph-globe", backend: "ph-gear-six" },
};

export const PREVIEW_STATUS: StatusDocument = {
  schemaVersion: 1,
  generatedAt: PREVIEW_GENERATED_AT,
  monitoringStartedAt: PREVIEW_MONITORING_STARTED_AT,
  services: [
    {
      id: "website",
      name: "Website",
      status: "degraded",
      checks: [
        {
          id: "website-ipv4",
          protocol: "ipv4",
          status: "operational",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 108,
        },
        {
          id: "website-ipv6",
          protocol: "ipv6",
          status: "degraded",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 184,
        },
      ],
      dailyAvailability: previewDailyAvailability(PREVIEW_GENERATED_AT, {
        1: 480,
        3: 31_000,
        5: 720,
      }),
    },
    {
      id: "backend",
      name: "Backend",
      status: "operational",
      checks: [
        {
          id: "backend-ipv4",
          protocol: "ipv4",
          status: "operational",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 82,
        },
        {
          id: "backend-ipv6",
          protocol: "ipv6",
          status: "operational",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 121,
        },
      ],
      dailyAvailability: previewDailyAvailability(PREVIEW_GENERATED_AT, {
        4: 180,
      }),
    },
  ],
};

export const PREVIEW_RESPONSE_TIMES: ResponseTimesDocument = {
  schemaVersion: 1,
  generatedAt: PREVIEW_STATUS.generatedAt,
  monitoringStartedAt: PREVIEW_STATUS.monitoringStartedAt,
  series: [
    {
      serviceId: "backend",
      checkId: "backend-ipv4",
      protocol: "ipv4",
      samples: previewResponseSamples(PREVIEW_STATUS.generatedAt, 108, 16, 0.8),
    },
    {
      serviceId: "backend",
      checkId: "backend-ipv6",
      protocol: "ipv6",
      samples: previewResponseSamples(PREVIEW_STATUS.generatedAt, 184, 22, 2.2),
    },
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: previewResponseSamples(PREVIEW_STATUS.generatedAt, 82, 12, 1.3),
    },
    {
      serviceId: "website",
      checkId: "website-ipv6",
      protocol: "ipv6",
      samples: previewResponseSamples(PREVIEW_STATUS.generatedAt, 121, 18, 2.7),
    },
  ],
};

export const PREVIEW_INCIDENTS: IncidentsDocument = {
  schemaVersion: 1,
  generatedAt: PREVIEW_STATUS.generatedAt,
  events: [],
};

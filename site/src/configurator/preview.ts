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
          status: "degraded",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 108,
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
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: previewResponseSamples(PREVIEW_STATUS.generatedAt, 82, 12, 1.3),
    },
  ],
};

export const PREVIEW_INCIDENTS: IncidentsDocument = {
  schemaVersion: 1,
  generatedAt: PREVIEW_STATUS.generatedAt,
  events: [],
};

export interface PreviewServiceOption {
  id: string;
  name: string;
}

export function previewDocumentsForServices(
  services: readonly PreviewServiceOption[],
): {
  status: StatusDocument;
  responseTimes: ResponseTimesDocument;
  incidents: IncidentsDocument;
} {
  const selected = services.length > 0
    ? services
    : PREVIEW_STATUS.services.map(({ id, name }) => ({ id, name }));
  const statusServices = selected.map((service, index) => {
    const sample = PREVIEW_STATUS.services[index % PREVIEW_STATUS.services.length]!;
    const sampleCheck = sample.checks[0]!;
    return {
      ...structuredClone(sample),
      id: service.id,
      name: service.name,
      checks: [
        {
          ...sampleCheck,
          id: `${service.id}-ipv4`,
        },
      ],
    };
  });
  const responseSeries = selected.map((service, index) => {
    const sampleService = PREVIEW_STATUS.services[index % PREVIEW_STATUS.services.length]!;
    const sample = PREVIEW_RESPONSE_TIMES.series.find(
      ({ serviceId }) => serviceId === sampleService.id,
    )!;
    return {
      ...structuredClone(sample),
      serviceId: service.id,
      checkId: `${service.id}-ipv4`,
    };
  });

  return {
    status: { ...PREVIEW_STATUS, services: statusServices },
    responseTimes: { ...PREVIEW_RESPONSE_TIMES, series: responseSeries },
    incidents: structuredClone(PREVIEW_INCIDENTS),
  };
}

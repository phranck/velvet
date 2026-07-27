import type { RangeKey, ResponseTimesDocument } from "./types";

type ResponseSeries = ResponseTimesDocument["series"];
type ResponseSamples = ResponseSeries[number]["samples"];

const DAY_MS = 86_400_000;
const RANGE_MS: Record<RangeKey, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  quarter: 90 * DAY_MS,
  year: 365 * DAY_MS,
};

export function responseRangeWindow(
  range: RangeKey,
  generatedAt: string,
): { start: number; end: number } {
  const end = Date.parse(generatedAt);
  return { start: end - RANGE_MS[range], end };
}

export function filterResponseSeries(
  series: ResponseSeries,
  range: RangeKey,
  generatedAt: string,
): ResponseSeries {
  const { start, end } = responseRangeWindow(range, generatedAt);
  return series.map((entry) => ({
    ...entry,
    samples: entry.samples.filter(({ timestamp }) => {
      const sampleTime = Date.parse(timestamp);
      return sampleTime >= start && sampleTime <= end;
    }),
  }));
}

export function downsampleResponseSamples(
  samples: ResponseSamples,
  maxPoints: number,
): ResponseSamples {
  if (samples.length <= maxPoints) return samples;
  if (maxPoints <= 0) return [];
  if (maxPoints === 1) return [samples.at(-1)!];

  const required = new Set<number>([0, samples.length - 1]);
  let minimumIndex: number | null = null;
  let maximumIndex: number | null = null;

  samples.forEach((sample, index) => {
    if (sample.responseTimeMs === null) {
      if (index === 0 || samples[index - 1]?.responseTimeMs !== null) {
        required.add(index);
      }
      return;
    }
    if (
      minimumIndex === null ||
      sample.responseTimeMs < samples[minimumIndex]!.responseTimeMs!
    ) {
      minimumIndex = index;
    }
    if (
      maximumIndex === null ||
      sample.responseTimeMs > samples[maximumIndex]!.responseTimeMs!
    ) {
      maximumIndex = index;
    }
  });

  if (minimumIndex !== null) required.add(minimumIndex);
  if (maximumIndex !== null) required.add(maximumIndex);

  const candidates = samples
    .map((_, index) => index)
    .filter((index) => !required.has(index));
  const availableSlots = Math.max(0, maxPoints - required.size);
  for (let slot = 0; slot < availableSlots; slot += 1) {
    const candidateIndex =
      availableSlots === 1
        ? Math.floor(candidates.length / 2)
        : Math.round((slot * (candidates.length - 1)) / (availableSlots - 1));
    required.add(candidates[candidateIndex]!);
  }

  return [...required]
    .sort((left, right) => left - right)
    .map((index) => samples[index]!);
}

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

export function monotonePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${pointText(points[0]!)}`;

  const intervals = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]!;
    const width = next.x - point.x;
    return {
      width,
      slope: width > 0 ? (next.y - point.y) / width : 0,
    };
  });

  if (intervals.some(({ width }) => width <= 0)) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"}${pointText(point)}`)
      .join(" ");
  }

  const tangents = points.map((_, index) => {
    if (index === 0) return intervals[0]!.slope;
    if (index === points.length - 1) return intervals.at(-1)!.slope;

    const previous = intervals[index - 1]!;
    const next = intervals[index]!;
    if (previous.slope * next.slope <= 0) return 0;

    const previousWeight = 2 * next.width + previous.width;
    const nextWeight = next.width + 2 * previous.width;
    return (
      (previousWeight + nextWeight) /
      (previousWeight / previous.slope + nextWeight / next.slope)
    );
  });

  for (let index = 0; index < intervals.length; index += 1) {
    const slope = intervals[index]!.slope;
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const startRatio = tangents[index]! / slope;
    const endRatio = tangents[index + 1]! / slope;
    const magnitude = Math.hypot(startRatio, endRatio);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[index] = scale * startRatio * slope;
      tangents[index + 1] = scale * endRatio * slope;
    }
  }

  const commands = [`M${pointText(points[0]!)}`];
  for (let index = 0; index < intervals.length; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const third = intervals[index]!.width / 3;
    const firstControl = {
      x: start.x + third,
      y: start.y + tangents[index]! * third,
    };
    const secondControl = {
      x: end.x - third,
      y: end.y - tangents[index + 1]! * third,
    };
    commands.push(
      `C${pointText(firstControl)} ${pointText(secondControl)} ${pointText(end)}`,
    );
  }
  return commands.join(" ");
}

function pointText(point: { x: number; y: number }): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}

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

export function availableResponseTimestamps(series: ResponseSeries): string[] {
  const timestamps = new Set<string>();
  for (const entry of series) {
    for (const sample of entry.samples) {
      if (sample.responseTimeMs !== null) timestamps.add(sample.timestamp);
    }
  }
  return [...timestamps].sort(
    (left, right) => Date.parse(left) - Date.parse(right),
  );
}

export function nearestResponseTimestamp(
  timestamps: string[],
  targetTime: number,
): string | null {
  let nearest: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const timestamp of timestamps) {
    const distance = Math.abs(Date.parse(timestamp) - targetTime);
    if (distance < nearestDistance) {
      nearest = timestamp;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function responseValuesAtTimestamp(
  series: ResponseSeries,
  timestamp: string,
): Array<{ protocol: "ipv4" | "ipv6"; responseTimeMs: number }> {
  const values: Array<{
    protocol: "ipv4" | "ipv6";
    responseTimeMs: number;
  }> = [];
  for (const entry of series) {
    const sample = entry.samples.find(
      (candidate) => candidate.timestamp === timestamp,
    );
    if (sample?.responseTimeMs !== null && sample?.responseTimeMs !== undefined) {
      values.push({
        protocol: entry.protocol,
        responseTimeMs: sample.responseTimeMs,
      });
    }
  }
  return values;
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

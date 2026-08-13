import type { RangeKey, ResponseSeries } from "../data.js";

type ResponseSamples = ResponseSeries[number]["samples"];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The two ranges that are a stated length, whatever the installation is. */
const FIXED_RANGE_MS: Record<"month" | "quarter", number> = {
  month: 30 * DAY_MS,
  quarter: 90 * DAY_MS,
};

/**
 * The units a printed scale may divide a window into, finest first.
 *
 * A tick stands for a length of time rather than for a distance across the
 * drawing, so which unit it is follows from how long the window is rather than
 * from what the window is called. That is what lets one rule serve a window of
 * six hours and one of six years alike.
 *
 * Each unit carries the grouping a reader of that unit expects: quarter days
 * on an hourly scale, whole days on a six-hourly one, five days on a daily
 * one, four weeks on a weekly one, and a quarter on a monthly one.
 */
const SCALE_UNITS: Array<{ every: number; majorEvery: number }> = [
  { every: HOUR_MS, majorEvery: 6 },
  { every: 6 * HOUR_MS, majorEvery: 4 },
  { every: DAY_MS, majorEvery: 5 },
  { every: 2 * DAY_MS, majorEvery: 5 },
  { every: 7 * DAY_MS, majorEvery: 4 },
  { every: 30 * DAY_MS, majorEvery: 3 },
  { every: 365 * DAY_MS, majorEvery: 5 },
];

/**
 * How many ticks a scale carries before it reads as a band rather than a
 * scale.
 *
 * The widest plot a design draws measures 856px, where sixty ticks stand
 * 14.3px apart. Below that the marks stop being separable and the scale says
 * nothing the two end labels do not.
 */
const MOST_TICKS = 60;

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

/**
 * The stretch of time a plot is drawn across.
 *
 * `all` has no length of its own and reaches back to the day monitoring began,
 * so it needs that day rather than a constant.
 *
 * @param range - The window being read.
 * @param generatedAt - When the data was written, which is the window's end.
 * @param monitoringStartedAt - The first day this installation measured.
 * @returns The window's two ends, in milliseconds.
 */
export function responseRangeWindow(
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
): { start: number; end: number } {
  const end = Date.parse(generatedAt);
  if (range === "all") {
    return { start: Date.parse(monitoringStartedAt), end };
  }
  return { start: end - FIXED_RANGE_MS[range], end };
}

/**
 * The ticks of a printed scale across a window of time.
 *
 * Counted back from the window's end, so the right edge always carries a long
 * tick: a scale of this kind is read from now backwards, and a remainder
 * shorter than the unit belongs at the far end where nothing stands against
 * it.
 *
 * Where each tick falls is the arithmetic's rather than a design's, on the
 * same grounds the curve is: a scale that divides a window of thirty days into
 * anything but days is telling a reader something about time that is not true
 * of what they are looking at.
 *
 * @param window - The stretch of time the plot covers.
 * @returns One entry per tick, earliest first, each saying when it stands and
 *   whether it is a long one. Empty where the window has no length.
 */
export function responseScaleTicks(window: {
  start: number;
  end: number;
}): Array<{ at: number; major: boolean }> {
  const span = window.end - window.start;
  if (span <= 0) return [];
  const unit =
    SCALE_UNITS.find(({ every }) => span / every <= MOST_TICKS) ??
    SCALE_UNITS.at(-1)!;
  const ticks: Array<{ at: number; major: boolean }> = [];
  for (let step = 0; ; step += 1) {
    const at = window.end - step * unit.every;
    if (at < window.start) break;
    ticks.push({ at, major: step % unit.majorEvery === 0 });
  }
  return ticks.reverse();
}

/**
 * The figures a value axis is allowed to climb in, as multiples of a power of
 * ten.
 *
 * A reader compares one service against the next by the figures beside the
 * grid, so those figures have to be ones anybody reads without working them
 * out. 150 and 400 are such figures at any magnitude; 220 and 1060 are what a
 * fixed step of twenty milliseconds produces once the readings leave the range
 * it was chosen for.
 */
const AXIS_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * The smallest step an axis climbs in, in milliseconds.
 *
 * Below this the figures start repeating as the plot rounds them, and a
 * service answering in single milliseconds says nothing more with a grid at
 * two than with one at ten.
 */
const SMALLEST_AXIS_STEP = 10;

/**
 * What one grid line stands apart from the next by, in milliseconds.
 *
 * The top of the axis is this times the number of steps rather than the
 * highest reading itself. Scaling to the reading made every service look
 * alike: one running at 96ms and one at 412ms both filled the plot to the top,
 * and the shape said nothing about how slow either was.
 *
 * @param highest - The largest reading the plot has to hold.
 * @param steps - How many gaps stand between the floor and the top.
 * @returns A round figure at least as large as an even share of the readings.
 */
export function responseAxisStep(highest: number, steps: number): number {
  const wanted = Math.max(highest, 0) / Math.max(1, steps);
  if (wanted <= SMALLEST_AXIS_STEP) return SMALLEST_AXIS_STEP;
  const power = 10 ** Math.floor(Math.log10(wanted));
  for (const mantissa of AXIS_MANTISSAS) {
    const candidate = mantissa * power;
    if (candidate >= wanted) return candidate;
  }
  return 10 * power;
}

export function filterResponseSeries(
  series: ResponseSeries,
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
): ResponseSeries {
  const { start, end } = responseRangeWindow(
    range,
    generatedAt,
    monitoringStartedAt,
  );
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

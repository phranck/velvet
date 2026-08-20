// ../packages/foundation/src/disclosure/index.ts
var DURATION_PROPERTY = "--velvet-disclosure-duration";
var FALLBACK_DURATION_MS = 400;
function millisecondsFrom(value) {
  const match = /^\s*([\d.]+)(ms|s)\s*$/u.exec(value);
  if (!match)
    return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount))
    return null;
  return match[2] === "s" ? amount * 1000 : amount;
}
function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function disclosure(node, open) {
  const declared = getComputedStyle(node).getPropertyValue(DURATION_PROPERTY);
  const duration = millisecondsFrom(declared) ?? FALLBACK_DURATION_MS;
  let shown = open;
  let animation = null;
  let fade = null;
  function contents() {
    return node.firstElementChild;
  }
  function settle() {
    node.style.removeProperty("height");
    animation = null;
    fade = null;
  }
  function snap(next) {
    animation?.cancel();
    fade?.cancel();
    settle();
    node.hidden = !next;
    node.inert = !next;
  }
  function present(next) {
    const current = node.hidden ? 0 : node.getBoundingClientRect().height;
    const inner = contents();
    const showing = fade && inner ? Number(getComputedStyle(inner).opacity) : next ? 0 : 1;
    animation?.cancel();
    fade?.cancel();
    settle();
    node.inert = !next;
    if (prefersReducedMotion() || typeof node.animate !== "function") {
      snap(next);
      return;
    }
    node.hidden = false;
    const target = next ? node.getBoundingClientRect().height : 0;
    if (target === current) {
      snap(next);
      return;
    }
    animation = node.animate([{ height: `${current}px` }, { height: `${target}px` }], { duration, easing: "ease-in-out" });
    if (inner) {
      fade = inner.animate([{ opacity: `${showing}` }, { opacity: next ? "1" : "0" }], { duration, easing: "ease-in-out" });
    }
    animation.finished.then(() => {
      node.hidden = !next;
      settle();
    }, () => {});
  }
  snap(open);
  return {
    update(next) {
      if (next === shown)
        return;
      shown = next;
      present(next);
    },
    destroy() {
      animation?.cancel();
    }
  };
}

// ../packages/foundation/src/response-chart/arithmetic.ts
var HOUR_MS = 3600000;
var DAY_MS = 86400000;
var FIXED_RANGE_MS = {
  month: 30 * DAY_MS,
  quarter: 90 * DAY_MS
};
var SCALE_UNITS = [
  { every: HOUR_MS, majorEvery: 6 },
  { every: 6 * HOUR_MS, majorEvery: 4 },
  { every: DAY_MS, majorEvery: 5 },
  { every: 2 * DAY_MS, majorEvery: 5 },
  { every: 7 * DAY_MS, majorEvery: 4 },
  { every: 30 * DAY_MS, majorEvery: 3 },
  { every: 365 * DAY_MS, majorEvery: 5 }
];
var MOST_TICKS = 60;
function monotonePath(points) {
  if (points.length === 0)
    return "";
  if (points.length === 1)
    return `M${pointText(points[0])}`;
  const intervals = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const width = next.x - point.x;
    return {
      width,
      slope: width > 0 ? (next.y - point.y) / width : 0
    };
  });
  if (intervals.some(({ width }) => width <= 0)) {
    return points.map((point, index) => `${index === 0 ? "M" : "L"}${pointText(point)}`).join(" ");
  }
  const tangents = points.map((_, index) => {
    if (index === 0)
      return intervals[0].slope;
    if (index === points.length - 1)
      return intervals.at(-1).slope;
    const previous = intervals[index - 1];
    const next = intervals[index];
    if (previous.slope * next.slope <= 0)
      return 0;
    const previousWeight = 2 * next.width + previous.width;
    const nextWeight = next.width + 2 * previous.width;
    return (previousWeight + nextWeight) / (previousWeight / previous.slope + nextWeight / next.slope);
  });
  for (let index = 0;index < intervals.length; index += 1) {
    const slope = intervals[index].slope;
    if (slope === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const startRatio = tangents[index] / slope;
    const endRatio = tangents[index + 1] / slope;
    const magnitude = Math.hypot(startRatio, endRatio);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[index] = scale * startRatio * slope;
      tangents[index + 1] = scale * endRatio * slope;
    }
  }
  const commands = [`M${pointText(points[0])}`];
  for (let index = 0;index < intervals.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const third = intervals[index].width / 3;
    const firstControl = {
      x: start.x + third,
      y: start.y + tangents[index] * third
    };
    const secondControl = {
      x: end.x - third,
      y: end.y - tangents[index + 1] * third
    };
    commands.push(`C${pointText(firstControl)} ${pointText(secondControl)} ${pointText(end)}`);
  }
  return commands.join(" ");
}
function pointText(point) {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}
function responseRangeWindow(range, generatedAt, monitoringStartedAt) {
  const end = Date.parse(generatedAt);
  if (range === "all") {
    return { start: Date.parse(monitoringStartedAt), end };
  }
  return { start: end - FIXED_RANGE_MS[range], end };
}
function responseScaleTicks(window2) {
  const span = window2.end - window2.start;
  if (span <= 0)
    return [];
  const unit = SCALE_UNITS.find(({ every }) => span / every <= MOST_TICKS) ?? SCALE_UNITS.at(-1);
  const ticks = [];
  for (let step = 0;; step += 1) {
    const at = window2.end - step * unit.every;
    if (at < window2.start)
      break;
    ticks.push({ at, major: step % unit.majorEvery === 0 });
  }
  return ticks.reverse();
}
var AXIS_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
var SMALLEST_AXIS_STEP = 10;
function responseAxisStep(highest, steps) {
  const wanted = Math.max(highest, 0) / Math.max(1, steps);
  if (wanted <= SMALLEST_AXIS_STEP)
    return SMALLEST_AXIS_STEP;
  const power = 10 ** Math.floor(Math.log10(wanted));
  for (const mantissa of AXIS_MANTISSAS) {
    const candidate = mantissa * power;
    if (candidate >= wanted)
      return candidate;
  }
  return 10 * power;
}
function filterResponseSeries(series, range, generatedAt, monitoringStartedAt) {
  const { start, end } = responseRangeWindow(range, generatedAt, monitoringStartedAt);
  return series.map((entry) => ({
    ...entry,
    samples: entry.samples.filter(({ timestamp }) => {
      const sampleTime = Date.parse(timestamp);
      return sampleTime >= start && sampleTime <= end;
    })
  }));
}
function availableResponseTimestamps(series) {
  const timestamps = new Set;
  for (const entry of series) {
    for (const sample of entry.samples) {
      if (sample.responseTimeMs !== null)
        timestamps.add(sample.timestamp);
    }
  }
  return [...timestamps].sort((left, right) => Date.parse(left) - Date.parse(right));
}
function nearestResponseTimestamp(timestamps, targetTime) {
  let nearest = null;
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
function responseValuesAtTimestamp(series, timestamp) {
  const values = [];
  for (const entry of series) {
    const sample = entry.samples.find((candidate) => candidate.timestamp === timestamp);
    if (sample?.responseTimeMs !== null && sample?.responseTimeMs !== undefined) {
      values.push({
        protocol: entry.protocol,
        responseTimeMs: sample.responseTimeMs
      });
    }
  }
  return values;
}
function downsampleResponseSamples(samples, maxPoints) {
  if (samples.length <= maxPoints)
    return samples;
  if (maxPoints <= 0)
    return [];
  if (maxPoints === 1)
    return [samples.at(-1)];
  const required = new Set([0, samples.length - 1]);
  let minimumIndex = null;
  let maximumIndex = null;
  samples.forEach((sample, index) => {
    if (sample.responseTimeMs === null) {
      if (index === 0 || samples[index - 1]?.responseTimeMs !== null) {
        required.add(index);
      }
      return;
    }
    if (minimumIndex === null || sample.responseTimeMs < samples[minimumIndex].responseTimeMs) {
      minimumIndex = index;
    }
    if (maximumIndex === null || sample.responseTimeMs > samples[maximumIndex].responseTimeMs) {
      maximumIndex = index;
    }
  });
  if (minimumIndex !== null)
    required.add(minimumIndex);
  if (maximumIndex !== null)
    required.add(maximumIndex);
  const candidates = samples.map((_, index) => index).filter((index) => !required.has(index));
  const availableSlots = Math.max(0, maxPoints - required.size);
  for (let slot = 0;slot < availableSlots; slot += 1) {
    const candidateIndex = availableSlots === 1 ? Math.floor(candidates.length / 2) : Math.round(slot * (candidates.length - 1) / (availableSlots - 1));
    required.add(candidates[candidateIndex]);
  }
  return [...required].sort((left, right) => left - right).map((index) => samples[index]);
}

// ../packages/foundation/src/overlay/index.ts
var WINDOW_MARGIN = 8;
var ANCHOR_GAP = 9;
function createOverlay(className, host) {
  const element = document.createElement("div");
  element.className = className;
  element.setAttribute("role", "status");
  element.hidden = true;
  element.style.position = "fixed";
  element.style.zIndex = "60";
  element.style.pointerEvents = "none";
  element.style.width = "max-content";
  (host ?? document.body).append(element);
  let currentAnchor = null;
  function place() {
    if (!currentAnchor)
      return;
    const anchor = currentAnchor();
    if (!anchor) {
      hide();
      return;
    }
    const box = element.getBoundingClientRect();
    const wantsAbove = anchor.side !== "below";
    const roomAbove = anchor.rect.top - box.height - ANCHOR_GAP;
    const roomBelow = window.innerHeight - anchor.rect.bottom - box.height - ANCHOR_GAP;
    const above = wantsAbove ? roomAbove >= WINDOW_MARGIN || roomBelow < WINDOW_MARGIN : !(roomBelow >= WINDOW_MARGIN || roomAbove < WINDOW_MARGIN);
    const top = above ? anchor.rect.top - box.height - ANCHOR_GAP : anchor.rect.bottom + ANCHOR_GAP;
    const centred = anchor.rect.left + anchor.rect.width / 2 - box.width / 2;
    const left = Math.min(Math.max(centred, WINDOW_MARGIN), window.innerWidth - box.width - WINDOW_MARGIN);
    element.style.top = `${Math.max(WINDOW_MARGIN, Math.min(top, window.innerHeight - box.height - WINDOW_MARGIN))}px`;
    element.style.left = `${Math.max(WINDOW_MARGIN, left)}px`;
  }
  function hide() {
    if (element.hidden)
      return;
    element.hidden = true;
    currentAnchor = null;
  }
  const reposition = () => {
    if (!element.hidden)
      place();
  };
  window.addEventListener("scroll", reposition, { passive: true, capture: true });
  window.addEventListener("resize", reposition, { passive: true });
  return {
    show(content, anchor) {
      currentAnchor = anchor;
      if (typeof content === "string") {
        element.textContent = content;
      } else {
        element.textContent = "";
        element.append(content);
      }
      element.hidden = false;
      place();
    },
    hide,
    destroy() {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
      element.remove();
    }
  };
}

// ../packages/foundation/src/response-chart/view.ts
var DEFAULT_RESPONSE_CHART_STYLE = {
  height: 148,
  insetInline: 12,
  insetBlock: 12,
  gridLines: 3,
  lineWidth: 2,
  pointRadius: 3,
  fill: 0,
  tickMinor: 0,
  tickMajor: 0
};
var SVG_NS = "http://www.w3.org/2000/svg";
var VIEW_WIDTH = 640;
var MAX_POINTS = 96;
var HOVER_TIME = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
function formatMilliseconds(value) {
  return value === null || value === undefined ? "unavailable" : `${Math.round(value)} ms`;
}
function protocolLabel(protocol) {
  return protocol === "ipv4" ? "IPv4" : "IPv6";
}
function measuredRuns(samples) {
  const runs = [];
  let current = [];
  for (const sample of samples) {
    if (sample.responseTimeMs === null) {
      if (current.length > 0)
        runs.push(current);
      current = [];
    } else {
      current.push(sample);
    }
  }
  if (current.length > 0)
    runs.push(current);
  return runs;
}
function svg(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}
function createChartView(host, serviceId, serviceName, generatedAt, monitoringStartedAt, options = {}) {
  const report = options.report;
  const reportLegend = options.legend;
  function currentStyle() {
    const given = typeof options.style === "function" ? options.style() : options.style;
    return { ...DEFAULT_RESPONSE_CHART_STYLE, ...given };
  }
  function currentSeriesColours() {
    const given = typeof options.seriesColours === "function" ? options.seriesColours() : options.seriesColours;
    return given ?? { ipv4: "", ipv6: "" };
  }
  host.textContent = "";
  host.setAttribute("tabindex", "0");
  host.setAttribute("role", "img");
  let series = [];
  let range = "month";
  let activeTimestamp = null;
  let filtered = [];
  let timestamps = [];
  let rangeWindow = responseRangeWindow(range, generatedAt, monitoringStartedAt);
  let frame = 0;
  let seriesColours = { ipv4: "", ipv6: "" };
  let geometry = null;
  const tooltip = options.tooltip === false ? null : createOverlay(options.tooltipClassName ?? "chart-reading", options.overlayHost);
  function plotBox() {
    const drawing = host.querySelector("svg");
    return (drawing ?? host).getBoundingClientRect();
  }
  function deriveState() {
    filtered = filterResponseSeries(series, range, generatedAt, monitoringStartedAt);
    timestamps = availableResponseTimestamps(filtered);
    rangeWindow = responseRangeWindow(range, generatedAt, monitoringStartedAt);
  }
  function schedulePointer() {
    if (frame !== 0)
      return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      placeHover();
    });
  }
  function redrawNow() {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    render();
  }
  function showReading(plotX, timestamp, values) {
    if (report) {
      report([
        HOVER_TIME.format(new Date(timestamp)),
        values.map((value) => `${protocolLabel(value.protocol)} ${formatMilliseconds(value.responseTimeMs)}`).join("   ")
      ]);
      return;
    }
    const body = document.createElement("span");
    body.className = "chart-reading-body";
    const when = document.createElement("span");
    when.className = "chart-reading-time";
    when.textContent = HOVER_TIME.format(new Date(timestamp));
    body.append(when);
    for (const value of values) {
      const row = document.createElement("span");
      row.className = "chart-reading-row";
      row.dataset.protocol = value.protocol;
      const colour = seriesColours[value.protocol];
      if (colour)
        row.style.setProperty("--series-colour", colour);
      const key = document.createElement("span");
      key.className = "chart-reading-key";
      const label = document.createElement("span");
      label.textContent = protocolLabel(value.protocol);
      const reading = document.createElement("strong");
      reading.textContent = formatMilliseconds(value.responseTimeMs);
      row.append(key, label, reading);
      body.append(row);
    }
    tooltip?.show(body, () => {
      if (activeTimestamp !== timestamp)
        return null;
      const box = plotBox();
      if (box.width === 0)
        return null;
      const scale = box.width / VIEW_WIDTH;
      return {
        rect: new DOMRect(box.left + plotX * scale, box.top, 1, box.height),
        side: "above"
      };
    });
  }
  function render() {
    const tokens = currentStyle();
    seriesColours = currentSeriesColours();
    const withSamples = filtered.filter(({ samples }) => samples.length > 0);
    reportLegend?.(withSamples.map((entry) => ({
      protocol: entry.protocol,
      label: protocolLabel(entry.protocol),
      value: formatMilliseconds(entry.samples.at(-1)?.responseTimeMs)
    })));
    host.textContent = "";
    if (withSamples.length === 0) {
      const empty = document.createElement("p");
      empty.className = "chart-empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No response history for this range.";
      empty.style.aspectRatio = `${VIEW_WIDTH} / ${tokens.height}`;
      host.append(empty);
      host.removeAttribute("tabindex");
      geometry = null;
      tooltip?.hide();
      return;
    }
    host.setAttribute("tabindex", "0");
    const plotTop = tokens.insetBlock;
    const plotBottom = tokens.height;
    const plotLeft = tokens.insetInline;
    const plotRight = VIEW_WIDTH - tokens.insetInline;
    let highest = 1;
    for (const entry of filtered) {
      for (const sample of entry.samples) {
        if (sample.responseTimeMs !== null && sample.responseTimeMs > highest) {
          highest = sample.responseTimeMs;
        }
      }
    }
    const steps = Math.max(1, tokens.gridLines - 1);
    const step = responseAxisStep(highest, steps);
    const maximum = step * steps;
    const xForTime = (time) => plotLeft + (time - rangeWindow.start) / (rangeWindow.end - rangeWindow.start) * (plotRight - plotLeft);
    const xFor = (timestamp) => xForTime(Date.parse(timestamp));
    const yFor = (value) => plotBottom - value / maximum * (plotBottom - plotTop);
    const root = svg("svg", {
      class: "chart-svg",
      viewBox: `0 0 ${VIEW_WIDTH} ${tokens.height}`,
      "aria-hidden": "true"
    });
    if (tokens.fill > 0) {
      const defs = svg("defs");
      for (const protocol of ["ipv4", "ipv6"]) {
        const gradient = svg("linearGradient", {
          id: `chart-${serviceId}-${protocol}`,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1
        });
        gradient.dataset.protocol = protocol;
        gradient.append(svg("stop", { offset: 0, "stop-opacity": tokens.fill }), svg("stop", { offset: 1, "stop-opacity": 0 }));
        defs.append(gradient);
      }
      root.append(defs);
    }
    const grid = svg("g", { class: "chart-grid", "aria-hidden": "true" });
    for (let index = 0;index < tokens.gridLines; index += 1) {
      const y = tokens.gridLines === 1 ? (plotTop + plotBottom) / 2 : plotTop + index * (plotBottom - plotTop) / (tokens.gridLines - 1);
      grid.append(svg("line", { x1: plotLeft, y1: y, x2: plotRight, y2: y }));
    }
    root.append(grid);
    const scale = svg("g", { class: "chart-scale", "aria-hidden": "true" });
    for (let index = 0;index < tokens.gridLines - 1; index += 1) {
      const y = plotTop + index * (plotBottom - plotTop) / (tokens.gridLines - 1);
      const value = maximum * (1 - index / (tokens.gridLines - 1));
      const label = svg("text", { x: plotLeft + 4, y: y - 4 });
      label.textContent = `${Math.round(value)} ms`;
      scale.append(label);
    }
    root.append(scale);
    for (const entry of withSamples) {
      const reduced = downsampleResponseSamples(entry.samples, MAX_POINTS);
      for (const run of measuredRuns(reduced)) {
        const points = run.map((sample) => ({
          x: xFor(sample.timestamp),
          y: yFor(sample.responseTimeMs)
        }));
        if (points.length === 1) {
          const point = svg("circle", {
            class: "chart-point",
            cx: points[0].x,
            cy: points[0].y,
            r: tokens.pointRadius
          });
          point.dataset.protocol = entry.protocol;
          root.append(point);
          continue;
        }
        const path = monotonePath(points);
        if (tokens.fill > 0) {
          const area = svg("path", {
            class: "chart-area",
            d: `${path} L${points.at(-1).x.toFixed(2)} ${plotBottom} L${points[0].x.toFixed(2)} ${plotBottom} Z`,
            fill: `url(#chart-${serviceId}-${entry.protocol})`
          });
          area.dataset.protocol = entry.protocol;
          root.append(area);
        }
        const line = svg("path", {
          class: "chart-line",
          d: path,
          "stroke-width": tokens.lineWidth
        });
        line.dataset.protocol = entry.protocol;
        root.append(line);
      }
    }
    if (tokens.tickMajor > 0 || tokens.tickMinor > 0) {
      const ticks = svg("g", { class: "chart-ticks", "aria-hidden": "true" });
      for (const tick of responseScaleTicks(rangeWindow)) {
        const x = xForTime(tick.at);
        ticks.append(svg("line", {
          class: tick.major ? "chart-tick chart-tick--major" : "chart-tick",
          x1: x,
          y1: plotBottom - (tick.major ? tokens.tickMajor : tokens.tickMinor),
          x2: x,
          y2: plotBottom
        }));
      }
      root.append(ticks);
    }
    const axes = svg("g", { class: "chart-axis", "aria-hidden": "true" });
    axes.append(svg("line", {
      class: "chart-axis-line chart-axis-line--value",
      x1: plotLeft,
      y1: plotTop,
      x2: plotLeft,
      y2: plotBottom
    }), svg("line", {
      class: "chart-axis-line chart-axis-line--time",
      x1: plotLeft,
      y1: plotBottom,
      x2: plotRight,
      y2: plotBottom
    }));
    root.append(axes);
    const hover = svg("g", { class: "chart-hover", "aria-hidden": "true" });
    root.append(hover);
    geometry = {
      hover,
      xFor,
      yFor,
      height: tokens.height,
      pointRadius: tokens.pointRadius
    };
    const description = withSamples.map((entry) => {
      const measured = entry.samples.filter((sample) => sample.responseTimeMs !== null);
      const times = measured.map((sample) => sample.responseTimeMs);
      const missing = entry.samples.length - measured.length;
      return `${protocolLabel(entry.protocol)}: current ${formatMilliseconds(entry.samples.at(-1)?.responseTimeMs)}, minimum ${formatMilliseconds(Math.min(...times))}, maximum ${formatMilliseconds(Math.max(...times))}, ${missing === 0 ? "no unavailable samples" : `${missing} unavailable ${missing === 1 ? "sample" : "samples"}`}.`;
    }).join(" ");
    host.setAttribute("aria-label", `Response time chart for ${serviceName}. ${description} Unavailable samples create gaps in the chart.`);
    host.append(root);
    placeHover();
  }
  function placeHover() {
    if (!geometry)
      return;
    geometry.hover.textContent = "";
    const values = activeTimestamp ? responseValuesAtTimestamp(filtered, activeTimestamp) : [];
    if (!activeTimestamp || values.length === 0) {
      tooltip?.hide();
      report?.(null);
      return;
    }
    const x = geometry.xFor(activeTimestamp);
    geometry.hover.append(svg("rect", { class: "chart-needle", x, y: 0, height: geometry.height }), svg("line", {
      class: "chart-crosshair",
      x1: x,
      y1: 0,
      x2: x,
      y2: geometry.height
    }));
    for (const value of values) {
      const dot = svg("circle", {
        class: "chart-hover-point",
        cx: x,
        cy: geometry.yFor(value.responseTimeMs),
        r: geometry.pointRadius + 1
      });
      dot.dataset.protocol = value.protocol;
      geometry.hover.append(dot);
    }
    showReading(x, activeTimestamp, values);
  }
  function onPointerMove(event) {
    const box = plotBox();
    if (box.width === 0)
      return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const next = nearestResponseTimestamp(timestamps, rangeWindow.start + ratio * (rangeWindow.end - rangeWindow.start));
    if (next === activeTimestamp)
      return;
    activeTimestamp = next;
    schedulePointer();
  }
  function clearHover() {
    if (activeTimestamp === null)
      return;
    activeTimestamp = null;
    schedulePointer();
  }
  function onKeyDown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      return;
    event.preventDefault();
    if (timestamps.length === 0)
      return;
    const current = activeTimestamp ? timestamps.indexOf(activeTimestamp) : timestamps.length - 1;
    const next = Math.min(timestamps.length - 1, Math.max(0, current + (event.key === "ArrowLeft" ? -1 : 1)));
    activeTimestamp = timestamps[next] ?? null;
    schedulePointer();
  }
  function onFocus() {
    activeTimestamp = timestamps.at(-1) ?? null;
    schedulePointer();
  }
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", clearHover);
  host.addEventListener("blur", clearHover);
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("focus", onFocus);
  return {
    update(nextSeries, nextRange) {
      series = nextSeries;
      range = nextRange;
      activeTimestamp = null;
      deriveState();
      redrawNow();
    },
    destroy() {
      if (frame !== 0)
        cancelAnimationFrame(frame);
      frame = 0;
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", clearHover);
      host.removeEventListener("blur", clearHover);
      host.removeEventListener("keydown", onKeyDown);
      host.removeEventListener("focus", onFocus);
      tooltip?.destroy();
      host.textContent = "";
    }
  };
}

// ../packages/foundation/src/preferences/index.ts
var RANGE_KEY = "velvet:range";
function openKey(serviceId) {
  return `velvet:open:${serviceId}`;
}
var RANGES = ["month", "quarter", "all"];
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function readRange(fallback) {
  try {
    const stored = storage()?.getItem(RANGE_KEY);
    return RANGES.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}
function writeRange(range) {
  try {
    storage()?.setItem(RANGE_KEY, range);
  } catch {}
}
function readOpen(serviceId, fallback = false) {
  try {
    const stored = storage()?.getItem(openKey(serviceId));
    if (stored === null || stored === undefined)
      return fallback;
    return stored === "1";
  } catch {
    return fallback;
  }
}
function writeOpen(serviceId, open) {
  try {
    storage()?.setItem(openKey(serviceId), open ? "1" : "0");
  } catch {}
}

// ../packages/foundation/src/status.ts
var DOWN_SEGMENT_THRESHOLD = 0.3;
var DAY_MS2 = 24 * 60 * 60 * 1000;
var FIXED_SPECS = {
  month: { days: 30, bucketDays: 1 },
  quarter: { days: 90, bucketDays: 1 }
};
function daysCovered(fromIso, toIso) {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`);
  return Math.max(1, Math.round((to - from) / DAY_MS2) + 1);
}
function bucketForSpan(days) {
  if (days <= 90)
    return 1;
  if (days <= 90 * 7)
    return 7;
  return 30;
}
function rangeSpec(range, generatedAt, monitoringStartedAt) {
  if (range !== "all")
    return FIXED_SPECS[range];
  const days = daysCovered(monitoringStartedAt, generatedAt);
  return { days, bucketDays: bucketForSpan(days) };
}
var SINCE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
function rangeLabel(range, monitoringStartedAt) {
  if (range === "month")
    return "30 days ago";
  if (range === "quarter")
    return "90 days ago";
  return SINCE_DATE.format(new Date(monitoringStartedAt));
}
function statusForAvailability(unavailableSeconds, monitoredSeconds) {
  if (unavailableSeconds <= 0)
    return "operational";
  if (unavailableSeconds / monitoredSeconds >= DOWN_SEGMENT_THRESHOLD) {
    return "outage";
  }
  return "degraded";
}
var statusRank = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  outage: 3
};
function worstStatus(statuses) {
  return statuses.reduce((worst, status) => statusRank[status] > statusRank[worst] ? status : worst, "operational");
}
function rangeDates(generatedAt, days) {
  const end = new Date(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}
function maintenanceForPeriod(events, serviceId, startsAt, endsAt) {
  return events.filter((event) => event.kind === "maintenance" && event.endsAt !== null && event.affectedServiceIds.includes(serviceId) && Date.parse(event.startsAt) < endsAt && Date.parse(event.endsAt) > startsAt).sort((left, right) => left.startsAt.localeCompare(right.startsAt)).map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt
  }));
}
function barsForRange(service, range, generatedAt, monitoringStartedAt, events = []) {
  const spec = rangeSpec(range, generatedAt, monitoringStartedAt);
  const availability = new Map(service.dailyAvailability.map((day) => [day.date, day]));
  const monitoringStartDate = monitoringStartedAt.slice(0, 10);
  const days = rangeDates(generatedAt, spec.days).map((date) => {
    const day = availability.get(date);
    const hasData = date >= monitoringStartDate && day !== undefined;
    const dayStartsAt = Date.parse(`${date}T00:00:00.000Z`);
    return {
      date,
      status: day === undefined ? "operational" : statusForAvailability(day.unavailableSeconds, day.monitoredSeconds),
      minutesDown: day === undefined ? 0 : Math.round(day.unavailableSeconds / 60),
      hasData,
      maintenance: maintenanceForPeriod(events, service.id, dayStartsAt, dayStartsAt + DAY_MS2)
    };
  });
  if (spec.bucketDays === 1) {
    return days.map((day) => ({ ...day, spanDays: 1 }));
  }
  const bars = [];
  const remainder = days.length % spec.bucketDays;
  let cursor = 0;
  let size = remainder === 0 ? spec.bucketDays : remainder;
  while (cursor < days.length) {
    const bucket = days.slice(cursor, cursor + size);
    const monitoredDays = bucket.filter(({ hasData }) => hasData);
    const maintenance = [
      ...new Map(bucket.flatMap((day) => day.maintenance).map((event) => [event.id, event])).values()
    ];
    bars.push({
      date: bucket[bucket.length - 1].date,
      status: worstStatus(monitoredDays.map(({ status }) => status)),
      minutesDown: bucket.reduce((total, { minutesDown }) => total + minutesDown, 0),
      hasData: monitoredDays.length > 0,
      spanDays: bucket.length,
      maintenance
    });
    cursor += size;
    size = spec.bucketDays;
  }
  return bars;
}
function overallStatus(services) {
  if (services.length === 0)
    return "unknown";
  return worstStatus(services.map(({ status }) => status));
}
function visibleEvents(events) {
  return events.filter((event) => event.kind === "incident" && event.state === "open" || event.kind === "maintenance" && event.state !== "completed").sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
function uptimeForRange(service, range, generatedAt, monitoringStartedAt) {
  const dates = new Set(rangeDates(generatedAt, rangeSpec(range, generatedAt, monitoringStartedAt).days));
  const monitoringStartDate = monitoringStartedAt.slice(0, 10);
  const availability = service.dailyAvailability.filter(({ date }) => dates.has(date) && date >= monitoringStartDate);
  const monitoredSeconds = availability.reduce((total, day) => total + day.monitoredSeconds, 0);
  if (monitoredSeconds === 0)
    return "No data";
  const unavailableSeconds = availability.reduce((total, day) => total + day.unavailableSeconds, 0);
  const percentage = Math.max(0, 100 - unavailableSeconds / monitoredSeconds * 100);
  return `${percentage.toFixed(2)}%`;
}
function hoursWatching(monitoringStartedAt, generatedAt) {
  const began = Date.parse(monitoringStartedAt);
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(began) || !Number.isFinite(now))
    return null;
  return Math.max(0, (now - began) / 3600000);
}
function settlingIn(monitoringStartedAt, generatedAt) {
  const hours = hoursWatching(monitoringStartedAt, generatedAt);
  return hours !== null && hours < 24 ? "Velvet started watching this page today. The days and the response times fill in as the checks run, so an empty stretch here is what a new page looks like rather than something being wrong." : null;
}

// ../packages/foundation/src/appearance/index.ts
var APPEARANCE_EVENT = "velvet:appearance";

// ../packages/foundation/src/uptime-strip/index.ts
var SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric"
});
var FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  year: "numeric"
});
var MAINTENANCE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});
var DEFAULT_UPTIME_STRIP_STYLE = {
  height: 32,
  hoverHeight: 38,
  gap: 2,
  radius: 2,
  narrowRadius: 999,
  gloss: true,
  relief: "raised",
  align: "center",
  pieces: 1,
  pieceGap: 2,
  trackRadius: 0,
  operational: "#3fa06a",
  degraded: "#d1971f",
  outage: "#cf4a3a",
  noData: "#3a3a44",
  maintenance: "#4a7fd1",
  maintenanceEdge: "#89b3f0",
  ghostEdge: "#5a5a68"
};
function statusColour(day, style) {
  if (day.maintenance.length > 0 && day.status === "operational") {
    return style.maintenance;
  }
  if (!day.hasData && day.maintenance.length === 0)
    return style.noData;
  if (day.status === "operational")
    return style.operational;
  if (day.status === "unknown")
    return style.noData;
  if (day.status === "degraded")
    return style.degraded;
  return style.outage;
}
function label(day) {
  if (!day.hasData)
    return "no data";
  if (day.status === "operational")
    return "operational";
  if (day.status === "unknown")
    return "status unknown";
  if (day.status === "degraded")
    return `degraded · ${day.minutesDown} min down`;
  return `outage · ${day.minutesDown} min`;
}
function maintenanceLabel(day) {
  return day.maintenance.map((event) => `Maintenance: ${event.title}
${MAINTENANCE_TIME.format(new Date(event.startsAt))} – ${MAINTENANCE_TIME.format(new Date(event.endsAt))}`).join(`
`);
}
function tooltipFor(day) {
  const end = new Date(`${day.date}T00:00:00Z`);
  if (day.spanDays > 1) {
    const start = new Date(end.getTime() - (day.spanDays - 1) * 86400000);
    return [
      `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`,
      label(day),
      maintenanceLabel(day)
    ].filter(Boolean).join(`
`);
  }
  return [FULL_DATE.format(end), label(day), maintenanceLabel(day)].filter(Boolean).join(`
`);
}
function summarise(days) {
  const counted = {};
  for (const day of days) {
    const name = day.maintenance.length > 0 ? "under maintenance" : label(day);
    const key = name.split(" · ")[0];
    counted[key] = (counted[key] ?? 0) + 1;
  }
  const parts = Object.entries(counted).sort((left, right) => right[1] - left[1]).map(([name, count]) => `${count} ${name}`);
  return parts.length === 0 ? "Availability history: nothing recorded yet." : `Availability history: ${parts.join(", ")}.`;
}
function slot(index, total, width, gap) {
  const spare = Math.max(0, width - total);
  const fitted = total > 1 ? Math.min(gap, spare / (total - 1)) : 0;
  const each = (width - fitted * (total - 1)) / total;
  return { x: index * (each + fitted), width: each };
}
function segmentAt(offsetX, total, width, gap) {
  if (total === 0 || width <= 0)
    return null;
  const each = (width - gap * (total - 1)) / total;
  const index = Math.floor(offsetX / (each + gap));
  return index >= 0 && index < total ? index : null;
}
function createUptimeStrip(host, options = {}) {
  const className = options.className ?? "uptime-strip";
  const heightProperty = options.heightProperty ?? "--uptime-strip-height";
  const report = options.report;
  function currentStyle() {
    const given = typeof options.style === "function" ? options.style() : options.style;
    return { ...DEFAULT_UPTIME_STRIP_STYLE, ...given };
  }
  host.textContent = "";
  host.classList.add(className);
  host.setAttribute("role", "img");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const tooltip = createOverlay(options.tooltipClassName ?? "uptime-tooltip", options.overlayHost);
  const hiddenList = document.createElement("ul");
  hiddenList.className = `${className}-readings`;
  hiddenList.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
  host.append(canvas, hiddenList);
  let days = [];
  let hovered = null;
  let width = 0;
  let ratio = 1;
  let frame = 0;
  function paint() {
    const context = canvas.getContext("2d");
    if (!context || width <= 0)
      return;
    const style = currentStyle();
    const surfaceHeight = style.hoverHeight + 2;
    host.style.setProperty(heightProperty, `${surfaceHeight}px`);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(surfaceHeight * ratio);
    canvas.style.width = "100%";
    canvas.style.height = `${surfaceHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, surfaceHeight);
    const segment = slot(0, days.length, width, style.gap).width;
    const radius = segment < style.radius * 4 ? style.narrowRadius : style.radius;
    const gloss = context.createLinearGradient(0, (surfaceHeight - style.height) / 2, 0, (surfaceHeight + style.height) / 2);
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    gloss.addColorStop(0.42, "rgba(255, 255, 255, 0.05)");
    gloss.addColorStop(1, "rgba(0, 0, 0, 0.12)");
    const pieces = Math.max(1, Math.min(8, Math.round(style.pieces)));
    days.forEach((day, index) => {
      const place = slot(index, days.length, width, style.gap);
      const lifted = index === hovered;
      const lightens = style.hover === "lighten";
      const drawnHeight = lifted && !lightens ? style.hoverHeight : style.height;
      const y = style.align === "bottom" ? surfaceHeight - drawnHeight - 1 : style.align === "top" ? 1 : (surfaceHeight - drawnHeight) / 2;
      const empty = !day.hasData && day.maintenance.length === 0;
      const base = statusColour(day, style);
      const colour = lifted && lightens && !empty ? `color-mix(in srgb, #ffffff ${Math.round((style.hoverLighten ?? 0.28) * 100)}%, ${base})` : base;
      const edge = empty ? style.ghostEdge : day.maintenance.length > 0 ? style.maintenanceEdge : null;
      const pieceHeight = (drawnHeight - style.pieceGap * (pieces - 1)) / pieces;
      if (pieceHeight <= 0)
        return;
      const fitted = Math.min(radius, place.width / 2, pieceHeight / 2);
      const cap = Math.min(style.trackRadius, place.width, pieceHeight / 2);
      const first = index === 0 ? cap : fitted;
      const last = index === days.length - 1 ? cap : fitted;
      const ramp = (piece) => {
        if (style.relief !== "sunken" || pieces < 2)
          return colour;
        const spread = style.reliefSpread ?? 0.16;
        const step = (piece / (pieces - 1) - 0.5) * spread * 100;
        const towards = step >= 0 ? "#ffffff" : "#000000";
        return `color-mix(in srgb, ${towards} ${Math.abs(step).toFixed(1)}%, ${colour})`;
      };
      const recess = style.relief === "sunken" ? context.createLinearGradient(0, 0, 0, pieceHeight) : null;
      if (recess) {
        recess.addColorStop(0, "rgba(0, 0, 0, 0.64)");
        recess.addColorStop(0.36, "rgba(0, 0, 0, 0.12)");
        recess.addColorStop(0.84, "rgba(0, 0, 0, 0)");
        recess.addColorStop(1, "rgba(255, 255, 255, 0.2)");
      }
      for (let piece = 0;piece < pieces; piece += 1) {
        const pieceY = y + piece * (pieceHeight + style.pieceGap);
        if (recess)
          context.save();
        if (recess)
          context.translate(0, pieceY);
        const top = recess ? 0 : pieceY;
        context.beginPath();
        context.roundRect(place.x, top, place.width, pieceHeight, [
          first,
          last,
          last,
          first
        ]);
        context.fillStyle = ramp(piece);
        context.fill();
        if (!empty && style.gloss) {
          context.fillStyle = recess ?? gloss;
          context.fill();
        }
        if (!edge) {
          if (recess)
            context.restore();
          continue;
        }
        context.beginPath();
        context.roundRect(place.x + 0.5, top + 0.5, Math.max(place.width - 1, 0), Math.max(pieceHeight - 1, 0), [
          Math.max(first - 0.5, 0),
          Math.max(last - 0.5, 0),
          Math.max(last - 0.5, 0),
          Math.max(first - 0.5, 0)
        ]);
        context.strokeStyle = edge;
        context.lineWidth = 1;
        context.stroke();
        if (recess)
          context.restore();
      }
    });
  }
  function placeTooltip() {
    if (hovered === null || !days[hovered]) {
      tooltip.hide();
      report?.(null);
      return;
    }
    const index = hovered;
    if (report) {
      report(tooltipFor(days[index]).split(`
`));
      return;
    }
    tooltip.show(tooltipFor(days[index]), () => {
      if (hovered !== index)
        return null;
      const box = host.getBoundingClientRect();
      const place = slot(index, days.length, box.width, currentStyle().gap);
      return {
        rect: new DOMRect(box.left + place.x, box.top, place.width, box.height),
        side: "above"
      };
    });
  }
  function scheduleDraw() {
    if (frame !== 0)
      return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
      placeTooltip();
    });
  }
  function drawNow() {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    paint();
    placeTooltip();
  }
  function onPointerMove(event) {
    const box = host.getBoundingClientRect();
    const next = segmentAt(event.clientX - box.left, days.length, box.width, currentStyle().gap);
    if (next === hovered)
      return;
    hovered = next;
    scheduleDraw();
  }
  function onPointerLeave() {
    if (hovered === null)
      return;
    hovered = null;
    scheduleDraw();
  }
  const onAppearance = () => drawNow();
  document.addEventListener(APPEARANCE_EVENT, onAppearance);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);
  const observer = new ResizeObserver(([entry]) => {
    const next = entry?.contentRect.width ?? 0;
    if (next === width)
      return;
    width = next;
    drawNow();
  });
  observer.observe(host);
  width = host.getBoundingClientRect().width;
  ratio = window.devicePixelRatio || 1;
  return {
    update(nextDays) {
      days = nextDays;
      hovered = null;
      host.setAttribute("aria-label", summarise(days));
      hiddenList.textContent = "";
      for (const day of days.filter((entry) => entry.maintenance.length > 0)) {
        const item = document.createElement("li");
        item.textContent = tooltipFor(day);
        hiddenList.append(item);
      }
      drawNow();
    },
    destroy() {
      if (frame !== 0)
        cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      document.removeEventListener(APPEARANCE_EVENT, onAppearance);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      tooltip.destroy();
    }
  };
}

// theme-bundles/retro-chassis/format.ts
var RANGES2 = [
  { key: "month", label: "30d", description: "The last 30 days" },
  { key: "quarter", label: "90d", description: "The last 90 days" },
  { key: "all", label: "All", description: "Everything measured" }
];
function rangeNamed(key) {
  return RANGES2.find((option) => option.key === key) ?? RANGES2[0];
}
var EVENT_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short"
});
function formatEventTime(moment) {
  return EVENT_TIME.format(moment);
}
function formatUpdated(moment) {
  return EVENT_TIME.format(new Date(moment));
}
var STATE_WORD = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Maintenance",
  unknown: "No data"
};
function escape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// theme-bundles/retro-chassis/script.ts
var STRIP_GEOMETRY = {
  height: 30,
  hoverHeight: 36,
  gap: 3,
  radius: 2,
  narrowRadius: 2,
  trackRadius: 2,
  gloss: true,
  relief: "sunken",
  hover: "lighten",
  hoverLighten: 0.52,
  reliefSpread: 0.26,
  align: "center",
  pieces: 4,
  pieceGap: 2
};
var CHART_GEOMETRY = {
  height: 150,
  insetInline: 0,
  insetBlock: 22,
  gridLines: 5,
  lineWidth: 2,
  pointRadius: 3,
  fill: 0.32,
  tickMinor: 9,
  tickMajor: 13
};
function colourOf(style, name) {
  return style.getPropertyValue(name).trim();
}
function enhance(root, data) {
  const page = root.querySelector(".retro-chassis-page") ?? root;
  const undo = [];
  const rows = [];
  let range = readRange(data.site.defaultRange);
  const stripStyle = () => {
    const palette = getComputedStyle(page);
    return {
      ...STRIP_GEOMETRY,
      operational: colourOf(palette, "--state-operational"),
      degraded: colourOf(palette, "--state-degraded"),
      outage: colourOf(palette, "--state-outage"),
      noData: colourOf(palette, "--state-no-data"),
      maintenance: colourOf(palette, "--state-maintenance"),
      maintenanceEdge: colourOf(palette, "--state-maintenance-edge"),
      ghostEdge: colourOf(palette, "--state-ghost-edge")
    };
  };
  for (const element of page.querySelectorAll(".service")) {
    const id = element.dataset.serviceId ?? "";
    const entry = data.status.services.find((candidate) => candidate.id === id);
    const summary = element.querySelector(".service-summary");
    const uptime = element.querySelector(".service-uptime");
    const axisFrom = element.querySelector(".strip-axis-from");
    const stripHost = element.querySelector(".uptime-strip-host");
    const chartPlot = element.querySelector(".chart-plot");
    const chartFrom = element.querySelector(".chart-axis-from");
    const details = element.querySelector(".service-details-wrap");
    const displayMain = element.querySelector(".service-display-main");
    const lines = element.querySelectorAll(".service-display-line");
    const displaySecond = lines[1];
    if (!entry || !summary || !uptime || !axisFrom || !stripHost || !chartPlot || !chartFrom || !details || !displayMain || !displaySecond) {
      continue;
    }
    const restored = readOpen(id);
    const row = {
      id,
      name: entry.name,
      spoken: entry.checks.map((check) => check.protocol === "ipv6" ? "IPv6" : "IPv4").join(" and "),
      open: restored,
      root: element,
      summary,
      uptime,
      axisFrom,
      chartFrom,
      displayMain,
      displaySecond,
      status: entry.status,
      strip: createUptimeStrip(stripHost, {
        style: stripStyle,
        overlayHost: page,
        report: (reading) => readOut(row, reading)
      }),
      chart: createChartView(chartPlot, entry.id, entry.name, data.generatedAt, data.status.monitoringStartedAt, {
        style: CHART_GEOMETRY,
        overlayHost: page,
        tooltip: false,
        report: (reading) => readOut(row, reading)
      }),
      chartBuilt: false,
      panel: disclosure(details, restored)
    };
    rows.push(row);
    element.dataset.open = String(restored);
    summary.setAttribute("aria-expanded", String(restored));
    if (restored)
      buildChart(row);
    const onClick = () => {
      setOpen(row, !row.open);
      reflectToggleAll();
    };
    summary.addEventListener("click", onClick);
    undo.push(() => {
      summary.removeEventListener("click", onClick);
      row.strip.destroy();
      row.chart.destroy();
      row.panel.destroy();
    });
  }
  const track = page.querySelector(".ranges");
  const mark = page.querySelector(".range-mark");
  const buttons = [...page.querySelectorAll(".range-button")];
  for (const button of buttons) {
    const onClick = () => selectRange(button.dataset.range ?? "month");
    button.addEventListener("click", onClick);
    undo.push(() => button.removeEventListener("click", onClick));
  }
  const toggleAll = page.querySelector(".toggle-all");
  if (toggleAll) {
    const onClick = () => {
      const opening = !rows.every((row) => row.open);
      for (const row of rows)
        setOpen(row, opening);
      reflectToggleAll();
    };
    toggleAll.addEventListener("click", onClick);
    undo.push(() => toggleAll.removeEventListener("click", onClick));
  }
  function readOut(row, reading) {
    if (!reading || reading.length === 0) {
      row.displayMain.textContent = STATE_WORD[row.status] ?? "No data";
      row.displaySecond.textContent = rangeNamed(range).description;
      return;
    }
    row.displayMain.textContent = reading[0] ?? "";
    row.displaySecond.textContent = reading.slice(1).join("   ");
  }
  function buildChart(row) {
    if (row.chartBuilt)
      return;
    row.chart.update(data.responseTimes.series.filter(({ serviceId }) => serviceId === row.id), range);
    row.chartBuilt = true;
  }
  function setOpen(row, open) {
    if (row.open === open)
      return;
    row.open = open;
    row.root.dataset.open = String(open);
    row.summary.setAttribute("aria-expanded", String(open));
    writeOpen(row.id, open);
    if (open)
      buildChart(row);
    row.panel.update(open);
  }
  function reflectToggleAll() {
    if (!toggleAll)
      return;
    const allOpen = rows.length > 0 && rows.every((row) => row.open);
    toggleAll.classList.toggle("is-expanded", allOpen);
    toggleAll.setAttribute("aria-label", allOpen ? "Collapse all" : "Expand all");
    toggleAll.title = allOpen ? "Collapse all" : "Expand all";
  }
  function placeMark(animate) {
    const button = buttons.find((candidate) => candidate.dataset.range === range);
    if (!mark || !track || !button)
      return;
    if (track.getBoundingClientRect().width === 0)
      return;
    mark.style.transition = animate ? "" : "none";
    mark.style.width = `${button.offsetWidth}px`;
    mark.style.transform = `translateX(${button.offsetLeft}px)`;
    if (!animate) {
      mark.offsetWidth;
      mark.style.transition = "";
    }
  }
  function selectRange(next) {
    range = next;
    writeRange(next);
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.range === next));
    }
    placeMark(true);
    refresh();
  }
  function refresh() {
    const from = rangeLabel(range, data.status.monitoringStartedAt);
    for (const row of rows) {
      const entry = data.status.services.find(({ id }) => id === row.id);
      if (!entry)
        continue;
      const figure = uptimeForRange(entry, range, data.status.generatedAt, data.status.monitoringStartedAt);
      row.uptime.textContent = figure;
      row.summary.setAttribute("aria-label", [row.name, `${figure} uptime`, row.spoken].filter(Boolean).join(", "));
      row.strip.update(barsForRange(entry, range, data.status.generatedAt, data.status.monitoringStartedAt, data.incidents.events), range);
      row.axisFrom.textContent = from;
      row.chartFrom.textContent = from;
      readOut(row, null);
      if (row.chartBuilt) {
        row.chart.update(data.responseTimes.series.filter(({ serviceId }) => serviceId === row.id), range);
      }
    }
  }
  const powered = page.querySelector(".powered");
  function fitPoweredLabel() {
    const wordmark = powered?.querySelector(".velvet-wordmark");
    const label2 = powered?.querySelector(".powered-label");
    if (!wordmark || !label2)
      return;
    label2.style.removeProperty("--powered-label-tracking");
    const natural = label2.getBoundingClientRect().width;
    const target = wordmark.getBoundingClientRect().width;
    const gaps = (label2.textContent ?? "").length - 1;
    if (gaps <= 0 || natural <= 0 || target <= natural)
      return;
    label2.style.setProperty("--powered-label-tracking", `${(target - natural) / gaps}px`);
  }
  const watch = new ResizeObserver(() => {
    placeMark(false);
    fitPoweredLabel();
  });
  if (track)
    watch.observe(track);
  if (powered)
    watch.observe(powered);
  undo.push(() => watch.disconnect());
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button.dataset.range === range));
  }
  reflectToggleAll();
  refresh();
  placeMark(false);
  document.fonts?.ready.then(() => {
    placeMark(false);
    fitPoweredLabel();
  });
  return () => {
    for (const step of undo)
      step();
  };
}
var script_default = enhance;

// theme-bundles/retro-chassis/template.ts
var HEADLINE = {
  operational: "All systems operational",
  unknown: "System status unavailable",
  degraded: "Some systems degraded",
  outage: "Major service outage"
};
function vfd({ role, lines, width = "cells", attributes = "" }) {
  const measured = width === "cells" ? " vfd--sized" : "";
  if (lines.length === 1) {
    return `<span class="${role} vfd${measured}"${attributes}>${lines[0]}</span>`;
  }
  const body = lines.map((line) => `<span class="${role}-line vfd-line">${line}</span>`).join("");
  return `<span class="${role} vfd${measured}"${attributes}>${body}</span>`;
}
function key(plate = "") {
  return `<span class="disclosure-stack" aria-hidden="true">
      ${plate}
      <span class="disclosure-mark"></span>
    </span>`;
}
function keyPlate(word) {
  return vfd({ role: "disclosure-label", lines: [escape(word)] });
}
function hero(data, state) {
  return `<div class="status-band status-band--hero">
    <div class="status-hero">
      <span class="status-hero-mark" aria-hidden="true"></span>
      <p class="status-hero-name">${escape(data.site.name)}</p>
      <h1 class="status-hero-title">${escape(HEADLINE[state] ?? HEADLINE.unknown)}</h1>
      <p class="status-hero-updated">Last updated ${escape(formatUpdated(data.generatedAt))}</p>
    </div>
  </div>`;
}
function settling(data) {
  const said = settlingIn(data.status.monitoringStartedAt, data.generatedAt);
  return said === null ? "" : `<p class="settling-in" role="status">${escape(said)}</p>`;
}
function notice(event) {
  const started = new Date(event.startsAt);
  const meta = event.kind === "maintenance" ? `${escape(event.state)} · ${escape(formatEventTime(started))}` : `Started ${escape(formatEventTime(started))}`;
  return `<div class="notice notice--${escape(event.kind)}">
    <span class="notice-title">${escape(event.title)}</span>
    <span class="notice-summary">${escape(event.summary)}</span>
    <span class="notice-meta">${meta}</span>
  </div>`;
}
function notices(data) {
  const visible = visibleEvents(data.incidents.events);
  const maintenance = visible.filter((event) => event.kind === "maintenance");
  const incidents = visible.filter((event) => event.kind === "incident");
  const heading = incidents.length > 0 ? `<h2 class="notices-heading">Active incidents</h2>` : "";
  return `<section class="notices">${maintenance.map(notice).join("")}${heading}${incidents.map(notice).join("")}</section>`;
}
function rangeBar(data) {
  const keys = RANGES2.map((option) => `<button class="range-button" type="button" data-range="${option.key}" aria-pressed="${String(option.key === data.site.defaultRange)}" aria-label="${escape(option.description)}">${key(keyPlate(option.label))}</button>`).join("");
  return `<section class="service-card range-card">
    <span class="card-ornament" aria-hidden="true"></span>
    <div class="range-bar">
      <span class="group-name">${escape(data.site.name.toUpperCase())}</span>
      <div class="ranges">
        ${keys}
      </div>
      <button class="toggle-all" type="button" aria-label="Expand all" title="Expand all">
        ${key(keyPlate("OPEN"))}
      </button>
    </div>
  </section>`;
}
function protocols(service) {
  const badges = ["ipv4", "ipv6"].map((protocol) => {
    const check = service.checks.find((entry) => entry.protocol === protocol);
    const status = check ? ` data-status="${escape(check.status)}"` : "";
    return vfd({
      role: "protocol-badge",
      lines: [protocol === "ipv6" ? "IPv6" : "IPv4"],
      attributes: ` data-protocol="${protocol}" data-present="${String(Boolean(check))}"${status}`
    });
  }).join("");
  const single = service.checks.length === 1 && service.checks[0]?.protocol === "ipv4";
  return `<span class="service-protocols" aria-label="Protocol reachability" data-single="${String(single)}">${badges}</span>`;
}
function service(data, entry) {
  const figure = uptimeForRange(entry, data.site.defaultRange, data.status.generatedAt, data.status.monitoringStartedAt);
  const spoken = entry.checks.map((check) => check.protocol === "ipv6" ? "IPv6" : "IPv4").join(" and ");
  const window2 = RANGES2.find((option) => option.key === data.site.defaultRange);
  const readout = vfd({
    role: "service-display",
    width: "row",
    lines: [
      `<span class="service-display-main">${escape(STATE_WORD[entry.status] ?? "No data")}</span>` + `<span class="service-uptime">${escape(figure)}</span>`,
      escape(window2?.description ?? "")
    ]
  });
  return `<article class="service" data-service-id="${escape(entry.id)}" data-open="false">
    <button class="service-summary" type="button" aria-expanded="false" aria-controls="details-${escape(entry.id)}" aria-label="${escape([entry.name, `${figure} uptime`, spoken].filter(Boolean).join(", "))}">
      ${readout}
      ${protocols(entry)}
      ${key(keyPlate("OPEN"))}
    </button>
    <div class="uptime-strip-host"></div>
    <div class="strip-axis">
      <span class="strip-axis-from"></span>
      <span class="strip-axis-to">Today</span>
    </div>
    <span class="service-name"><span class="service-name-label">${escape(entry.name)}</span></span>
    <div class="service-details-wrap" id="details-${escape(entry.id)}">
      <div class="service-details">
        <div class="response-chart">
          <p class="chart-caption">Response time</p>
          <div class="chart-plot"></div>
          <div class="chart-axis-row" aria-hidden="true">
            <span class="chart-axis-from"></span>
            <span class="chart-axis-to">Now</span>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}
function services(data) {
  const ornament = `<span class="card-ornament" aria-hidden="true"></span>`;
  const rows = data.status.services.map((entry) => `<section class="service-card">${ornament}${service(data, entry)}</section>`).join("");
  return `<div class="service-list">${rows}</div>`;
}
function footer(data) {
  const serial = data.site.serial === null ? "—" : String(data.site.serial).padStart(5, "0");
  return `<div class="status-band status-band--footer">
    <footer class="status-footer">
      <div class="powered">
        <span class="powered-label">powered by</span>
        <span class="velvet-wordmark">Velvet</span>
      </div>
      <div class="status-footer-row">
        <p class="stamp stamp--build">v${escape(data.site.version)}</p>
        <p class="stamp stamp--serial">Serial #${escape(serial)}</p>
      </div>
    </footer>
  </div>`;
}
function template(data) {
  const state = overallStatus(data.status.services);
  const reporting = state !== "operational" && visibleEvents(data.incidents.events).length > 0;
  return `<main class="retro-chassis-page" data-layout="cards" data-status="${escape(state)}" data-notices="${reporting ? "some" : "none"}">
    ${hero(data, state)}
    <div class="status-band status-band--body">
      <div class="status-body">
        ${settling(data)}
        ${notices(data)}
        ${rangeBar(data)}
        ${services(data)}
      </div>
    </div>
    ${footer(data)}
  </main>`;
}
var template_default = template;

// ../config/themes/retro-chassis/entry.generated.ts
var THEME_ROOT = ".retro-chassis-page";
var root = document.querySelector("#velvet-root");
var data = JSON.parse(document.querySelector("#velvet-data").textContent);
var declared = JSON.parse(document.querySelector("#velvet-settings").textContent);
root.append(document.createRange().createContextualFragment(template_default(data)));
function apply(declarations) {
  const targets = [document.documentElement, document.querySelector(THEME_ROOT)];
  for (const target of targets) {
    if (!target)
      continue;
    for (const [property, value] of Object.entries(declarations)) {
      target.style.setProperty(property, value);
    }
  }
  document.dispatchEvent(new CustomEvent("velvet:appearance"));
}
script_default(root, data);
apply(declared);
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin)
    return;
  const message = event.data;
  if (!message || message.type !== "velvet:settings")
    return;
  apply(message.declarations);
});
window.parent.postMessage({ type: "velvet:ready" }, window.location.origin);

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Generates the printed-circuit-board backdrop used behind the onboarding shell.
 *
 * The artwork is a bare board: copper traces, plated through-holes, surface-mount
 * pads, vias, and silkscreen, with no components on top. Every trace runs from
 * one pad to another, because a run that starts and ends at something is what
 * separates a layout from a texture.
 *
 * The board is drawn once at a wide aspect ratio and scaled to cover the
 * viewport, so it is never tiled and never stretched. That is also why no trace
 * needs to reach an edge: there is no seam to hide.
 *
 * The layout is generated from a fixed seed rather than drawn by hand, so the
 * result is reproducible: running this again yields a byte-identical file, and a
 * deliberate change shows up as a reviewable diff.
 *
 * Usage:
 *   node scripts/build-pcb-backdrop.mjs [--out <path>] [--seed <integer>]
 *     [--release <semver>] [--year <yyyy>] [--contrast]
 *
 * `--contrast` raises every opacity to a level where the pattern is plainly
 * visible. That output is for judging the artwork and is never shipped, because
 * the backdrop belongs at the edge of perception.
 */

/**
 * Board dimensions.
 *
 * Wider than tall, close to the proportions of a desktop window, so covering
 * the viewport crops as little as possible. A square board loses its top and
 * bottom on any normal screen.
 */
const WIDTH = 1600;
const HEIGHT = 1000;

/** Spacing of the routing grid, which every trace vertex snaps to. */
const GRID = 8;

/**
 * Keep-out from the edge for features that must stay legible.
 *
 * Components may overhang the edge, since the backdrop is cropped anyway and a
 * uniform inner border would read as a frame. The identity block is the
 * exception, because a half-cut wordmark looks like a mistake.
 */
const MARGIN = 16;

/** The accent the rest of the interface uses, so the board belongs to it. */
const COPPER = "#8ca5ff";

/** Silkscreen on a real board is white, and here it carries the legible layer. */
const SILKSCREEN = "#ffffff";

/**
 * Per-layer opacities.
 *
 * Copper sits far enough back to read as texture. Silkscreen is allowed to be
 * the one thing that surfaces, which is also true of a real board seen in low
 * light: the white print is what you make out first.
 */
const SHIPPED_OPACITY = {
  trace: 0.034,
  copperFeature: 0.05,
  silkscreen: 0.062,
  wordmark: 0.078,
};

const CONTRAST_OPACITY = {
  trace: 0.3,
  copperFeature: 0.45,
  silkscreen: 0.8,
  wordmark: 0.9,
};

/** Feature counts per million square pixels, so density survives a resize. */
const DENSITY_PER_MEGAPIXEL = {
  integratedCircuits: 16,
  headers: 16,
  discretes: 83,
  vias: 114,
};

/**
 * Deterministic pseudo-random source.
 *
 * `Math.random` would make every run produce a different board, which defeats
 * reviewing the artwork as a diff.
 *
 * @param seed - Any integer. The same seed always yields the same sequence.
 * @returns A function returning the next value in `[0, 1)`.
 */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one member of a list. */
function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

/** Picks an integer in `[min, max]`. */
function pickInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Rounds to the routing grid, so vertices line up the way a router's would. */
function snap(value) {
  return Math.round(value / GRID) * GRID;
}

/** Trims a number to two decimals and drops a trailing zero. */
function coordinate(value) {
  return Number(value.toFixed(2)).toString();
}

function pointsAttribute(points) {
  return points.map(([x, y]) => `${coordinate(x)},${coordinate(y)}`).join(" ");
}

/** Straight-line distance between two points. */
function distance([ax, ay], [bx, by]) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Finds the closest other part that still has an unwired pad.
 *
 * Connecting to the nearest neighbour gives the board locality: real layouts
 * place parts near whatever they talk to, so short local runs dominate and long
 * ones are the exception.
 *
 * @param parts - Every placed part.
 * @param index - The part looking for a neighbour.
 * @returns The neighbour and its distance, or `null` when nothing is in reach.
 */
function nearestPartWithRoom(parts, index) {
  const source = parts[index];
  let best = null;
  for (let other = 0; other < parts.length; other += 1) {
    if (other === index) continue;
    const candidate = parts[other];
    if (candidate.anchors.every((anchor) => anchor.wired)) continue;
    const span = distance(source.centre, candidate.centre);
    // Beyond this a trace stops looking like a local connection and starts
    // cutting across unrelated parts of the board.
    if (span > HEIGHT / 3) continue;
    if (!best || span < best.span) best = { part: candidate, span };
  }
  return best;
}

/**
 * Routes a connection between two pads the way a layout tool would.
 *
 * The path leaves each pad along the direction that pad faces, then closes the
 * remaining distance with a single 45 degree diagonal between two straight
 * runs. Every segment is horizontal, vertical, or exactly diagonal, and a trace
 * always leaves its pad squarely. A right-angled corner in copper is an acid
 * trap, which is why no real layout contains one.
 *
 * @param from - Start anchor, as `{ point, direction }`.
 * @param to - End anchor, in the same shape.
 * @returns Polyline points, or `null` when the pads sit too close for a
 *   sensible route.
 */
function connect(from, to) {
  const escape = GRID;
  const start = [
    from.point[0] + from.direction[0] * escape,
    from.point[1] + from.direction[1] * escape,
  ];
  const end = [
    to.point[0] + to.direction[0] * escape,
    to.point[1] + to.direction[1] * escape,
  ];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  if (diagonal < GRID) return null;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const alongX = Math.abs(dx) >= Math.abs(dy);
  const run = (Math.abs(alongX ? dx : dy) - diagonal) / 2;
  const first = alongX
    ? [start[0] + stepX * run, start[1]]
    : [start[0], start[1] + stepY * run];
  const second = [
    first[0] + stepX * diagonal,
    first[1] + stepY * diagonal,
  ];
  return [from.point, start, first, second, end, to.point];
}

/**
 * Builds a short stub that leaves a pad and dies on a via, which is most of
 * what routing on a real board actually looks like.
 */
function stubRoute(random, anchor) {
  const [x, y] = anchor.point;
  const direction = anchor.direction;
  const length = pickInt(random, 2, 5) * GRID;
  const bend = pickInt(random, 1, 3) * GRID;
  const midX = x + direction[0] * length;
  const midY = y + direction[1] * length;
  // The bend turns across the run, so the stub ends beside the pad rather than
  // straight out from it, which is how a fan-out to a via actually looks.
  const across = direction[0] === 0 ? [1, 0] : [0, 1];
  const turn = pick(random, [1, -1]);
  const endX = midX + across[0] * bend * turn;
  const endY = midY + across[1] * bend * turn;
  if (endX < 0 || endY < 0 || endX > WIDTH || endY > HEIGHT) return null;
  return { points: [[x, y], [midX, midY], [endX, endY]], via: [endX, endY] };
}

/**
 * Draws an annular ring as a stroked circle rather than a filled disc with a
 * second disc on top.
 *
 * The drill has to be a real hole. Painting one in the background colour would
 * make every pad depend on what sits behind it, and the backdrop is layered
 * over two gradients, so the holes would show as dark spots wherever the
 * gradients brighten.
 *
 * @param x - Centre.
 * @param y - Centre.
 * @param outer - Radius of the copper annulus.
 * @param inner - Radius of the drill.
 */
function ring(x, y, outer, inner) {
  const radius = (outer + inner) / 2;
  const width = outer - inner;
  return `<circle cx="${coordinate(x)}" cy="${coordinate(y)}" r="${coordinate(radius)}" fill="none" stroke-width="${coordinate(width)}"/>`;
}

/** A plated through-hole, as a connector or a discrete leg would sit in. */
function throughHole(x, y) {
  return ring(x, y, 4.4, 2.1);
}

/** A via, the same idea as a through-hole but far smaller. */
function via(x, y) {
  return ring(x, y, 2.6, 1.05);
}

/** A rectangular surface-mount pad with slightly rounded corners. */
function pad(x, y, width, height) {
  return `<rect x="${coordinate(x - width / 2)}" y="${coordinate(y - height / 2)}" width="${coordinate(width)}" height="${coordinate(height)}" rx="1.2" fill="${COPPER}"/>`;
}

/**
 * Places a two-terminal surface-mount footprint, the discrete resistor or
 * capacitor that a real board carries by the hundred.
 */
function discreteFootprint(random, x, y) {
  const vertical = random() < 0.5;
  const gap = 9;
  const padWidth = vertical ? 8 : 6;
  const padHeight = vertical ? 6 : 8;
  const copper = vertical
    ? [pad(x, y - gap / 2, padWidth, padHeight), pad(x, y + gap / 2, padWidth, padHeight)]
    : [pad(x - gap / 2, y, padWidth, padHeight), pad(x + gap / 2, y, padWidth, padHeight)];
  const outlineWidth = vertical ? 13 : 20;
  const outlineHeight = vertical ? 20 : 13;
  const reference = `${pick(random, ["R", "C", "D", "L"])}${pickInt(random, 1, 48)}`;
  const silkscreen = [
    `<rect x="${coordinate(x - outlineWidth / 2)}" y="${coordinate(y - outlineHeight / 2)}" width="${outlineWidth}" height="${outlineHeight}" rx="1.5"/>`,
    `<text x="${coordinate(x + outlineWidth / 2 + 4)}" y="${coordinate(y + 4)}">${reference}</text>`,
  ];
  const anchors = vertical
    ? [
        { point: [x, y - gap / 2 - padHeight / 2], direction: [0, -1] },
        { point: [x, y + gap / 2 + padHeight / 2], direction: [0, 1] },
      ]
    : [
        { point: [x - gap / 2 - padWidth / 2, y], direction: [-1, 0] },
        { point: [x + gap / 2 + padWidth / 2, y], direction: [1, 0] },
      ];
  return { copper, silkscreen, anchors };
}

/**
 * Places a small-outline integrated-circuit footprint: two facing rows of pads,
 * an outline, a pin-one dot, and a reference.
 */
function integratedCircuitFootprint(random, x, y) {
  const perSide = pickInt(random, 3, 6);
  const pitch = 8;
  const rowGap = pickInt(random, 4, 6) * GRID;
  const padWidth = 12;
  const padHeight = 4.5;
  const copper = [];
  const anchors = [];
  const spread = (perSide - 1) * pitch;

  for (let index = 0; index < perSide; index += 1) {
    const padY = y - spread / 2 + index * pitch;
    const leftX = x - rowGap / 2;
    const rightX = x + rowGap / 2;
    copper.push(pad(leftX, padY, padWidth, padHeight));
    copper.push(pad(rightX, padY, padWidth, padHeight));
    anchors.push(
      { point: [leftX - padWidth / 2, padY], direction: [-1, 0] },
      { point: [rightX + padWidth / 2, padY], direction: [1, 0] },
    );
  }

  const bodyWidth = rowGap - padWidth;
  const bodyHeight = spread + pitch * 1.5;
  const reference = `U${pickInt(random, 1, 12)}`;
  const silkscreen = [
    `<rect x="${coordinate(x - bodyWidth / 2)}" y="${coordinate(y - bodyHeight / 2)}" width="${coordinate(bodyWidth)}" height="${coordinate(bodyHeight)}" rx="2"/>`,
    `<circle cx="${coordinate(x - bodyWidth / 2 + 4)}" cy="${coordinate(y - bodyHeight / 2 + 4)}" r="1.8"/>`,
    `<text x="${coordinate(x - bodyWidth / 2)}" y="${coordinate(y + bodyHeight / 2 + 12)}">${reference}</text>`,
  ];
  return { copper, silkscreen, anchors };
}

/**
 * Places a row of plated through-holes on the classic 0.1 inch pitch, the
 * header a board exposes for a connector.
 */
function headerFootprint(random, x, y) {
  const count = pickInt(random, 2, 6);
  const pitch = GRID;
  const vertical = random() < 0.5;
  const copper = [];
  const anchors = [];
  const spread = (count - 1) * pitch;
  const hole = 4.4;

  for (let index = 0; index < count; index += 1) {
    const along = -spread / 2 + index * pitch;
    if (vertical) {
      copper.push(throughHole(x, y + along));
      anchors.push({ point: [x - hole, y + along], direction: [-1, 0] });
    } else {
      copper.push(throughHole(x + along, y));
      anchors.push({ point: [x + along, y - hole], direction: [0, -1] });
    }
  }

  const outlineLong = spread + 12;
  const outlineShort = 12;
  const width = vertical ? outlineShort : outlineLong;
  const height = vertical ? outlineLong : outlineShort;
  const silkscreen = [
    `<rect x="${coordinate(x - width / 2)}" y="${coordinate(y - height / 2)}" width="${coordinate(width)}" height="${coordinate(height)}" rx="1.5"/>`,
    `<text x="${coordinate(x - width / 2)}" y="${coordinate(y - height / 2 - 5)}">J${pickInt(random, 1, 9)}</text>`,
  ];
  return { copper, silkscreen, anchors };
}

/**
 * The compliance marks a real board carries next to its identity block.
 *
 * `CE`, `FCC`, and `RoHS` are set as text, which is what a board does when
 * space is tight and is honest here, since a redrawn logo would only be a worse
 * copy of a letterform. The crossed-out wheelie bin has no textual equivalent,
 * so it is drawn.
 *
 * These are regulatory marks on a real product. Here they are part of a
 * stylised backdrop and declare nothing about anything.
 *
 * @param x - Left edge of the row.
 * @param y - Baseline the marks sit on.
 * @param scale - Multiplier applied to the whole row.
 * @returns Silkscreen elements.
 */
function complianceMarks(x, y, height, marks) {
  const elements = [];
  const gap = height * 0.42;
  let cursor = x;

  /**
   * Stamps a sourced logo at the row height, scaled from its own viewBox.
   *
   * @param logo - Entry from `scripts/compliance-marks.json`.
   * @returns The width it consumed.
   */
  const stamp = (logo) => {
    const [, , boxWidth, boxHeight] = logo.viewBox;
    const scale = height / boxHeight;
    const inner = logo.paths
      .map(
        (path) =>
          `<path d="${path}"${logo.transform ? ` transform="${logo.transform}"` : ""}${logo.fillRule ? ` fill-rule="${logo.fillRule}"` : ""}/>`,
      )
      .join("");
    elements.push(
      `<g transform="translate(${coordinate(cursor)} ${coordinate(y - height)}) scale(${coordinate(scale)})" fill="${SILKSCREEN}" stroke="none">${inner}</g>`,
    );
    return boxWidth * scale;
  };

  // The crossed-out wheeled bin from Directive 2012/19/EU Annex IX: a bin with
  // a solid bar beneath it. Constructed here rather than sourced, because the
  // only vectorisation available carries a cross through the bin, which is
  // IEC 60417-6414 and a different symbol.
  const binWidth = height * 0.62;
  const lid = height * 0.13;
  const bar = height * 0.14;
  const top = y - height;
  const bodyTop = top + lid * 1.7;
  const bodyDepth = height - lid * 1.7 - bar * 1.6;
  elements.push(
    `<path d="M${coordinate(cursor + binWidth * 0.3)},${coordinate(top)} h${coordinate(binWidth * 0.4)} v${coordinate(lid * 0.62)} h${coordinate(binWidth * 0.3)} v${coordinate(lid * 0.55)} h${coordinate(-binWidth)} v${coordinate(-lid * 0.55)} h${coordinate(binWidth * 0.3)} Z" fill="${SILKSCREEN}" stroke="none"/>`,
    `<path d="M${coordinate(cursor + binWidth * 0.08)},${coordinate(bodyTop)} l${coordinate(binWidth * 0.1)},${coordinate(bodyDepth)} h${coordinate(binWidth * 0.64)} l${coordinate(binWidth * 0.1)},${coordinate(-bodyDepth)} Z" fill="${SILKSCREEN}" stroke="none"/>`,
    `<path d="M${coordinate(cursor - binWidth * 0.1)},${coordinate(y)} h${coordinate(binWidth * 1.2)} v${coordinate(-bar)} h${coordinate(-binWidth * 1.2)} Z" fill="${SILKSCREEN}" stroke="none"/>`,
  );
  cursor += binWidth + gap;

  cursor += stamp(marks.ce) + gap;
  cursor += stamp(marks.fcc) + gap;

  // RoHS has no official pictogram. What boards actually carry is a tick beside
  // the wording in a rounded frame, an arrangement generic enough to draw here
  // rather than take from a stock asset, which would drag a licence and an
  // attribution requirement along with it.
  const frameHeight = height;
  const tickCell = frameHeight * 0.92;
  const frameWidth = tickCell + frameHeight * 2.5;
  const frameTop = y - frameHeight;
  const stroke = frameHeight * 0.09;
  const radius = frameHeight * 0.16;
  const divider = cursor + tickCell;
  elements.push(
    `<rect x="${coordinate(cursor)}" y="${coordinate(frameTop)}" width="${coordinate(frameWidth)}" height="${coordinate(frameHeight)}" rx="${coordinate(radius)}" fill="none" stroke-width="${coordinate(stroke)}"/>`,
    `<path d="M${coordinate(divider)},${coordinate(frameTop)} v${coordinate(frameHeight)}" fill="none" stroke-width="${coordinate(stroke)}"/>`,
    `<path d="M${coordinate(cursor + tickCell * 0.24)},${coordinate(frameTop + frameHeight * 0.54)} l${coordinate(tickCell * 0.2)},${coordinate(frameHeight * 0.22)} l${coordinate(tickCell * 0.34)},${coordinate(-frameHeight * 0.42)}" fill="none" stroke-width="${coordinate(stroke * 1.5)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<text x="${coordinate(divider + frameHeight * 0.22)}" y="${coordinate(frameTop + frameHeight * 0.56)}" font-size="${coordinate(frameHeight * 0.46)}" letter-spacing="0" font-weight="700">RoHS</text>`,
    `<text x="${coordinate(divider + frameHeight * 0.22)}" y="${coordinate(frameTop + frameHeight * 0.88)}" font-size="${coordinate(frameHeight * 0.26)}" letter-spacing="0.3" font-weight="600">COMPLIANT</text>`,
  );
  return elements;
}

/**
 * The identity block: the board's name in the Velvet wordmark, its revision,
 * and the small print a manufacturer stamps beside it.
 *
 * The wordmark is a path rather than text in the Plaster face, because an SVG
 * used as a CSS background renders in isolation and never resolves the page's
 * web fonts. Outlines are the only way it looks like the real logo.
 *
 * A board carries exactly one of these.
 *
 * @param random - Deterministic source.
 * @param x - Left edge.
 * @param y - Wordmark baseline.
 * @param version - The Velvet version to print as the revision.
 * @param wordmark - Path data and metrics for the wordmark.
 * @param marks - Sourced compliance logos.
 * @param year - Year printed in the copyright line.
 * @returns Silkscreen elements, keyed by whether they belong to the wordmark.
 */
function identityBlock(random, x, y, version, wordmark, marks, year) {
  const blockWidth = 292;
  const scale = blockWidth / wordmark.advanceWidth;
  const revision = `STATUS BOARD REV ${version}`;
  // A monospace advance is close to 0.6em, so this lands near the natural size
  // for the width. `textLength` then makes the fit exact, which is what keeps
  // the two flush even though the system monospace face is unknown here.
  const revisionSize = blockWidth / (revision.length * 0.6);
  const lot = `LOT ${pickInt(random, 2100, 2699)}   PNL ${pickInt(random, 1, 8)}/${pickInt(random, 8, 24)}`;
  const origin = `Copyright © ${year} LAYERED, Made in Austria`;
  const smallSize = 11;
  const revisionY = revisionSize * 1.15;
  // Only the revision line is justified, so it ends flush with the wordmark
  // above it. Forcing a width on the smaller lines spaced their letters out
  // until they were unreadable, which is what `lengthAdjust="spacing"` does when
  // the target is wider than the text.
  const line = (label, offsetY, size) =>
    `<text x="${coordinate(x)}" y="${coordinate(y + offsetY)}" font-size="${coordinate(size)}">${label}</text>`;
  return {
    wordmark: `<path d="${wordmark.path}" transform="translate(${coordinate(x)} ${coordinate(y)}) scale(${coordinate(scale)})" fill="${SILKSCREEN}" stroke="none"/>`,
    silkscreen: [
      `<text x="${coordinate(x)}" y="${coordinate(y + revisionY)}" font-size="${coordinate(revisionSize)}" letter-spacing="0" textLength="${coordinate(blockWidth)}" lengthAdjust="spacing">${revision}</text>`,
      line(lot, revisionY + 20, smallSize),
      line(origin, revisionY + 36, smallSize),
      ...complianceMarks(x, y + revisionY + 74, 20, marks),
    ],
  };
}

/**
 * Assembles the board.
 *
 * @param seed - Seed for the deterministic layout.
 * @param opacity - Per-layer opacities to render with.
 * @param version - Velvet version printed in the identity block.
 * @param wordmark - Path data and metrics for the wordmark.
 * @param marks - Sourced compliance logos.
 * @param year - Year printed in the copyright line.
 * @returns The SVG document as a string.
 */
function buildBoard(seed, opacity, version, wordmark, marks, year) {
  const random = createRandom(seed);
  const traces = [];
  const copper = [];
  const silkscreen = [];
  const occupied = [];

  /** Keeps footprints from landing on top of each other. */
  const fits = (x, y, radius) =>
    occupied.every(
      ([otherX, otherY, otherRadius]) =>
        Math.hypot(x - otherX, y - otherY) > radius + otherRadius + GRID,
    );

  // The identity block claims its area before any component is placed, the way
  // a board reserves a keep-out for its markings. Fitting it afterwards never
  // works, because at this density no gap that large is left.
  const identityWidth = 300;
  const identityHeight = 150;
  const identityX = snap(
    MARGIN + 24 + random() * (WIDTH - MARGIN * 2 - identityWidth - 48),
  );
  const identityY = snap(
    MARGIN + 80 + random() * (HEIGHT - MARGIN * 2 - identityHeight - 80),
  );
  const identity = identityBlock(random, identityX, identityY, version, wordmark, marks, year);
  silkscreen.push(...identity.silkscreen);
  occupied.push([
    identityX + identityWidth / 2,
    identityY + identityHeight / 2 - 60,
    Math.max(identityWidth, identityHeight) * 0.62,
  ]);

  const megapixels = (WIDTH * HEIGHT) / 1_000_000;
  const featureCount = (density) => Math.round(density * megapixels);

  // Footprints, largest first so the bigger parts get the room they need.
  const placements = [
    {
      build: integratedCircuitFootprint,
      kind: "circuit",
      target: featureCount(DENSITY_PER_MEGAPIXEL.integratedCircuits),
      radius: 34,
    },
    {
      build: headerFootprint,
      kind: "header",
      target: featureCount(DENSITY_PER_MEGAPIXEL.headers),
      radius: 26,
    },
    {
      build: discreteFootprint,
      kind: "discrete",
      target: featureCount(DENSITY_PER_MEGAPIXEL.discretes),
      radius: 14,
    },
  ];
  const parts = [];
  for (const { build, kind, target, radius } of placements) {
    let placed = 0;
    let attempts = 0;
    // Rejection sampling needs headroom proportional to the target, otherwise a
    // larger board silently ends up sparser than the density asks for.
    const attemptBudget = target * 60;
    while (placed < target && attempts < attemptBudget) {
      attempts += 1;
      const x = snap(MARGIN + random() * (WIDTH - MARGIN * 2));
      const y = snap(MARGIN + random() * (HEIGHT - MARGIN * 2));
      if (!fits(x, y, radius)) continue;
      const footprint = build(random, x, y);
      copper.push(...footprint.copper);
      silkscreen.push(...footprint.silkscreen);
      occupied.push([x, y, radius]);
      placed += 1;
      parts.push({
        kind,
        centre: [x, y],
        anchors: footprint.anchors.map((anchor) => ({ ...anchor, wired: false })),
      });
    }
  }

  // Wire the board up. Every trace from here on joins two pads that exist.
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const free = part.anchors.filter((anchor) => !anchor.wired);
    if (free.length === 0) continue;

    const neighbour = nearestPartWithRoom(parts, index);
    if (!neighbour) continue;

    // Two integrated circuits facing each other carry a bundle rather than a
    // single line, since that is what an address or data bus looks like.
    const bundle =
      part.kind === "circuit" && neighbour.part.kind === "circuit"
        ? pickInt(random, 2, 4)
        : 1;
    const sortedSources = [...free].sort(
      (left, right) =>
        distance(left.point, neighbour.part.centre) -
        distance(right.point, neighbour.part.centre),
    );
    const sortedTargets = neighbour.part.anchors
      .filter((anchor) => !anchor.wired)
      .sort(
        (left, right) =>
          distance(left.point, part.centre) - distance(right.point, part.centre),
      );

    // Copper that carries current is drawn heavier, the way a real board widens
    // a power rail against a signal.
    const width = part.kind === "header" ? pick(random, [1.6, 2.2]) : 1.1;
    for (let lane = 0; lane < bundle; lane += 1) {
      const source = sortedSources[lane];
      const destination = sortedTargets[lane];
      if (!source || !destination) break;
      const points = connect(source, destination);
      if (!points) continue;
      source.wired = true;
      destination.wired = true;
      traces.push(
        `<polyline points="${pointsAttribute(points)}" stroke-width="${width}"/>`,
      );
    }
  }

  // Whatever is left fans out to a via, which is where a signal disappears to
  // another layer. A board is full of these, and without them every pad would
  // look either fully wired or forgotten.
  for (const part of parts) {
    for (const anchor of part.anchors) {
      if (anchor.wired || random() < 0.45) continue;
      const stub = stubRoute(random, anchor);
      if (!stub) continue;
      anchor.wired = true;
      traces.push(
        `<polyline points="${pointsAttribute(stub.points)}" stroke-width="1.1"/>`,
      );
      copper.push(via(stub.via[0], stub.via[1]));
    }
  }

  // Free-standing vias, the stitching that ties ground planes together.
  const viaTarget = featureCount(DENSITY_PER_MEGAPIXEL.vias);
  for (let index = 0; index < viaTarget; index += 1) {
    const x = snap(MARGIN + random() * (WIDTH - MARGIN * 2));
    const y = snap(MARGIN + random() * (HEIGHT - MARGIN * 2));
    if (!fits(x, y, 6)) continue;
    copper.push(via(x, y));
    occupied.push([x, y, 6]);
  }

  // Silkscreen legends label what a pad is, so they sit beside a part rather
  // than floating in open space.
  const legends = ["GND", "3V3", "5V", "VIN", "TP1", "TP2", "SDA", "SCL", "RX", "TX", "RST", "SWD"];
  const labelled = parts.filter(() => random() < 0.3);
  for (const [index, legend] of legends.entries()) {
    const part = labelled[index];
    if (!part) break;
    silkscreen.push(
      `<text x="${coordinate(part.centre[0] + 16)}" y="${coordinate(part.centre[1] - 14)}">${legend}</text>`,
    );
  }

  const withTextFill = (element) =>
    element.startsWith("<text")
      ? element.replace("<text", `<text fill="${SILKSCREEN}" stroke="none"`)
      : element;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid slice">
  <g fill="none" stroke="${COPPER}" stroke-opacity="${opacity.trace}" stroke-linecap="round" stroke-linejoin="round">
    ${traces.join("\n    ")}
  </g>
  <g fill="${COPPER}" fill-opacity="${opacity.copperFeature}" stroke="${COPPER}" stroke-opacity="${opacity.copperFeature}">
    ${copper.join("\n    ")}
  </g>
  <g fill="none" stroke="${SILKSCREEN}" stroke-opacity="${opacity.silkscreen}" fill-opacity="${opacity.silkscreen}" stroke-width="0.8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9" letter-spacing="0.4">
    ${silkscreen.map(withTextFill).join("\n    ")}
  </g>
  <g fill="${SILKSCREEN}" fill-opacity="${opacity.wordmark}">
    ${identity.wordmark}
  </g>
</svg>
`;
}

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * Reads the Velvet version the identity block prints.
 *
 * It comes from the generated release artefact, the one place that knows which
 * version installations receive, so the silkscreen cannot claim a revision that
 * was never released. Regenerating the backdrop after a release keeps it
 * current.
 *
 * @returns The version, or `null` when the artefact cannot be read.
 */
async function releaseVersion() {
  try {
    const source = await readFile(
      resolve(
        import.meta.dirname,
        "../apps/setup-service/src/velvet-release.generated.ts",
      ),
      "utf8",
    );
    return source.match(/^\/\/ Velvet (\d+\.\d+\.\d+) from /mu)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Loads a data file that sits beside this script.
 *
 * The wordmark outlines and the sourced compliance logos are kept as data
 * rather than derived here, so producing the backdrop needs no font tooling and
 * no network. Each file records where its artwork came from and under what
 * terms.
 */
async function loadJson(name) {
  return JSON.parse(
    await readFile(resolve(import.meta.dirname, name), "utf8"),
  );
}

const contrast = process.argv.includes("--contrast");
const seed = Number(argument("seed", "20260801"));
if (!Number.isInteger(seed)) {
  console.error("--seed must be an integer.");
  process.exit(1);
}
const outputPath = resolve(
  process.cwd(),
  argument(
    "out",
    contrast
      ? "site/src/onboarding/pcb-backdrop.contrast.svg"
      : "site/src/onboarding/pcb-backdrop.svg",
  ),
);
/**
 * Year printed in the copyright line.
 *
 * Defaults to the current one, which means regenerating in a later year changes
 * the output. Passing it explicitly reproduces an earlier board exactly, which
 * is what the seed alone otherwise guarantees.
 */
const year = Number(argument("year", String(new Date().getFullYear())));
if (!Number.isInteger(year) || year < 2000 || year > 2999) {
  console.error("--year must be a four-digit year.");
  process.exit(1);
}
const version = argument("release", await releaseVersion());
if (!version) {
  console.error(
    "Could not read the release version. Pass --release <semver> to set it.",
  );
  process.exit(1);
}

const svg = buildBoard(
  seed,
  contrast ? CONTRAST_OPACITY : SHIPPED_OPACITY,
  version,
  await loadJson("velvet-wordmark.json"),
  await loadJson("compliance-marks.json"),
  year,
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");
console.log(
  `Wrote a ${WIDTH}x${HEIGHT} board for Velvet ${version} from seed ${seed} to ${outputPath}${contrast ? " (contrast preview)" : ""}.`,
);

/**
 * Draws the brushing on a Retro Chassis faceplate as a tile that repeats seamlessly.
 *
 * A plate drawn across a wheel carries scratches that run in one direction and
 * are unrelated across it, so the tile is noise that is smeared along x and
 * left alone along y. Two things make it read as metal rather than as static:
 * the smear runs over seventeen pixels, which turns points into strokes, and
 * the strength is low enough that no single scratch is a mark on the plate.
 *
 * The tile carries no colour of its own. It is white where a scratch stands
 * proud and black where it is cut, both at a low alpha, so the plate's colour
 * stays where the design states it and this only modulates it.
 *
 * Seamless in both directions. Along x the smear is circular, so the last
 * pixel is filtered against the first. Along y the rows are independent, which
 * is what brushing is, so nothing has to be matched at all.
 *
 * Deterministic: the noise comes from a stated seed, so running it twice
 * produces the same file and the repository does not churn.
 *
 * Run it after changing any figure here:
 *
 * ```bash
 * bun run --cwd site plate:render
 * ```
 */

import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(siteRoot, "bundles/retro-chassis/assets/plate.png");

/** How large the tile is. Square, and a power of two, so it scales cleanly. */
const SIZE = 256;

/** How far a point of noise is smeared along the brushing, in pixels. */
const SMEAR = 17;

/** The strongest a scratch may be, as an alpha. */
const STRENGTH = 0.06;

/** Where the noise comes from, so two runs agree. */
const SEED = 0x5eed_1979;

/**
 * A small deterministic source of numbers between 0 and 1.
 *
 * @param seed - The state to start from.
 * @returns A function returning the next number in the sequence.
 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Smears one row of noise along itself, wrapping at both ends.
 *
 * A plain average over a window is enough: it turns single points into strokes
 * of about the window's length, which is what a wheel leaves behind.
 *
 * @param row - The noise, one value per pixel.
 * @param window - How many pixels each output value averages over.
 * @returns The smeared row, the same length as the input.
 */
function smear(row: Float64Array, window: number): Float64Array {
  const out = new Float64Array(row.length);
  const half = Math.floor(window / 2);
  for (let x = 0; x < row.length; x += 1) {
    let total = 0;
    for (let k = -half; k <= half; k += 1) {
      total += row[(x + k + row.length) % row.length]!;
    }
    out[x] = total / window;
  }
  return out;
}

/**
 * Builds the tile's pixels.
 *
 * @returns RGBA bytes, row-major.
 */
function render(): Uint8Array {
  const next = random(SEED);
  const pixels = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    const raw = new Float64Array(SIZE);
    for (let x = 0; x < SIZE; x += 1) raw[x] = next() - 0.5;
    const line = smear(raw, SMEAR);
    // The smear flattens the signal, so it is brought back to a usable range
    // rather than left as the faint thing an average over that window is.
    let peak = 0;
    for (const value of line) peak = Math.max(peak, Math.abs(value));
    const gain = peak > 0 ? 1 / peak : 0;
    // Every row is scratched as hard as every other. A slow wave across them
    // bands the plate, and a band is what the eye finds when the tile repeats.

    for (let x = 0; x < SIZE; x += 1) {
      const value = line[x]! * gain;
      const index = (y * SIZE + x) * 4;
      const lit = value > 0;
      pixels[index] = lit ? 255 : 0;
      pixels[index + 1] = lit ? 246 : 0;
      pixels[index + 2] = lit ? 226 : 0;
      pixels[index + 3] = Math.round(Math.min(1, Math.abs(value)) * STRENGTH * 255);
    }
  }
  return pixels;
}

/**
 * Writes RGBA pixels as a PNG.
 *
 * The format is a header, one zlib stream of filtered rows, and an end marker.
 *
 * @param pixels - The RGBA buffer, row-major.
 * @param size - The width and height in pixels.
 * @returns The encoded PNG.
 */
function encodePng(pixels: Uint8Array, size: number): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }

  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const png = encodePng(render(), SIZE);
await writeFile(output, png);
console.log(`plate.png: ${SIZE}x${SIZE}, ${png.length} bytes`);

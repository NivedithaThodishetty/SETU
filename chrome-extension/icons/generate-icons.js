/**
 * Icon generator — `node icons/generate-icons.js`
 *
 * Renders the SETU bridge mark (the same path the popup draws in SVG) into the
 * PNG sizes Chrome asks for. Written against zlib alone so the extension has no
 * build dependency at all: `npm install` is not a step anyone has to remember
 * before loading it.
 *
 * The previous icons were a flat indigo disc left over from an earlier palette,
 * on an opaque navy square — wrong colour, wrong shape, and no transparency, so
 * they sat in a dark box on every toolbar.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

const ACCENT = [0, 136, 176];   // #0088b0 — SETU accent
const INK = [255, 255, 255];    // the mark itself
const SUPERSAMPLE = 4;          // rendered at 4x and box-filtered down

/** The mark, in the same 24x24 space as the SVG in popup.html. */
const VIEWBOX = 24;
const CURVES = [
  // M3 17 c3,-6 6,-9 9,-9   → the left span rising to the keystone
  [[3, 17], [6, 11], [9, 8], [12, 8]],
  // s6,3 9,9                → the right span falling away
  [[12, 8], [15, 8], [18, 11], [21, 17]]
];
const STROKE_RADIUS = 1.1;      // half of the SVG's 2.2 stroke-width
const KEYSTONE = { x: 12, y: 8, r: 1.6 };
const CORNER_RADIUS = 0.18;     // fraction of the icon's width

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/** Densely sample the curves once; distance queries then become a point scan. */
function sampleCurves(steps = 220) {
  const points = [];
  for (const [p0, p1, p2, p3] of CURVES) {
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      points.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
  }
  return points;
}

const CURVE_POINTS = sampleCurves();

/** Distance from a point to the stroked path, in viewBox units. */
function distanceToMark(x, y) {
  let best = Infinity;
  for (const [px, py] of CURVE_POINTS) {
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}

/** Signed-distance test for a rounded square covering the whole canvas. */
function insideRoundedSquare(x, y, size, radius) {
  const dx = Math.abs(x - size / 2) - (size / 2 - radius);
  const dy = Math.abs(y - size / 2) - (size / 2 - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside <= radius + 0.0001 || (dx <= 0 && dy <= 0);
}

/* -------------------------------------------------------------------------- */
/* Rasteriser                                                                 */
/* -------------------------------------------------------------------------- */

/** Render one icon as raw RGBA rows, anti-aliased by supersampling. */
function renderRGBA(size) {
  const big = size * SUPERSAMPLE;
  const scale = big / VIEWBOX;
  const cornerRadius = big * CORNER_RADIUS;
  const strokeRadius = STROKE_RADIUS * scale;
  const keystoneRadius = KEYSTONE.r * scale;
  const keystoneX = KEYSTONE.x * scale;
  const keystoneY = KEYSTONE.y * scale;

  // Accumulate coverage at 4x, then average each SUPERSAMPLE x SUPERSAMPLE
  // block down into one output pixel.
  const coverage = new Float32Array(size * size * 2); // [tileAlpha, markAlpha]

  for (let by = 0; by < big; by += 1) {
    const y = by + 0.5;
    for (let bx = 0; bx < big; bx += 1) {
      const x = bx + 0.5;
      if (!insideRoundedSquare(x, y, big, cornerRadius)) continue;

      const outIndex = (Math.floor(by / SUPERSAMPLE) * size + Math.floor(bx / SUPERSAMPLE)) * 2;
      coverage[outIndex] += 1;

      const onCurve = distanceToMark(x / scale, y / scale) * scale <= strokeRadius;
      const onKeystone = Math.hypot(x - keystoneX, y - keystoneY) <= keystoneRadius;
      if (onCurve || onKeystone) coverage[outIndex + 1] += 1;
    }
  }

  const samplesPerPixel = SUPERSAMPLE * SUPERSAMPLE;
  const rows = [];

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // PNG filter type: none
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 2;
      const tile = coverage[index] / samplesPerPixel;
      const mark = coverage[index + 1] / samplesPerPixel;

      const offset = 1 + x * 4;
      if (tile <= 0) {
        row[offset] = row[offset + 1] = row[offset + 2] = row[offset + 3] = 0;
        continue;
      }

      // Blend the white mark over the accent tile, then apply tile coverage as
      // the alpha so the rounded corners fade cleanly into transparency.
      const blend = Math.min(1, mark / tile);
      for (let channel = 0; channel < 3; channel += 1) {
        row[offset + channel] = Math.round(ACCENT[channel] * (1 - blend) + INK[channel] * blend);
      }
      row[offset + 3] = Math.round(tile * 255);
    }
    rows.push(row);
  }

  return Buffer.concat(rows);
}

/* -------------------------------------------------------------------------- */
/* PNG encoder                                                                */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, raw) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // default filter
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------------------------- */

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const file = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(file, encodePng(size, renderRGBA(size)));
  console.log(`wrote icon${size}.png`);
}
console.log(`Generated ${sizes.length} icons.`);

// Vygeneruje ikony aplikace (PWA + apple-touch) přímo z kódu – žádný grafický
// program, žádná závislost. `npm run icons` po změně vzhledu koule.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'icons');

const BG = [5, 7, 12];
const WARM = [255, 215, 163];
const HOT = [255, 251, 242];

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Koule světla: tvrdší jádro + měkké halo, ať to sedí s tím, co je na webu. */
function renderIcon(size, coreScale) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const coreRadius = size * coreScale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - center, y - center) / coreRadius;

      const core = 1 - smoothstep(0.62, 1.04, d);
      const halo = Math.exp(-d * d * 0.85) * 0.9;

      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const lit = BG[c] + (WARM[c] - BG[c]) * halo;
        pixels[i + c] = Math.min(255, Math.round(lit + (HOT[c] - lit) * core));
      }
      pixels[i + 3] = 255;
    }
  }

  return encodePng(size, size, pixels);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filtr "none"
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// maskable má menší kouli – Android si z ikony ukrajuje okraje
const icons = [
  ['icon-192.png', 192, 0.3],
  ['icon-512.png', 512, 0.3],
  ['icon-512-maskable.png', 512, 0.21],
  ['apple-touch-icon-180.png', 180, 0.3],
];

mkdirSync(OUT, { recursive: true });

for (const [name, size, coreScale] of icons) {
  const png = renderIcon(size, coreScale);
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(26)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

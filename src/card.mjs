// card.mjs — THE CARD: an organism travels as a picture. A sealed genome written into the pixels of a PNG.
//
// Build-order step 5 (the vessel half). A card is an ordinary 256 × 256 PNG anyone can look at, post or send. The top
// four rows are the payload band: the genome's bytes laid into the red, green and blue of each pixel, after a magic
// 'LS1' and a two-byte length. The rest is the card's face — a symmetric pattern drawn from the genome's id, so two
// genomes look different and the same genome always looks the same. The payload is in the pixels, not in a text chunk,
// so a host that strips metadata cannot strip the seed.
//
// Writing is deterministic everywhere: the image data is stored with uncompressed deflate blocks, so the same genome
// makes the same card, byte for byte, in a browser or on CI. Reading accepts any valid PNG of the right shape — a card
// re-compressed by an image editor still opens — using the platform's own inflate (DecompressionStream). Reading is
// verify-before-parse twice over: every chunk's CRC must check before the pixels are read, and the genome found in them
// is opened under its own Ed25519 seal before anything grows from it.
//
// The chunk discipline (signature, CRC-32 per chunk, IHDR first, IEND last) follows spore-card (sjgant80-hub/spore-card),
// re-made here over Uint8Array so it runs in the browser. Powered by the Konomi architecture, created by Thomas Frumkin.
import { open } from './genome.mjs';
import { sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';

export const SIZE = 256, BAND = 4, MAGIC = [0x4c, 0x53, 0x31];   // 'LS1'
export const CAPACITY = SIZE * BAND * 3 - 5;                      // bytes of genome the band can carry
export const MAX_CARD = 1 << 21;                                  // 2 MB: no real card is near it
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const no = (why) => ({ ok: false, why });

const CRC = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
/** CRC-32 (IEEE), PNG's chunk checksum. */
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** Adler-32, zlib's stream checksum. */
export function adler32(bytes) { let a = 1, b = 0; for (const x of bytes) { a = (a + x) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/** Join byte arrays. */
export function cat(parts) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  parts.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0);
  return out;
}
function chunk(type, data) {
  const body = cat([new Uint8Array(ascii(type)), data]);
  return cat([new Uint8Array(u32(data.length)), body, new Uint8Array(u32(crc32(body)))]);
}

/** A zlib stream of uncompressed (stored) deflate blocks — deterministic, readable by any inflater. */
export function zlibStored(raw) {
  const parts = [new Uint8Array([0x78, 0x01])];
  let at = 0;
  do {
    const part = raw.subarray(at, at + 65535), last = at + 65535 >= raw.length;
    parts.push(new Uint8Array([last ? 1 : 0, part.length & 255, part.length >>> 8, ~part.length & 255, (~part.length >>> 8) & 255]), part);
    at += 65535;
  } while (at < raw.length);
  parts.push(new Uint8Array(u32(adler32(raw))));
  return cat(parts);
}

/** The card's pixels for a genome: the payload band, then the face. → Uint8Array of SIZE × SIZE × 3, or null if too long */
export function pixelsOf(genomeText) {
  const bytes = utf8(genomeText);
  if (bytes.length > CAPACITY) return null;
  const px = new Uint8Array(SIZE * SIZE * 3);
  px.set([...MAGIC, bytes.length >>> 8, bytes.length & 255, ...bytes], 0);
  // the face: an 8 × 8 pattern mirrored left to right, two colours, all from the genome's hash
  const h = sha256Hex(genomeText), hex = (i) => parseInt(h.slice(i, i + 2), 16);
  const fg = [hex(0), hex(2), hex(4)], bg = [255 - (hex(0) >> 2), 255 - (hex(2) >> 2), 255 - (hex(4) >> 2)];
  const cell = (SIZE - BAND) / 8;   // 31.5 → rows map by floor
  for (let y = BAND; y < SIZE; y++) {
    const cy = Math.min(7, Math.floor((y - BAND) / cell));
    for (let x = 0; x < SIZE; x++) {
      const cx = Math.floor(x / (SIZE / 8)), mx = cx < 4 ? cx : 7 - cx;
      const on = (parseInt(h[(cy * 4 + mx) % 64], 16) & 1) === 1;
      px.set(on ? fg : bg, (y * SIZE + x) * 3);
    }
  }
  return px;
}

/** A card for a sealed genome. → { ok, png: Uint8Array } | a refusal. Deterministic. */
export async function cardOf(genomeText) {
  const g = await open(genomeText);
  if (!g.ok) return no('only a genome that opens becomes a card: ' + g.why);
  const px = pixelsOf(genomeText);
  if (!px) return no('the genome is too long for a card');
  const raw = new Uint8Array(SIZE * (1 + SIZE * 3));
  for (let y = 0; y < SIZE; y++) raw.set(px.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), y * (1 + SIZE * 3) + 1);   // filter 0 per row
  const ihdr = new Uint8Array([...u32(SIZE), ...u32(SIZE), 8, 2, 0, 0, 0]);
  return { ok: true, png: cat([new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))]) };
}

async function inflate(z) {
  const s = new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Undo PNG's per-row filters (types 0–4) for 8-bit RGB: w × h pixels, each row led by its filter byte. Throws on an
 *  unknown filter (readCard turns that into a refusal). */
export function unfilter(raw, w, h) {
  const bpp = 3, stride = w * bpp, out = new Uint8Array(stride * h);
  for (const y of Array.from({ length: h }, (_, k) => k)) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    row.forEach((v, i) => {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = y && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= Math.min(pb, pc) ? a : pb <= pc ? b : c) : -1;   // Paeth: nearest of left, up, up-left; ties in that order
      if (pred < 0) throw new Error('filter');
      out[y * stride + i] = (v + pred) & 255;
    });
  }
  return out;
}

/**
 * Read a card: CRCs first, then the pixels, then the genome inside under its own seal. opts.trust: maker keys this
 * device accepts. → { ok, genome (text), id, fields } | a refusal naming what failed.
 */
export async function readCard(bytes, opts = {}) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_CARD) return no('not a card');
    if (bytes.length < 8 || SIG.some((b, i) => bytes[i] !== b)) return no('not a PNG');
    const chunks = [];
    for (let at = 8; at < bytes.length;) {
      const len = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
      if (at + 12 + len > bytes.length) return no('the PNG is cut short');
      const body = bytes.subarray(at + 4, at + 8 + len), crc = ((bytes[at + 8 + len] << 24) | (bytes[at + 9 + len] << 16) | (bytes[at + 10 + len] << 8) | bytes[at + 11 + len]) >>> 0;
      if (crc32(body) !== crc) return no('a chunk of the PNG is damaged');
      chunks.push({ type: String.fromCharCode(...body.subarray(0, 4)), data: body.subarray(4) });
      at += 12 + len;
      if (chunks[chunks.length - 1].type === 'IEND') break;
    }
    if (!chunks.length || chunks[0].type !== 'IHDR' || chunks[chunks.length - 1].type !== 'IEND') return no('the PNG is not whole');
    const d = chunks[0].data, w = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0, h = ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]) >>> 0;
    if (w !== SIZE || h !== SIZE || d[8] !== 8 || d[9] !== 2 || d[12] !== 0) return no('not a living-seed card (it is not a 256 × 256 RGB picture)');
    const idat = chunks.filter((c) => c.type === 'IDAT'), z = new Uint8Array(idat.reduce((a, c) => a + c.data.length, 0));
    idat.reduce((at, c) => { z.set(c.data, at); return at + c.data.length; }, 0);
    let raw;
    try { raw = await inflate(z); } catch { return no('the picture data does not decompress'); }
    if (raw.length !== SIZE * (1 + SIZE * 3)) return no('the picture data is the wrong size');
    const px = unfilter(raw, SIZE, SIZE);
    if (MAGIC.some((b, i) => px[i] !== b)) return no('not a living-seed card (no seed in its pixels)');
    const n = (px[3] << 8) | px[4];
    if (n > CAPACITY) return no('not a living-seed card (no seed in its pixels)');
    const genome = new TextDecoder('utf-8', { fatal: true }).decode(px.subarray(5, 5 + n));
    const g = await open(genome, opts);
    if (!g.ok) return no('the genome in the card was refused: ' + g.why);
    // what you see is what you carry: the whole picture must be the one this genome draws
    const want = pixelsOf(genome);
    if (!want || want.some((b, i) => px[i] !== b)) return no('the card’s picture does not match the seed it carries');
    return { ok: true, genome, id: g.id, fields: g.fields };
  } catch { return no('not a card'); }
}

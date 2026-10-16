import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import * as C from '../src/card.mjs';
import { seal } from '../src/genome.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const run = JSON.parse(readFileSync(new URL('../data/seed-library-run.json', import.meta.url), 'utf8'));
const MAKER = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin'))), OTHER = await fromSeed(sha256Bytes(utf8('living-seed/maker/other')));
const ORIGIN = await seal({ name: 'origin', organs: run.library.seeds.map((s) => s.seed) }, MAKER);
const CARD = (await C.cardOf(ORIGIN.text)).png;

// a PNG assembled from parts, with the chunk CRCs computed — how a forger re-wraps a card
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => { const body = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat([...data])); return [...u32(data.length), ...body, ...u32(C.crc32(body))]; };
const png = (ihdr, idat, extra = []) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...extra, ...chunk('IDAT', idat), ...chunk('IEND', [])]);
const IHDR = [...u32(256), ...u32(256), 8, 2, 0, 0, 0];
function rawOf(px, filter = () => 0) {
  // rows with a chosen PNG filter applied (so the reader's un-filtering is exercised)
  const stride = 256 * 3, raw = new Uint8Array(256 * (stride + 1));
  for (let y = 0; y < 256; y++) {
    const f = filter(y); raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const at = y * stride + i, a = i >= 3 ? px[at - 3] : 0, b = y ? px[at - stride] : 0, c = y && i >= 3 ? px[at - stride - 3] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[y * (stride + 1) + 1 + i] = (px[at] - pred) & 255;
    }
  }
  return raw;
}

test('checksums are the published ones', () => {
  assert.equal(C.crc32(utf8('123456789')), 0xcbf43926);
  assert.equal(C.crc32(new Uint8Array(0)), 0);
  assert.equal(C.adler32(utf8('Wikipedia')), 0x11e60398);
  assert.equal(C.adler32(new Uint8Array(0)), 1);
  for (const n of [0, 1, 65535, 65536, 140000]) {
    const raw = Uint8Array.from({ length: n }, (_, i) => (i * 7) & 255);
    assert.deepEqual(new Uint8Array(inflateSync(C.zlibStored(raw))), raw, 'a real inflater reads the stored stream: ' + n);
  }
  assert.deepEqual(C.cat([new Uint8Array([1, 2]), new Uint8Array(0), new Uint8Array([3])]), new Uint8Array([1, 2, 3]));
});

test('a card carries the genome in its pixels, the same card every time', async () => {
  assert.equal(CARD.length, 196947);
  assert.deepEqual((await C.cardOf(ORIGIN.text)).png, CARD, 'deterministic');
  const r = await C.readCard(CARD);
  assert.deepEqual([r.ok, r.genome, r.id, r.fields.name], [true, ORIGIN.text, ORIGIN.id, 'origin']);
  const px = C.pixelsOf(ORIGIN.text);
  assert.equal(px.length, 256 * 256 * 3);
  assert.deepEqual([...px.subarray(0, 5)], [0x4c, 0x53, 0x31, utf8(ORIGIN.text).length >> 8, utf8(ORIGIN.text).length & 255]);
  // the face, pinned for the origin genome: its two colours at five places
  const at = (x, y) => [...px.subarray((y * 256 + x) * 3, (y * 256 + x) * 3 + 3)];
  assert.deepEqual([at(0, 4), at(40, 40), at(100, 150), at(127, 250), at(200, 100)], [[51, 25, 51], [51, 25, 51], [243, 249, 243], [51, 25, 51], [51, 25, 51]]);
  // the face: mirrored left to right
  for (const y of [10, 100, 250]) for (const x of [0, 40, 100]) assert.deepEqual([...px.subarray((y * 256 + x) * 3, (y * 256 + x) * 3 + 3)], [...px.subarray((y * 256 + 255 - x) * 3, (y * 256 + 255 - x) * 3 + 3)], y + ',' + x);
  const other = await seal({ name: 'other', organs: run.library.seeds.slice(1).map((s) => s.seed) }, MAKER);
  assert.notDeepEqual(C.pixelsOf(other.text).subarray(256 * 3 * 10, 256 * 3 * 11), px.subarray(256 * 3 * 10, 256 * 3 * 11), 'another genome, another face');
  assert.equal(C.pixelsOf('x'.repeat(C.CAPACITY + 1)), null);
  assert.equal(C.pixelsOf('x'.repeat(C.CAPACITY)).length, 256 * 256 * 3);
  assert.deepEqual(await C.cardOf('nonsense'), { ok: false, why: 'only a genome that opens becomes a card: not a genome' });
  assert.deepEqual(await C.cardOf(ORIGIN.text.replace('gate auc=0.6', 'gate auc=0.5')), { ok: false, why: 'only a genome that opens becomes a card: signature' });
});

test('un-filtering undoes every PNG filter exactly, on pictures with many colours', () => {
  // a small random picture, filtered by the test's own encoder with each filter type, must come back byte for byte
  const w = 23, h = 17, stride = w * 3;
  let s = 12345;
  const px = Uint8Array.from({ length: stride * h }, () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s & 255; });
  const enc = (filter) => {
    const raw = new Uint8Array(h * (stride + 1));
    for (let y = 0; y < h; y++) {
      const f = filter(y); raw[y * (stride + 1)] = f;
      for (let i = 0; i < stride; i++) {
        const at = y * stride + i, a = i >= 3 ? px[at - 3] : 0, b = y ? px[at - stride] : 0, c = y && i >= 3 ? px[at - stride - 3] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        raw[y * (stride + 1) + 1 + i] = (px[at] - pred) & 255;
      }
    }
    return raw;
  };
  for (const f of [0, 1, 2, 3, 4]) assert.deepEqual(C.unfilter(enc(() => f), w, h), px, 'filter ' + f);
  assert.deepEqual(C.unfilter(enc((y) => y % 5), w, h), px, 'mixed');
  // Paeth's tie-breaks at exact ties. A 2 × 2 picture: row 0 unfiltered (up-left c, up b), row 1 Paeth-filtered with its
  // first pixel set to a; the byte read is the second pixel of row 1, whose neighbours are left a, up b, up-left c.
  const one = (a, b, c, v) => { const d = (a - c) & 255, raw = new Uint8Array([0, c, c, c, b, b, b, 4, d, d, d, v, v, v]); return C.unfilter(raw, 2, 2)[9]; };
  assert.equal(one(0, 30, 20, 5), 5, 'left and up-left tie (|p−a| = |p−c|): the left neighbour, 0');
  assert.equal(one(10, 40, 20, 5), 45, 'up and up-left tie (|p−b| = |p−c|): up, 40');
  assert.equal(one(10, 30, 30, 5), 15, 'b = c: p = a, so the left neighbour');
  assert.equal(one(200, 10, 100, 5), 105, 'p = 110: nearest is up-left, 100');
  assert.throws(() => C.unfilter(new Uint8Array([5, 0, 0, 0]), 1, 1));
  assert.deepEqual(C.unfilter(new Uint8Array(0), 0, 0), new Uint8Array(0));
});

test('a card re-compressed or re-filtered by another tool still opens', async () => {
  const px = C.pixelsOf(ORIGIN.text);
  for (const f of [0, 1, 2, 3, 4]) assert.equal((await C.readCard(png(IHDR, deflateSync(rawOf(px, () => f), { level: 9 })))).genome, ORIGIN.text, 'filter ' + f);
  assert.equal((await C.readCard(png(IHDR, deflateSync(rawOf(px, (y) => y % 5))))).genome, ORIGIN.text, 'filters mixed by row');
  // split into several IDAT chunks, with an ancillary chunk before them
  const z = deflateSync(rawOf(px)), half = z.length >> 1;
  const split = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', IHDR), ...chunk('tEXt', utf8('Comment\0hi')), ...chunk('IDAT', z.subarray(0, half)), ...chunk('IDAT', z.subarray(half)), ...chunk('IEND', [])]);
  assert.equal((await C.readCard(split)).ok, true);
  // trust lists apply to what is inside
  assert.equal((await C.readCard(CARD, { trust: [MAKER.pub] })).ok, true);
  assert.deepEqual(await C.readCard(CARD, { trust: [OTHER.pub] }), { ok: false, why: 'the genome in the card was refused: untrusted maker' });
});

test('every way a card can be wrong is refused, in plain words, never a throw', async () => {
  const why = async (b) => (await C.readCard(b)).why;
  for (const b of [null, 'x', [1, 2], new Uint8Array(C.MAX_CARD + 1)]) assert.equal(await why(b), 'not a card');
  assert.equal(await why(new Uint8Array([1, 2, 3])), 'not a PNG');
  assert.equal(await why(CARD.slice(0, 100)), 'the PNG is cut short');
  assert.equal(await why(CARD.slice(0, 10)), 'the PNG is cut short');
  const flip = (at) => { const c = CARD.slice(); c[at] ^= 1; return c; };
  assert.equal(await why(flip(40)), 'a chunk of the PNG is damaged', 'inside the payload');
  assert.equal(await why(flip(CARD.length - 5)), 'a chunk of the PNG is damaged', 'in the IEND CRC');
  assert.equal(await why(flip(29)), 'a chunk of the PNG is damaged', 'in the IHDR CRC');
  assert.equal(await why(CARD.slice(0, CARD.length - 12)), 'the PNG is not whole', 'no IEND');
  const px = C.pixelsOf(ORIGIN.text), good = deflateSync(rawOf(px));
  assert.equal(await why(png([...u32(255), ...u32(256), 8, 2, 0, 0, 0], good)), 'not a living-seed card (it is not a 256 × 256 RGB picture)');
  assert.equal(await why(png([...u32(256), ...u32(256), 8, 6, 0, 0, 0], good)), 'not a living-seed card (it is not a 256 × 256 RGB picture)', 'RGBA');
  assert.equal(await why(png([...u32(256), ...u32(256), 16, 2, 0, 0, 0], good)), 'not a living-seed card (it is not a 256 × 256 RGB picture)');
  assert.equal(await why(png([...u32(256), ...u32(256), 8, 2, 0, 0, 1], good)), 'not a living-seed card (it is not a 256 × 256 RGB picture)', 'interlaced');
  assert.equal(await why(png(IHDR, [1, 2, 3])), 'the picture data does not decompress');
  assert.equal(await why(png(IHDR, deflateSync(new Uint8Array(10)))), 'the picture data is the wrong size');
  const noMagic = px.slice(); noMagic[0] = 0;
  assert.equal(await why(png(IHDR, deflateSync(rawOf(noMagic)))), 'not a living-seed card (no seed in its pixels)');
  const tooLong = px.slice(); tooLong[3] = 255; tooLong[4] = 255;
  assert.equal(await why(png(IHDR, deflateSync(rawOf(tooLong)))), 'not a living-seed card (no seed in its pixels)');
  const badFilter = rawOf(px); badFilter[0] = 9;
  assert.equal(await why(png(IHDR, deflateSync(badFilter))), 'not a card', 'an unknown row filter');
  // the forger: changes one byte of the genome in the pixels and re-wraps the PNG with fresh CRCs — the seal refuses it
  const forged = px.slice(); forged[5 + 30] ^= 1;
  assert.match(await why(png(IHDR, deflateSync(rawOf(forged)))), /^the genome in the card was refused: (signature|not a genome|not signed|not canonical)$/);
  const notUtf8 = px.slice(); notUtf8[5] = 0xff;
  assert.equal(await why(png(IHDR, deflateSync(rawOf(notUtf8)))), 'not a card');
  // what you see is what you carry: a valid genome under someone else's face is refused
  const otherFace = px.slice(); otherFace[(100 * 256 + 100) * 3] ^= 0x40;
  assert.equal(await why(png(IHDR, deflateSync(rawOf(otherFace)))), 'the card’s picture does not match the seed it carries');
  const spare = px.slice(); spare[5 + utf8(ORIGIN.text).length] = 7;   // a byte after the genome, inside the band
  assert.equal(await why(png(IHDR, deflateSync(rawOf(spare)))), 'the card’s picture does not match the seed it carries');
  // the edges of every size check
  assert.equal(await why(new Uint8Array(C.MAX_CARD)), 'not a PNG', 'exactly the size limit is not too large');
  assert.equal(await why(new Uint8Array(20).fill(65)), 'not a PNG', 'twenty bytes that are not a PNG');
  assert.equal(await why(CARD.slice(0, 8)), 'the PNG is not whole', 'the signature alone');
  assert.equal(await why(CARD.slice(0, CARD.length - 5)), 'the PNG is cut short', 'the last chunk cut');
  assert.equal(await why(CARD.slice(0, CARD.length - 22)), 'the PNG is cut short', 'the picture data cut by ten bytes');
  const full = px.slice(); full[3] = C.CAPACITY >> 8; full[4] = C.CAPACITY & 255;
  assert.equal(await why(png(IHDR, deflateSync(rawOf(full)))), 'the genome in the card was refused: too large', 'a band filled to capacity is read, then refused by the seal');
  const chunkFirst = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('tEXt', utf8('a\0b')), ...chunk('IHDR', IHDR), ...chunk('IDAT', good), ...chunk('IEND', [])]);
  assert.equal(await why(chunkFirst), 'the PNG is not whole', 'IHDR must come first');
});

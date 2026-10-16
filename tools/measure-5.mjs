#!/usr/bin/env node
// tools/measure-5.mjs — organ 5's measurement: breeding and the card. Deterministic (seeded keys and attacks, no clock).
//   node tools/measure-5.mjs [--check]   → data/organ-5/record.json
// The second parent is the evolved line: organ 4's second-design champions (data/organ-4b/record.json), sealed as a
// descendant of the origin. The rules were sealed first (data/organ-5/prereg.json, tools/seal-5.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as C from '../src/card.mjs';
import { breed } from '../src/breed.mjs';
import { seal, open } from '../src/genome.mjs';
import { germinate } from '../src/germinate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8, toHexStr } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEEDS = run.library.seeds.map((s) => s.seed);
const EVOLVED = JSON.parse(read('data/organ-4b/record.json')).runs;
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const hash = (b) => toHexStr(sha256Bytes(b)).slice(0, 16);
const auc = (o) => Object.fromEntries(o.organs.map((x) => [x.domain, x.state === 'live' ? x.heldAuc : x.state]));

// a PNG with fresh CRCs around given IDAT bytes — how a forger or another tool re-wraps a card
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => { const body = C.cat([utf8(type), data]); return C.cat([new Uint8Array(u32(data.length)), body, new Uint8Array(u32(C.crc32(body)))]); };
const rewrap = (idat) => C.cat([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', new Uint8Array([...u32(256), ...u32(256), 8, 2, 0, 0, 0])), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
const raw0 = (px) => { const out = new Uint8Array(256 * 769); for (let y = 0; y < 256; y++) out.set(px.subarray(y * 768, (y + 1) * 768), y * 769 + 1); return out; };

export async function measure() {
  const maker = await key('origin'), evolver = await key('peer-1'), breeder = await key('peer-2'), stranger = await key('stranger');
  const origin = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, maker);
  const evolved = await seal({ name: 'evolved', parents: [origin.id], gate: { auc: 0.6 }, organs: DOMAIN_IDS.map((d) => EVOLVED.find((r) => r.name === d).champion) }, evolver);
  const REF = { name: 'reference', data: DATA };
  const [oA, oB] = [(await germinate(origin.text, REF)).organism, (await germinate(evolved.text, REF)).organism];

  // the child, bred on the reference device
  const child = await breed(origin.text, evolved.text, REF, breeder, { name: 'child', seed: 1 });
  const childFields = (await open(child.text)).fields;
  const grand = await breed(child.text, origin.text, REF, breeder, { name: 'grandchild', seed: 2 });
  const parents = { origin: auc(oA), evolved: auc(oB) };

  // breeding where the device cannot prove an organ
  const r9 = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r9() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const { water, ...noWater } = DATA;
  const noisy = await breed(origin.text, evolved.text, { name: 'shuffled-shopper', data: { ...DATA, shopper: { ...DATA.shopper, y } } }, breeder, { name: 'child', seed: 1 });
  const dry = await breed(origin.text, evolved.text, { name: 'no-water', data: noWater }, breeder, { name: 'child', seed: 1 });

  // cards: every generation round-trips; the same genome makes the same card
  const genomes = { origin: origin.text, evolved: evolved.text, child: child.text, grandchild: grand.text };
  const cards = {};
  for (const [name, text] of Object.entries(genomes)) {
    const c = await C.cardOf(text), again = await C.cardOf(text), back = await C.readCard(c.png);
    cards[name] = { bytes: c.png.length, hash: hash(c.png), deterministic: hash(again.png) === hash(c.png), roundTrip: back.ok && back.genome === text };
  }

  // attacks on the child's card
  const card = (await C.cardOf(child.text)).png, ra = rng(71);
  let flipsRefused = 0;
  const flips = 300;
  for (let k = 0; k < flips; k++) { const c = card.slice(), at = 8 + Math.floor(ra() * (c.length - 8)); c[at] ^= 1 + Math.floor(ra() * 255); if (!(await C.readCard(c)).ok) flipsRefused++; }
  const px = C.pixelsOf(child.text), n = utf8(child.text).length;
  let forgedRefused = 0;
  for (let i = 0; i < n; i++) { const f = px.slice(); f[5 + i] ^= 1; if (!(await C.readCard(rewrap(deflateSync(raw0(f))))).ok) forgedRefused++; }
  const recompressed = await C.readCard(rewrap(deflateSync(raw0(px), { level: 9 })));
  const truncations = [10, 100, 1000, card.length >> 1, card.length - 1];
  let truncRefused = 0;
  for (const t of truncations) if (!(await C.readCard(card.slice(0, t))).ok) truncRefused++;

  // the trade: the child's card, opened on two other devices that trust its breeder
  const devA = { name: 'device-a', data: Object.fromEntries(DOMAIN_IDS.map((d) => [d, { ...DATA[d], trainRows: DATA[d].trainRows.filter((i) => i % 2 === 0) }])) };
  const devB = { name: 'device-b', data: Object.fromEntries(DOMAIN_IDS.map((d) => [d, { ...DATA[d], trainRows: DATA[d].trainRows.filter((i) => i % 2 === 1) }])) };
  const onA = await C.readCard(card, { trust: [breeder.pub] }), onB = await C.readCard(card, { trust: [breeder.pub] });
  const gA = (await germinate(onA.genome, devA, { trust: [breeder.pub] })).organism, gB = (await germinate(onB.genome, devB, { trust: [breeder.pub] })).organism;
  const refusedElsewhere = await C.readCard(card, { trust: [stranger.pub] });

  return {
    kind: 'living-seed.organ-5.record', v: 1,
    parents: { origin: origin.id, evolved: evolved.id, evolvedParents: (await open(evolved.text)).fields.parents, heldAuc: parents },
    child: { id: child.id, parents: childFields.parents, gate: childFields.gate.auc, crossed: child.crossed, dropped: child.dropped, heldAuc: auc(child.organism), live: child.organism.organs.filter((o) => o.state === 'live').length },
    grandchild: { id: grand.id, parents: (await open(grand.text)).fields.parents, live: grand.organism.organs.filter((o) => o.state === 'live').length, carried: grand.organism.organs.length },
    hostile: { noisy: { dropped: noisy.dropped, carried: (await open(noisy.text)).fields.organs.length }, dry: { dropped: dry.dropped, carried: (await open(dry.text)).fields.organs.length } },
    cards,
    attacks: { flips, flipsRefused, forged: n, forgedRefused, recompressedOpens: recompressed.ok && recompressed.genome === child.text, truncations: truncations.length, truncRefused },
    trade: { sameGenome: onA.id === child.id && onB.id === child.id, organismA: gA.id, organismB: gB.id, liveA: gA.organs.filter((o) => o.state === 'live').length, liveB: gB.organs.filter((o) => o.state === 'live').length, untrusted: refusedElsewhere.ok ? 'opened' : refusedElsewhere.why },
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-5.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-5/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-5/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-5/record.json', ROOT), text);
    console.log('wrote data/organ-5/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

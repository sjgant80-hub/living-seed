#!/usr/bin/env node
// tools/measure-11b.mjs — the organism's memory, its guarantee stated exactly. Organ 11's K2 claimed a memory would not
// wake on "different data under it"; it woke when the dataset's label for a lived case was changed — because the memory
// carries the truth the device was told, and the life reads that. This measurement states the guarantee as the design
// gives it, on device A's real sessions (organ 11's own helpers): a memory will not wake if the data its organs grew
// from changes, nor (predicted) if a lived case's own measurements change; it does wake when only the dataset's later
// label for a lived case changes. And a memory written at the end of a longer life wakes too.
// Deterministic: node tools/measure-11b.mjs [--check] → data/organ-11b/record.json. Sealed first (tools/seal-11b.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as O from '../src/organism.mjs';
import * as A from '../src/align.mjs';
import { DATA, GENOME } from './measure-10.mjs';
import { key, months, device, stream } from './measure-11.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
export const PROBES = 12;   // seeded rows of each kind

export async function measure() {
  const maker = await key('origin'), devA = await key('device-a-11'), opts = { checks: A.CHECKS };
  const subA = device(0, { train: months('Feb', 'Mar', 'May'), held: months('June', 'Jul') }), lived = stream(0, 'Aug', 'Sep', 'Oct');
  const l = await A.life(GENOME, subA, lived, opts), memory = await O.remember(GENOME, lived, l.head, devA);
  const wake = (sub) => O.wake(memory, sub, { self: [devA.pub], trust: [maker.pub], life: opts });
  const shop = subA.data.shopper, at = (rows, k) => rows[Math.floor(((k + 0.5) / PROBES) * rows.length)];
  const withShop = (patch) => ({ ...subA, data: { ...subA.data, shopper: { ...shop, ...patch(shop) } } });
  const probe = async (rows, change) => { const out = []; for (let k = 0; k < PROBES; k++) { const i = at(rows, k), w = await wake(withShop((s) => change(s, i))); out.push({ row: i, woke: w.ok, why: w.why || null }); } return out; };
  const flipY = (s, i) => { const y = Uint8Array.from(s.y); y[i] = 1 - y[i]; return { y }; };
  const bump = (s, i) => { const f = 'PageValues', c = Float64Array.from(s.cols[f]); c[i] = c[i] * 10 + 100; return { cols: { ...s.cols, [f]: c } }; };
  const livedRows = lived.map((c) => c.row);
  return {
    kind: 'living-seed.organ-11b.record', v: 1, probes: PROBES, lived: lived.length, head: l.head,
    unchanged: (await wake(subA)).ok,
    trainingLabel: await probe(shop.trainRows, flipY),
    heldLabel: await probe(shop.heldRows, flipY),
    livedFeature: await probe(livedRows, bump),
    livedLabel: await probe(livedRows, flipY),
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-11b.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-11b/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-11b/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-11b/record.json', ROOT), text);
    console.log('wrote data/organ-11b/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

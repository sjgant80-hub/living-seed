#!/usr/bin/env node
// tools/measure-6.mjs — organ 6's measurement: how much of the organism's own work is recycled, and proof that recycling
// never changes an answer. Deterministic (counts, not clocks), so CI reproduces it byte for byte.
//   node tools/measure-6.mjs [--check]   → data/organ-6/record.json
// Wall time is measured separately (tools/time-6.mjs → data/organ-6/timing.json), once, on the machine that sealed it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as R from '../src/recycle.mjs';
import * as E from '../src/evolve.mjs';
import { seal } from '../src/genome.mjs';
import { germinate, stable } from '../src/germinate.mjs';
import { breed } from '../src/breed.mjs';
import { replicate } from '../src/gate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEEDS = run.library.seeds.map((s) => s.seed);
const SEED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s.seed]));
const EVOLVED = JSON.parse(read('data/organ-4b/record.json')).runs;
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
export const OPTS = { generations: 30, children: 8, seed: 1, folds: 3 };

export function shuffledShop() {
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  return { ...DATA.shopper, y };
}

/** organ 4's second-design evolution, five runs, through an assess of the caller's choosing */
export function evolutions(assess) {
  const runs = [...DOMAIN_IDS.map((d) => [d, DATA[d]]), ['shopper, labels shuffled', shuffledShop()]];
  return runs.map(([name, ds]) => { const e = E.evolve(SEED[name.split(',')[0]], E.blind(ds), assess ? { ...OPTS, assess } : OPTS); return { name, champion: e.champion, trajectory: e.trajectory }; });
}

/** the organism's life so far: every genome bred or evolved in organs 1–5 */
export async function genomes() {
  const maker = await key('origin'), p1 = await key('peer-1'), p2 = await key('peer-2'), p3 = await key('peer-3');
  const origin = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, maker);
  const REF = { name: 'reference', data: DATA };
  const org = (await germinate(origin.text, REF)).organism;
  const evolved = await seal({ name: 'evolved', parents: [origin.id], gate: { auc: 0.6 }, organs: DOMAIN_IDS.map((d) => EVOLVED.find((r) => r.name === d).champion) }, p1);
  const child = await breed(origin.text, evolved.text, REF, p2, { name: 'child', seed: 1 });
  const grand = await breed(child.text, origin.text, REF, p2, { name: 'grandchild', seed: 2 });
  const line = [];
  let parentText = origin.text, parentOrg = org;
  for (const [gen, k] of [[1, p1], [2, p2], [3, p3]]) {
    const c = await replicate(parentText, parentOrg, { name: 'gen-' + gen, organs: DOMAIN_IDS, gate: { auc: (60 + gen) / 100 } }, k);
    line.push(c.text); parentText = c.text; parentOrg = (await germinate(c.text, REF)).organism;
  }
  return { origin: origin.text, evolved: evolved.text, child: child.text, grandchild: grand.text, 'gen-1': line[0], 'gen-2': line[1], 'gen-3': line[2] };
}

/** the five devices of organ 1 */
export function devices() {
  const shard = (ds, keep) => ({ ...ds, trainRows: ds.trainRows.filter(keep) });
  const { water, ...noWater } = DATA;
  return {
    reference: DATA,
    'device-a': Object.fromEntries(DOMAIN_IDS.map((d) => [d, shard(DATA[d], (i) => i % 2 === 0)])),
    'device-b': Object.fromEntries(DOMAIN_IDS.map((d) => [d, shard(DATA[d], (i) => i % 2 === 1)])),
    'shuffled-shopper': { ...DATA, shopper: shuffledShop() },
    'no-water': noWater,
  };
}

export async function measure() {
  // A · evolution: plain, through a pool that keeps nothing (every sort counted), through a pool that keeps
  const plain = evolutions(null), counted = R.pool({ cap: 0 }), kept = R.pool();
  const viaCounted = evolutions(R.assessWith(counted)), viaKept = evolutions(R.assessWith(kept));
  const A = {
    runs: plain.length,
    sameAsPlain: stable(viaCounted) === stable(plain) && stable(viaKept) === stable(plain),
    sortsAsked: counted.stats().sortMisses, sortsDone: kept.stats().sortMisses, sortsReused: kept.stats().sortHits,
  };
  // B · the organism's life: every genome grown on every device, once fresh and once through one shared pool
  const G = await genomes(), D = devices(), lives = R.pool();
  let organisms = 0, same = 0;
  for (const [g, text] of Object.entries(G)) for (const [d, data] of Object.entries(D)) {
    const fresh = (await germinate(text, { name: d, data })).organism, pooled = (await germinate(text, { name: d, data }, { pool: lives })).organism;
    organisms++; if (stable(fresh) === stable(pooled)) same++;
  }
  const s = lives.stats();
  const B = { genomes: Object.keys(G).length, devices: Object.keys(D).length, organisms, sameAsFresh: same, organGrowths: s.growHits + s.growMisses, fromPool: s.growHits, grownFresh: s.growMisses };
  return { kind: 'living-seed.organ-6.record', v: 1, evolution: A, life: B };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-6.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-6/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-6/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-6/record.json', ROOT), text);
    console.log('wrote data/organ-6/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

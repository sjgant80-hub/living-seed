#!/usr/bin/env node
// tools/measure-4.mjs — organ 4's measurement: each origin organ evolved blind for 30 generations, then judged
// separately on the cases the evolver never saw; and the same on shop data with no signal in it. Deterministic.
//   node tools/measure-4.mjs           → writes data/organ-4/record.json
//   node tools/measure-4.mjs --check   → refuses unless the committed record is reproduced byte for byte
// The rules and predictions were sealed first (data/organ-4/prereg.json, tools/seal-4.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as E from '../src/evolve.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s.seed]));
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const OPTS = { generations: 30, children: 8, seed: 1 };

function one(name, recipe, ds) {
  const shown = E.blind(ds);
  const e = E.evolve(recipe, shown, OPTS);
  if (!e.ok) return { name, error: e.why };
  const j = E.judge(e.accepted.map((a) => a.recipe), ds);   // the only place the held-out cases are read
  return {
    name, heldShownToEvolver: shown.heldRows.length, evals: e.evals,
    val: { start: e.trajectory[0].val, final: e.trajectory[e.trajectory.length - 1].val },
    accepted: e.accepted.map((a, i) => ({ gen: a.gen, val: a.val, heldAuc: j[i].heldAuc })),
    steps: [...new Set(e.trajectory.map((t) => t.k))].sort((a, b) => a - b), champion: e.champion,
  };
}

export async function measure() {
  const runs = DOMAIN_IDS.map((d) => one(d, SEED[d], DATA[d]));
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const noise = one('shopper, labels shuffled', SEED.shopper, { ...DATA.shopper, y });
  return { kind: 'living-seed.organ-4.record', v: 1, opts: OPTS, margin: E.MARGIN, runs, noise };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-4.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-4/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-4/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-4/record.json', ROOT), text);
    console.log('wrote data/organ-4/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

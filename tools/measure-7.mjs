#!/usr/bin/env node
// tools/measure-7.mjs — organ 7's measurement: each live organ's self-model, climbed seven times, judged on unseen cases.
// Deterministic. node tools/measure-7.mjs [--check] → data/organ-7/record.json. Sealed first (tools/seal-7.mjs).
//
// Ψ must learn what the organism is like on cases it did not fit on, or it learns to be overconfident. So its training
// cases are out-of-fold: the training rows are cut into 3 folds; for each, the organ's recipe is fitted on the other two
// and answers that fold; what Ψ learns is whether those answers were right. It is then judged on the cases the real
// organ (fitted on all the training rows) answers and never grew on.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as P from '../src/psi.mjs';
import { fingerprint } from '../src/body.mjs';
import { operatingPoint, caseOf } from '../src/germinate.mjs';
import { kfolds } from '../src/evolve.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { decodeSeed, fit } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s.seed]));
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
export const BAR = 0.8;

/** the organ as a pattern fitted on some rows: its rules, its line, its data's shape */
function patternOn(ds, rows, genome) {
  const card = fit(ds, rows, genome);
  return { rules: card.rules, threshold: operatingPoint(card, ds, rows), features: ds.features, shape: Object.fromEntries(ds.features.map((f) => [f, fingerprint(ds, rows, f)])) };
}
const caseAs = (pattern, ds, i) => { const s = P.introspect(pattern, caseOf(ds, i)); return { margin: s.margin, fit: s.fit, right: s.label === ds.y[i] ? 1 : 0 }; };

export function one(domain) {
  const ds = DATA[domain], genome = decodeSeed(SEED[domain]).seed.genome;
  const train = kfolds(ds, ds.trainRows, 3, 7).flatMap((part) => { const p = patternOn(ds, part.rest, genome); return part.held.map((i) => caseAs(p, ds, i)); });
  const organ = patternOn(ds, ds.trainRows, genome), held = ds.heldRows.map((i) => caseAs(organ, ds, i));
  const c = P.climb(train, held), last = c.models[c.models.length - 1];
  return { domain, trainCases: train.length, heldCases: held.length, steps: c.steps, all: P.selective(last, held, 0), selective: P.selective(last, held, BAR) };
}

export async function measure() {
  return { kind: 'living-seed.organ-7.record', v: 1, resolutions: P.FIB, selectiveBar: BAR, strength: P.STRENGTH, organs: DOMAIN_IDS.map(one) };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-7.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-7/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-7/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-7/record.json', ROOT), text);
    console.log('wrote data/organ-7/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

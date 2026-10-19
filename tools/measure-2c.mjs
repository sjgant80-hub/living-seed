#!/usr/bin/env node
// tools/measure-2c.mjs — organ 2c: the shop organ against the classical models a data scientist would fit first, on the
// same 10 measurements, fitted on the same February–October sessions, scored on the same 4,725 November–December
// sessions the organ never grew on: PageValues alone, logistic regression, gradient-boosted trees (src/baseline.mjs,
// mutation-gated). The organ is organ 1's (the origin genome grown on the reference data); the bounds are organ 2's
// paired bootstrap (2,000 resamples, seed 99). Deterministic: node tools/measure-2c.mjs [--check] → data/organ-2c/record.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { seal } from '../src/genome.mjs';
import { germinate, answer, caseOf } from '../src/germinate.mjs';
import { single, logistic, boosted, size } from '../src/baseline.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { auc, round6 } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';
import { pairedLow } from './measure-2.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
export const SETTINGS = { feature: 'PageValues', logistic: { lambda: 1 }, boosted: { rounds: 200, rate: 0.1, bins: 32, lambda: 1, minHess: 1 } };
const fp = (x) => sha256Hex(JSON.stringify(x)).slice(0, 16);

export async function measure() {
  const run = JSON.parse(read('data/seed-library-run.json')), CSV = read('data/online_shoppers_intention.csv');
  const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })])), shop = DATA.shopper;
  const maker = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
  const genome = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: run.library.seeds.map((s) => s.seed) }, maker);
  const org = (await germinate(genome.text, { name: 'reference', data: DATA })).organism, organ = org.organs.find((o) => o.domain === 'shopper');
  const train = shop.trainRows, held = shop.heldRows, y = held.map((i) => shop.y[i]);
  const fit = (ds) => ({ pageValues: single(ds, SETTINGS.feature), logistic: logistic(ds, train, SETTINGS.logistic), boosted: boosted(ds, train, SETTINGS.boosted) });
  const params = (m) => (m.kind === 'logistic' ? { w: m.weights, mean: m.mean, sd: m.sd } : m.kind === 'boosted' ? { base: m.base, trees: m.trees } : { feature: m.feature });
  const M = fit(shop), again = fit(shop);
  // the leak test: every November–December measurement and label scrambled — a fit that read none of them cannot tell
  const cols = Object.fromEntries(Object.entries(shop.cols).map(([k, v]) => [k, Float64Array.from(v)])), ys = Uint8Array.from(shop.y);
  for (const i of held) { for (const k of Object.keys(cols)) cols[k][i] = (i % 13) * 997 - 1; ys[i] = 1 - ys[i]; }
  const blind = fit({ ...shop, cols, y: ys });
  const o = held.map((i) => answer(org, 'shopper', caseOf(shop, i)).score);
  const models = Object.fromEntries(Object.entries(M).map(([name, m]) => {
    const s = held.map((i) => m.score(i)), a = auc(s, y);
    return [name, { kind: m.kind, numbers: size(m), fingerprint: fp(params(m)), fitRowsAuc: round6(auc(train.map((i) => m.score(i)), train.map((i) => shop.y[i]))), auc: round6(a),
      organLead: round6(auc(o, y) - a), organLeadLow95: pairedLow(o, s, y), modelLeadLow95: pairedLow(s, o, y), finite: s.every(Number.isFinite),
      ...(m.kind === 'logistic' ? { newtonSteps: m.steps } : m.kind === 'boosted' ? { trees: m.rounds } : {}) }];
  }));
  return {
    kind: 'living-seed.organ-2c.record', v: 1, settings: SETTINGS, features: shop.features,
    split: { fitted: train.length, scored: held.length, purchasesScored: y.reduce((a, v) => a + v, 0) },
    organ: { recipe: organ.recipe, state: organ.state, auc: round6(auc(o, y)), sealedInOrgan1: JSON.parse(read('data/record.json')).reproduce.sealed.shopper,
      rules: organ.body.rules.length, numbers: organ.body.rules.length * 3 + 2, distinctScores: new Set(o).size },   // a rule is a measurement, a cut and a weight; plus a base and a line
    models,
    fittedOnTrainOnly: Object.keys(M).every((k) => fp(params(blind[k])) === fp(params(M[k]))),
    deterministic: Object.keys(M).every((k) => fp(params(again[k])) === fp(params(M[k]))),
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-2c.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-2c/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else { mkdirSync(new URL('data/organ-2c/', ROOT), { recursive: true }); writeFileSync(new URL('data/organ-2c/record.json', ROOT), text); console.log('wrote data/organ-2c/record.json · ' + sha256Hex(text).slice(0, 16)); }
}

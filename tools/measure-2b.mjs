#!/usr/bin/env node
// tools/measure-2b.mjs — organ 2b: organ 2's shop organ against qwen2.5:14b shown 24 examples, on 1,200 new held-out
// sessions — the one condition organ 2 could not tell from a tie. The organ is organ 2's (the origin genome grown on the
// reference data); the lead's bound is organ 2's paired bootstrap. Also reported: the 1,500 sessions of both samples
// together. Deterministic given the committed answers: node tools/measure-2b.mjs [--check] → data/organ-2b/record.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { seal } from '../src/genome.mjs';
import { germinate, answer, caseOf, stable } from '../src/germinate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { auc, round6 } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';
import { sampleOf } from './sample.mjs';
import { sampleOf2b, MODEL } from './sample-2b.mjs';
import { pairedLow } from './measure-2.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
export const MARGIN = 0.02;   // "not worse than the 14B by more than this"

export async function measure() {
  const run = JSON.parse(read('data/seed-library-run.json')), CSV = read('data/online_shoppers_intention.csv');
  const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })])), shop = DATA.shopper;
  const maker = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
  const genome = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: run.library.seeds.map((s) => s.seed) }, maker);
  const org = (await germinate(genome.text, { name: 'reference', data: DATA })).organism;
  const doc = JSON.parse(read('data/organ-2b/llm-answers.json')), calls = new Map(doc.calls.map((c) => [c.row, c]));
  const s2b = sampleOf2b(shop), first = sampleOf(shop), overlap = s2b.filter((i) => first.includes(i)).length;
  const a2 = JSON.parse(read('data/organ-2/llm-answers.json')), firstCalls = new Map(a2.calls.filter((c) => c.model === MODEL && c.condition === 'few').map((c) => [c.row, c]));
  const score = (rows, m) => {
    const y = rows.map((i) => shop.y[i]), o = rows.map((i) => answer(org, 'shopper', caseOf(shop, i)).score), p = rows.map((i) => (m.get(i).p === null ? 0.5 : m.get(i).p));
    return { cases: rows.length, purchases: y.reduce((a, v) => a + v, 0), organ: round6(auc(o, y)), model: round6(auc(p, y)), lead: round6(auc(o, y) - auc(p, y)), leadLow95: pairedLow(o, p, y), unreadable: rows.filter((i) => m.get(i).p === null).length };
  };
  const both = new Map([...firstCalls, ...calls]);
  return {
    kind: 'living-seed.organ-2b.record', v: 1, model: doc.model, margin: MARGIN,
    sample: { cases: s2b.length, sha: sha256Hex(stable(s2b)).slice(0, 16), overlapWithOrgan2: overlap, answered: s2b.filter((i) => calls.has(i)).length },
    window: { longestPrompt: Math.max(...doc.calls.map((c) => c.promptTokens)), numCtx: 4096 },
    digestSameAsOrgan2: doc.model.digest === a2.models[MODEL].digest,
    fresh: score(s2b, calls),
    together: score([...first, ...s2b], both),
    medianMs: doc.calls.map((c) => c.wallMs).sort((a, b) => a - b)[doc.calls.length >> 1],
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-2b.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-2b/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else { writeFileSync(new URL('data/organ-2b/record.json', ROOT), text); console.log('wrote data/organ-2b/record.json · ' + sha256Hex(text).slice(0, 16)); }
}

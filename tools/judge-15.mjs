#!/usr/bin/env node
// tools/judge-15.mjs — organ 15 (the self-similar stack: homeostasis against greedy adoption) judged against its seal.
//   --write → data/organ-15/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export const RULES = {
  H1: (r) => {
    const h = r.homeostatic, ok = h.chained === true && h.perNight.length === r.nights && r.naive.perNight.length === r.nights && r.nights === 10;
    return { pass: ok, saw: 'the homeostatic lineage is the ' + h.perNight.length + ' committed nights, chained unbroken: ' + h.chained + '; the naive lineage ran ' + r.naive.perNight.length + ' nights on the same seeds' };
  },
  H2: (r) => ({ pass: r.naive.adoptions > r.homeostatic.adoptions, saw: 'adoptions over the ten nights: naive ' + r.naive.adoptions + ', homeostatic ' + r.homeostatic.adoptions }),
  H3: (r) => ({ pass: r.homeostatic.finalAuc >= r.naive.finalAuc, saw: 'November–December after ten nights: homeostatic ' + r.homeostatic.finalAuc + ', naive ' + r.naive.finalAuc + ' (both began at ' + r.origin + ')' }),
  H4: (r) => ({ pass: r.naive.harmful > r.homeostatic.harmful, saw: 'adoptions that lowered November–December: naive ' + r.naive.harmful + ' of ' + r.naive.adoptions + ', homeostatic ' + r.homeostatic.harmful + ' of ' + r.homeostatic.adoptions }),
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-15.mjs');
if (isMain) {
  const pre = read('data/organ-15/prereg.json'), rec = read('data/organ-15/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-15.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-15/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-15/verdict.json') !== text) { console.log('VERDICT DRIFT'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

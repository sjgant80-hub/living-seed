#!/usr/bin/env node
// tools/judge-7.mjs — organ 7 (the self-model) judged against the rules sealed before it ran.
//   --write → data/organ-7/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const last = (xs) => xs[xs.length - 1];

export const RULES = {
  P1: (r) => ({ pass: r.organs.every((o) => last(o.steps).heldBrier < o.steps[0].heldBrier), saw: r.organs.map((o) => o.domain + ' ' + o.steps[0].heldBrier + ' → ' + last(o.steps).heldBrier).join('; ') + ' (Brier on unseen cases, base rate → Ψ⁷)' }),
  P2: (r) => ({ pass: r.organs.every((o) => last(o.steps).moved < 0.01 && last(o.steps).moved < o.steps[2].moved), saw: r.organs.map((o) => o.domain + ' steps ' + o.steps.slice(1).map((s) => s.moved).join(' → ')).join('; ') }),
  P3: (r) => {
    const climbs = r.organs.map((o) => ({ d: o.domain, n: o.steps.slice(1).filter((s, i) => s.heldBrier < o.steps[i].heldBrier).length }));
    return { pass: climbs.filter((x) => x.n >= 2).length >= 3, saw: climbs.map((x) => x.d + ' improved on unseen cases at ' + x.n + ' of 7 refinements').join('; ') };
  },
  P4: (r) => ({ pass: r.organs.filter((o) => o.selective.accuracy > o.all.accuracy && o.selective.coverage > 0).length >= 3, saw: r.organs.map((o) => o.domain + ' ' + o.all.accuracy + ' on all → ' + o.selective.accuracy + ' on the ' + Math.round(o.selective.coverage * 1000) / 10 + '% it rates ≥ ' + r.selectiveBar).join('; ') }),
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-7.mjs');
if (isMain) {
  const pre = read('data/organ-7/prereg.json'), rec = read('data/organ-7/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-7.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-7/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-7/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

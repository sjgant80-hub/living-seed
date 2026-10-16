#!/usr/bin/env node
// tools/judge-4b.mjs — organ 4's second design judged against the rules sealed before it ran, and against the first
// design's committed record. --write → data/organ-4b/verdict.json; --check refuses on drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const last = (xs) => xs[xs.length - 1];
const gainOf = (x) => r6(last(x.accepted).heldAuc - x.accepted[0].heldAuc);

export const RULES = {
  F1: (r) => {
    const all = [...r.runs, r.noise];
    return { pass: all.every((x) => !x.error && x.heldShownToEvolver === 0 && x.evals === 1 + r.opts.generations * r.opts.children && x.accepted.every((a) => a.folds.length === 3)), saw: all.map((x) => x.name + ': ' + (x.error ? 'error' : x.heldShownToEvolver + ' held-out cases shown, ' + x.evals + ' variants, 3 folds')).join('; ') };
  },
  F2: (r) => ({ pass: r.runs.every((x) => gainOf(x) >= -0.005), saw: r.runs.map((x) => x.name + ' ' + (gainOf(x) >= 0 ? '+' : '') + gainOf(x)).join('; ') + ' on unseen cases' }),
  F3: (r) => ({ pass: r.runs.filter((x) => gainOf(x) >= 0.005).length >= 1, saw: r.runs.filter((x) => gainOf(x) >= 0.005).length + ' of 4 domains gained at least 0.005 on unseen cases' }),
  F4: (r) => {
    const w = r.runs.map((x) => ({ name: x.name, worst: x.accepted.reduce((m, a, i) => (i ? Math.min(m, r6(a.heldAuc - x.accepted[i - 1].heldAuc)) : m), 0), steps: x.accepted.length - 1 }));
    return { pass: w.every((x) => x.worst >= -0.01), saw: w.map((x) => x.name + ' ' + x.steps + ' steps kept, worst ' + x.worst).join('; ') };
  },
  F5: (r) => {
    const n = r.noise;
    return { pass: n.accepted.length - 1 <= 1 && n.accepted.every((a) => a.heldAuc < 0.6), saw: (n.accepted.length - 1) + ' steps kept on noise; best on unseen cases ' + Math.max(...n.accepted.map((a) => a.heldAuc)) };
  },
  F6: (r, first) => {
    const better = r.runs.filter((x) => { const f = first.runs.find((y) => y.name === x.name); return last(x.accepted).heldAuc >= last(f.accepted).heldAuc; });
    return { pass: better.length >= 3, saw: r.runs.map((x) => { const f = first.runs.find((y) => y.name === x.name); return x.name + ' ' + last(f.accepted).heldAuc + ' → ' + last(x.accepted).heldAuc; }).join('; ') + ' (first design → second, final champion on unseen cases)' };
  },
};

export function judge(prereg, record, first) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record, first) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-4b.mjs');
if (isMain) {
  const pre = read('data/organ-4b/prereg.json'), rec = read('data/organ-4b/record.json'), first = JSON.parse(read('data/organ-4/record.json'));
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec), first);
  const text = JSON.stringify({ kind: 'living-seed.organ-4b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-4b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-4b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

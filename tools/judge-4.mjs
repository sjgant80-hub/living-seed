#!/usr/bin/env node
// tools/judge-4.mjs — organ 4 (variation and selection) judged against the rules sealed before it was measured.
//   node tools/judge-4.mjs --write   → data/organ-4/verdict.json      node tools/judge-4.mjs --check → refuse on drift
// Rules as code, pinned by the seal. A failed property is red; a failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const last = (xs) => xs[xs.length - 1];

export const RULES = {
  E1: (r) => {
    const all = [...r.runs, r.noise];
    return { pass: all.every((x) => !x.error && x.heldShownToEvolver === 0 && x.evals === 1 + r.opts.generations * r.opts.children), saw: all.map((x) => x.name + ': ' + (x.error ? 'error' : x.heldShownToEvolver + ' held-out cases shown, ' + x.evals + ' variants tried')).join('; ') };
  },
  E2: (r) => {
    const rose = r.runs.filter((x) => x.val.final > x.val.start);
    const monotone = r.runs.every((x) => x.accepted.every((a, i) => i === 0 || a.val > x.accepted[i - 1].val));
    return { pass: monotone && rose.length >= 3, saw: r.runs.map((x) => x.name + ' ' + x.val.start + ' → ' + x.val.final + ' on validation (' + (x.accepted.length - 1) + ' steps kept)').join('; ') };
  },
  E3: (r) => {
    const d = r.runs.map((x) => ({ name: x.name, gain: r6(last(x.accepted).heldAuc - x.accepted[0].heldAuc) }));
    return { pass: d.filter((x) => x.gain >= 0.005).length >= 2 && d.every((x) => x.gain >= -0.01), saw: d.map((x) => x.name + ' ' + (x.gain >= 0 ? '+' : '') + x.gain + ' on unseen cases').join('; ') };
  },
  E4: (r) => {
    const drops = r.runs.map((x) => ({ name: x.name, worst: x.accepted.reduce((w, a, i) => (i ? Math.min(w, r6(a.heldAuc - x.accepted[i - 1].heldAuc)) : w), 0) }));
    return { pass: drops.filter((x) => x.worst >= -0.01).length >= 3, saw: drops.map((x) => x.name + ' worst step ' + x.worst).join('; ') };
  },
  E5: (r) => {
    const n = r.noise, top = Math.max(...n.accepted.map((a) => a.heldAuc));
    return { pass: n.val.final > n.val.start && n.accepted.every((a) => a.heldAuc < 0.6), saw: 'validation ' + n.val.start + ' → ' + n.val.final + ' (' + (n.accepted.length - 1) + ' steps kept); best on unseen cases ' + top + ' — ' + (n.accepted.every((a) => a.heldAuc < 0.6) ? 'none clears the 0.6 gate' : 'one clears the gate') };
  },
  E6: (r) => {
    const all = [...r.runs, r.noise];
    return { pass: all.every((x) => x.steps.length >= 2), saw: all.map((x) => x.name + ' steps ' + x.steps.join(',')).join('; ') };
  },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-4.mjs');
if (isMain) {
  const pre = read('data/organ-4/prereg.json'), rec = read('data/organ-4/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-4.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-4/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-4/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

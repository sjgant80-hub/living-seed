#!/usr/bin/env node
// tools/judge-8b.mjs — organ 8's fair learning test judged against the rules sealed before it ran.
//   --write → data/organ-8b/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pc = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';
const P = (r, k) => r.policies[k];

export const RULES = {
  L0: (r) => { const d = r.premise.rightDirect; return { pass: d.west - d.east >= 0.1 && r.premise.adverts.east > r.premise.adverts.west, saw: 'asked directly: west right on ' + Math.round(d.west * 1000) / 10 + '%, east on ' + Math.round(d.east * 1000) / 10 + '% (east abstained on ' + r.premise.eastAbstains + ' of ' + r.rounds * r.perRound + '); adverts west ' + r.premise.adverts.west + ', east ' + r.premise.adverts.east }; },
  L1: (r) => { const x = P(r, 0).late; return { pass: x.toWest <= 0.1 * x.routed, saw: 'organ 8’s rule: ' + x.toWest + ' of ' + x.routed + ' late routed tasks to west (' + pc(x.toWest, x.routed) + ')' }; },
  L2: (r) => { const x = P(r, 1).late; return { pass: x.toWest <= 0.1 * x.routed, saw: 'reliability alone: ' + x.toWest + ' of ' + x.routed + ' late routed tasks to west (' + pc(x.toWest, x.routed) + ')' }; },
  L3: (r) => { const x = P(r, 2).late; return { pass: x.toWest >= 0.7 * x.routed, saw: 'reliability + exploring: ' + x.toWest + ' of ' + x.routed + ' late routed tasks to west (' + pc(x.toWest, x.routed) + '); early: ' + pc(P(r, 2).early.toWest, P(r, 2).early.routed) }; },
  L4: (r) => { const a = P(r, 0).late, c = P(r, 2).late; return { pass: c.right / c.tasks - a.right / a.tasks >= 0.1, saw: 'right in the last ' + r.late + ' rounds: organ 8’s rule ' + pc(a.right, a.tasks) + ', reliability alone ' + pc(P(r, 1).late.right, P(r, 1).late.tasks) + ', with exploring ' + pc(c.right, c.tasks) }; },
  L5: (r) => ({ pass: r.policies.every((p) => p.gate.admitted === p.gate.sent), saw: r.policies.map((p) => p.name + ' ' + p.gate.admitted + '/' + p.gate.sent).join('; ') + ' messages admitted' }),
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-8b.mjs');
if (isMain) {
  const pre = read('data/organ-8b/prereg.json'), rec = read('data/organ-8b/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-8b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-8b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-8b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

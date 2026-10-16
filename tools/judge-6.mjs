#!/usr/bin/env node
// tools/judge-6.mjs — organ 6 (self-powering: recycled work) judged against the rules sealed before it ran.
//   --write → data/organ-6/verdict.json      --check → refuse on drift. Reads the record and the committed timing.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pct = (a, b) => (b ? Math.round((a / b) * 10000) / 100 : 0) + '%';

export const RULES = {
  S1: (r) => ({ pass: r.evolution.sameAsPlain === true && r.life.sameAsFresh === r.life.organisms, saw: 'evolution through the pool ' + (r.evolution.sameAsPlain ? 'took exactly the same steps' : 'DIFFERED') + '; ' + r.life.sameAsFresh + '/' + r.life.organisms + ' organisms grown through the pool identical to fresh' }),
  S2: (r) => { const e = r.evolution; return { pass: e.sortsDone <= 0.02 * e.sortsAsked, saw: e.sortsDone.toLocaleString('en-GB') + ' sorts done of ' + e.sortsAsked.toLocaleString('en-GB') + ' asked for (' + pct(e.sortsDone, e.sortsAsked) + ')' }; },
  S3: (r) => { const l = r.life; return { pass: l.fromPool >= 0.5 * l.organGrowths, saw: l.fromPool + ' of ' + l.organGrowths + ' organ growths came from the pool (' + pct(l.fromPool, l.organGrowths) + '), across ' + l.genomes + ' genomes on ' + l.devices + ' devices' }; },
  S4: (r, t) => ({ pass: !!t && t.speedup >= 3, saw: t ? 'evolution plain ' + t.plainMs + ' ms, pooled ' + t.pooledMs + ' ms (×' + t.speedup + ') on ' + t.machine : 'no timing committed' }),
};

export function judge(prereg, record, timing) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record, timing) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-6.mjs');
if (isMain) {
  const pre = read('data/organ-6/prereg.json'), rec = read('data/organ-6/record.json'), tim = read('data/organ-6/timing.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec), JSON.parse(tim));
  const text = JSON.stringify({ kind: 'living-seed.organ-6.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), timing: sha256Hex(tim).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-6/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-6/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

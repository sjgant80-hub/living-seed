#!/usr/bin/env node
// tools/judge-11b.mjs — the organism's memory, its guarantee stated exactly, judged against the rules sealed before it ran.
//   --write → data/organ-11b/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const count = (ps, woke) => ps.filter((p) => p.woke === woke).length;

export const RULES = {
  L1: (r) => ({ pass: r.unchanged === true, saw: 'the memory of ' + r.lived + ' lived cases, on unchanged data: ' + (r.unchanged ? 'woke' : 'did NOT wake') }),
  L2: (r) => ({ pass: count(r.trainingLabel, true) === 0, saw: 'one label changed in the rows its organs grew from (' + r.probes + ' rows tried): refused ' + count(r.trainingLabel, false) + ', woke ' + count(r.trainingLabel, true) }),
  L3: (r) => ({ pass: count(r.heldLabel, true) === 0, saw: 'one label changed in the rows it measured its claim on (' + r.probes + ' tried): refused ' + count(r.heldLabel, false) + ', woke ' + count(r.heldLabel, true) }),
  L4: (r) => ({ pass: count(r.livedFeature, true) === 0, saw: 'one lived case’s page value changed (' + r.probes + ' tried): refused ' + count(r.livedFeature, false) + ', woke ' + count(r.livedFeature, true) }),
  L5: (r) => ({ pass: count(r.livedLabel, false) === 0, saw: 'the dataset’s label for a lived case changed (' + r.probes + ' tried): woke ' + count(r.livedLabel, true) + ' — the memory carries what it was told' }),
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-11b.mjs');
if (isMain) {
  const pre = read('data/organ-11b/prereg.json'), rec = read('data/organ-11b/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-11b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-11b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-11b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

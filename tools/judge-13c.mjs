#!/usr/bin/env node
// tools/judge-13c.mjs — organ 13c (what the system loads, asked of Node's own loader) judged against its sealed rule.
//   --write → data/organ-13c/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export const RULES = {
  L1: (r) => {
    const l = r.loader, ok = l.files > 0 && l.sameFilesAsOrgan13 === true && l.outside.length === 0;
    return { pass: ok, saw: 'Node’s loader resolved ' + l.resolutions + ' imports to ' + l.files + ' files of this repository (the same files organ 13 followed: ' + l.sameFilesAsOrgan13 + '); anything else: ' + (l.outside.join(', ') || 'nothing') };
  },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-13c.mjs');
if (isMain) {
  const pre = read('data/organ-13c/prereg.json'), rec = read('data/organ-13c/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-13c.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-13c/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-13c/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

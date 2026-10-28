#!/usr/bin/env node
// tools/judge-14.mjs — organ 14 (the compute layer is swappable) judged against the rules sealed before it ran.
//   --write → data/organ-14/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export const RULES = {
  V1: (r) => {
    const f = r.substrates.f64, ok = f && f.cases === r.totalCases && f.sameScore === f.cases && f.sameLabel === f.cases && r.totalCases > 0;
    return { pass: ok, saw: 'JavaScript doubles gave the organism’s own score and label on ' + (f ? f.sameScore + ' of ' + f.cases : '?') + ' held cases across ' + r.live.length + ' live organs' };
  },
  V2: (r) => {
    const rows = ['int', 'wasm'].map((n) => ({ n, s: r.substrates[n] }));
    const ok = rows.every(({ s }) => s && s.cases === r.totalCases && s.sameScore === s.cases && s.sameLabel === s.cases) && r.wasm.valid === true;
    return { pass: ok, saw: rows.map(({ n, s }) => n + ' ' + (s ? s.sameScore + '/' + s.cases + ' identical' : '?')).join('; ') + '; the WebAssembly module is ' + r.wasm.bytes + ' bytes, valid: ' + r.wasm.valid };
  },
  V3: (r) => {
    const f = r.substrates.f32, diffs = f ? f.labelDiffs : NaN, frac = f ? f.labelDiffs / f.cases : 1;
    const ok = f && f.labelDiffs <= Math.ceil(0.01 * f.cases) && f.allWithinOneStep === true;
    return { pass: ok, saw: 'single precision differed from the reference label on ' + diffs + ' of ' + (f ? f.cases : '?') + ' cases (' + (100 * frac).toFixed(3) + '%), every one within a single-precision step of the line: ' + (f ? f.allWithinOneStep : '?') };
  },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-14.mjs');
if (isMain) {
  const pre = read('data/organ-14/prereg.json'), rec = read('data/organ-14/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-14.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-14/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-14/verdict.json') !== text) { console.log('VERDICT DRIFT'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

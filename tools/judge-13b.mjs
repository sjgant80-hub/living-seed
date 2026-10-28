#!/usr/bin/env node
// tools/judge-13b.mjs — organ 13b (organ 13 at its exact scope) judged against the rules sealed before it ran.
//   --write → data/organ-13b/verdict.json      --check → refuse on drift. A failed prediction is kept.
// B3 reads data/organ-13b/tab.json: what a browser tab reported when box 20 took the travelling fingerprint on the page.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const say = (t) => Object.entries(t).map(([k, n]) => n + ' ' + k).join(', ');

export const RULES = {
  B1: (r) => {
    const d = r.doors;
    const ok = d.ask.bits === 8 * d.askBytes && same(d.ask.outcomes, { refused: d.ask.bits }) && d.answer.bits === 8 * d.answerBytes && same(d.answer.outcomes, { refused: d.answer.bits })
      && d.genuineAfter === 'verified' && d.credited === 1;
    return { pass: ok, saw: 'the ask, ' + d.askBytes + ' bytes: ' + d.ask.bits + ' one-bit changes at the organ’s door, ' + say(d.ask.outcomes) + '; its answer, ' + d.answerBytes + ' bytes: ' + d.answer.bits + ' at the keeper’s door, ' + say(d.answer.outcomes) + '; then the genuine answer ' + d.genuineAfter + ', credited ' + d.credited };
  },
  B2: (r) => {
    const i = r.imports, ok = i.files > 0 && i.sameFilesAsOrgan13 === true && i.outside.length === 0 && i.dynamic === 0;
    return { pass: ok, saw: i.files + ' files, the same as organ 13 followed: ' + i.sameFilesAsOrgan13 + '; modules from outside the repository: ' + (i.outside.join(', ') || 'none') + '; dynamic imports: ' + i.dynamic };
  },
  B3: (r, tab) => {
    if (!tab) return { pass: false, saw: 'not run in a tab yet' };
    const p = r.travel, f = tab.travel || {};
    const ok = ['organism', 'roster', 'shop', 'others', 'digest'].every((k) => same(f[k], p[k])) && p.shop.verified === p.shop.asked && p.others.verified === p.others.asked && typeof tab.seconds === 'number' && tab.seconds < 10;
    const part = (k, x) => (same((f[k] || {}).digest, x.digest) ? 'the same' : 'DIFFERENT') + ' (' + x.verified + '/' + x.asked + ' verified here)';
    return { pass: ok, saw: 'in ' + String(tab.browser) + ': travelling fingerprint ' + String(f.digest).slice(0, 16) + ' (this record: ' + p.digest.slice(0, 16) + '); organism ' + (f.organism === p.organism ? 'the same' : 'DIFFERENT') + ', roster ' + (f.roster === p.roster ? 'the same' : 'DIFFERENT') + ', the shop’s receipts ' + part('shop', p.shop) + ', what the other organs said ' + part('others', p.others) + '; in ' + tab.seconds + ' s' };
  },
};

export function judge(prereg, record, tab) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record, tab) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-13b.mjs');
if (isMain) {
  const pre = read('data/organ-13b/prereg.json'), rec = read('data/organ-13b/record.json');
  const tabText = existsSync(new URL('data/organ-13b/tab.json', ROOT)) ? read('data/organ-13b/tab.json') : null;
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec), tabText && JSON.parse(tabText));
  const text = JSON.stringify({ kind: 'living-seed.organ-13b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), tab: tabText ? sha256Hex(tabText).slice(0, 16) : null, verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-13b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-13b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

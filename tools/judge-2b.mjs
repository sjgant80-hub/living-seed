#!/usr/bin/env node
// tools/judge-2b.mjs — organ 2b, judged against the rules sealed before the model was asked.
//   --write → data/organ-2b/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export const RULES = {
  C1: (r) => ({ pass: r.sample.cases === 1200 && r.sample.overlapWithOrgan2 === 0 && r.sample.answered === 1200 && r.window.longestPrompt < r.window.numCtx && r.digestSameAsOrgan2,
    saw: r.sample.answered + ' of ' + r.sample.cases + ' new sessions answered, ' + r.sample.overlapWithOrgan2 + ' shared with organ 2’s sample; longest prompt ' + r.window.longestPrompt + ' tokens of a ' + r.window.numCtx + ' window; the same model as organ 2: ' + r.digestSameAsOrgan2 }),
  C2: (r) => ({ pass: r.fresh.leadLow95 > 0, saw: 'on the 1,200 new sessions: the organ AUC ' + r.fresh.organ + ', the 14B with 24 examples ' + r.fresh.model + '; the organ’s lead ' + r.fresh.lead + ', its 95% lower bound ' + r.fresh.leadLow95 }),
  C3: (r) => ({ pass: r.fresh.leadLow95 > -r.margin, saw: 'the organ is worse than the 14B by at most ' + Math.max(0, -r.fresh.leadLow95) + ' AUC at 95% (bound ' + r.fresh.leadLow95 + ' against −' + r.margin + ')' }),
  C4: (r) => ({ pass: Math.abs(r.fresh.model - 0.80645) <= 0.03 && Math.abs(r.fresh.organ - 0.8205) <= 0.03, saw: 'the 14B ' + r.fresh.model + ' (0.80645 on organ 2’s 300), the organ ' + r.fresh.organ + ' (0.8205)' }),
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-2b.mjs');
if (isMain) {
  const pre = read('data/organ-2b/prereg.json'), rec = read('data/organ-2b/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-2b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-2b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-2b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

#!/usr/bin/env node
// tools/judge-2c.mjs — organ 2c, judged against the rules sealed before any classical model scored a held-out session.
//   --write → data/organ-2c/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const NAMES = ['pageValues', 'logistic', 'boosted'];

export const RULES = {
  D1: (r) => ({ pass: r.split.fitted === 7605 && r.split.scored === 4725 && r.fittedOnTrainOnly === true && r.deterministic === true && NAMES.every((k) => r.models[k].finite === true) && r.organ.auc === r.organ.sealedInOrgan1,
    saw: 'fitted on ' + r.split.fitted + ' February–October sessions, scored on ' + r.split.scored + ' November–December; fitted on those alone (every held measurement and label scrambled, the same fit): ' + r.fittedOnTrainOnly + '; the same fit twice: ' + r.deterministic + '; every score finite: ' + NAMES.every((k) => r.models[k].finite) + '; the organ ' + r.organ.auc + ' (organ 1 sealed ' + r.organ.sealedInOrgan1 + ')' }),
  D2: (r) => ({ pass: r.models.pageValues.organLeadLow95 > 0, saw: 'PageValues alone ' + r.models.pageValues.auc + ', the organ ' + r.organ.auc + '; the organ’s lead ' + r.models.pageValues.organLead + ', its 95% lower bound ' + r.models.pageValues.organLeadLow95 }),
  D3: (r) => ({ pass: r.models.logistic.organLeadLow95 > -0.02, saw: 'logistic regression ' + r.models.logistic.auc + ', the organ ' + r.organ.auc + '; the organ’s lead ' + r.models.logistic.organLead + ', its 95% lower bound ' + r.models.logistic.organLeadLow95 + ' against −0.02' }),
  D4: (r) => ({ pass: r.models.boosted.organLeadLow95 > -0.05, saw: 'boosted trees ' + r.models.boosted.auc + ', the organ ' + r.organ.auc + '; the organ’s lead ' + r.models.boosted.organLead + ', its 95% lower bound ' + r.models.boosted.organLeadLow95 + ' against −0.05' }),
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-2c.mjs');
if (isMain) {
  const pre = read('data/organ-2c/prereg.json'), rec = read('data/organ-2c/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-2c.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-2c/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-2c/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

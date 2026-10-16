#!/usr/bin/env node
// tools/judge-9b.mjs — organ 9's behaviour watch, second attempt, judged against the rules sealed before it ran.
//   --write → data/organ-9b/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pc = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';

export const RULES = {
  J1: (r) => { const l = r.calibration.limits; return { pass: l.claims < 1, saw: 'limits from honest rounds alone (draw ' + r.calibration.draw + '): claims ' + l.claims + ' (honest rounds reached ' + r.calibration.top.claims + '), conduct ' + l.conduct + ' (reached ' + r.calibration.top.conduct + '), volume ' + l.volume }; },
  J2: (r) => { const t = r.organ9b.takeover.everyHonestCutBy; return { pass: t !== null && t <= r.takeoverAt + 1, saw: t === null ? 'not every honest node cut south off' + (r.organ9b.immune.cuts.length ? ' — cuts: ' + r.organ9b.immune.cuts.map((c) => 'round ' + c.round + ' ' + c.by + ' cut ' + c.of).join(', ') : ' — no cuts at all') : 'every honest node had cut south off by round ' + t + ' (taken over in round ' + r.takeoverAt + ')' }; },
  J3: (r) => { const a = r.reference.organ8.takeover.toSouth, b = r.organ9b.takeover.toSouth; return { pass: b <= 0.5 * a, saw: 'cases sent to south from round ' + r.takeoverAt + ': organ 8 ' + a + ', organ 9 ' + r.reference.organ9.takeover.toSouth + ', organ 9b ' + b + ' (' + pc(b, a) + ' of organ 8’s); honest south with no attacker was sent ' + r.quiet.takeover.toSouth }; },
  J4: (r) => { const a = r.organ9b.immune.falseCuts, q = r.quiet.immune.falseCuts; return { pass: a.length === 0 && q.length === 0, saw: 'honest peers cut off by behaviour: ' + a.length + ' under attack, ' + q.length + ' with no attacker' + [...a, ...q].slice(0, 4).map((c) => ' · round ' + c.round + ' ' + c.by + ' cut ' + c.of + ' (claims ' + c.claims + ', conduct ' + c.conduct + ', volume ' + c.volume + ')').join('') }; },
  J5: (r) => { const a = r.organ9b, q = r.quiet; return { pass: a.flood.admitted === 0 && a.immune.honestRevokedByProof === 0 && q.immune.honestRevokedByProof === 0 && a.immune.honestRefused === 0 && q.immune.honestRefused === 0 && a.immune.memoryMax <= r.cap && q.immune.memoryMax <= r.cap, saw: 'forgeries admitted ' + a.flood.admitted + ' of ' + a.flood.tried + '; honest keys revoked by a proof ' + a.immune.honestRevokedByProof + ', ' + q.immune.honestRevokedByProof + '; honest links refused by a node still trusting them ' + a.immune.honestRefused + ', ' + q.immune.honestRefused + '; largest memory ' + a.immune.memoryMax + ' (cap ' + r.cap + ')' }; },
  J6: (r) => { const a = r.organ9b, t = a.thief.everyHonestRevokedBy; return { pass: t !== null && t <= r.theftAt && a.flood.checked <= 0.1 * r.reference.organ8.flood.checked, saw: 'farm’s stolen key revoked by every honest node by round ' + t + '; forgeries checked ' + a.flood.checked + ' against organ 8’s ' + r.reference.organ8.flood.checked + ' (' + pc(a.flood.checked, r.reference.organ8.flood.checked) + ')' }; },
  J7: (r) => { const a = r.organ9b.tasks.rightCount, b = r.reference.organ9.tasks.rightCount; return { pass: a >= b - 10, saw: 'tasks answered right under the attacks: organ 8 ' + r.reference.organ8.tasks.rightCount + ', organ 9 ' + b + ', organ 9b ' + a + ' of ' + r.organ9b.tasks.total + '; organ 9b with no attacker ' + r.quiet.tasks.rightCount }; },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-9b.mjs');
if (isMain) {
  const pre = read('data/organ-9b/prereg.json'), rec = read('data/organ-9b/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-9b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-9b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-9b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

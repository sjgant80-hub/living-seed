#!/usr/bin/env node
// tools/judge-9.mjs — organ 9, judged against the rules sealed before it ran.
//   --write → data/organ-9/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pc = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';
const sum = (rs, f) => rs.reduce((a, r) => a + f(r), 0);

export const RULES = {
  I1: (r) => ({ pass: r.organ8.flood.admitted === 0 && r.organ9.flood.admitted === 0, saw: 'forgeries admitted: organ 8 ' + r.organ8.flood.admitted + ' of ' + r.organ8.flood.tried + ', organ 9 ' + r.organ9.flood.admitted + ' of ' + r.organ9.flood.tried }),
  I2: (r) => { const a = r.organ9.immune, q = r.quiet.immune; return { pass: a.honestRevokedByProof === 0 && q.honestRevokedByProof === 0 && a.honestRefused === 0 && q.honestRefused === 0, saw: 'honest keys revoked by a proof: ' + a.honestRevokedByProof + ' under attack, ' + q.honestRevokedByProof + ' with no attacker; most refusals of one honest node’s link by an honest node still trusting it: ' + a.honestRefused + ', ' + q.honestRefused }; },
  I3: (r) => { const a = r.organ9.immune.falseCuts, q = r.quiet.immune.falseCuts; return { pass: a.length === 0 && q.length === 0, saw: 'honest peers cut off by behaviour: ' + a.length + ' under attack, ' + q.length + ' with no attacker' + [...a, ...q].slice(0, 4).map((c) => ' · round ' + c.round + ' ' + c.by + ' cut ' + c.of + ' (drift ' + c.drift + ', volume ' + c.volume + ')').join('') + ' — limits from the calibration run: drift ' + r.calibration.limits.drift + ', volume ' + r.calibration.limits.volume }; },
  I4: (r) => ({ pass: r.organ9.immune.memoryMax <= r.cap && r.quiet.immune.memoryMax <= r.cap, saw: 'largest immune memory: organ 9 ' + r.organ9.immune.memoryMax + ' (cap ' + r.cap + '); organ 8, which has no cap, ' + r.organ8.immune.memoryMax }),
  I5: (r) => { const a = r.organ8.flood.checked, b = r.organ9.flood.checked; return { pass: b <= 0.1 * a, saw: 'forgeries whose signature was checked: organ 8 ' + a + ', organ 9 ' + b + ' (' + pc(b, a) + '); organ 9 refused ' + r.organ9.flood.rebound + ' at the rebound, unchecked; the attacker spent ' + r.organ9.flood.attackerHashes + ' hashes and stamped ' + r.organ9.flood.stamped }; },
  I6: (r) => ({ pass: r.organ9.flood.ratchet === true, saw: 'the work each link owed each node ' + (r.organ9.flood.ratchet ? 'never fell' : 'FELL') + ' from one flood round to the next' }),
  I7: (r) => { const t = r.organ9.thief.everyHonestRevokedBy; return { pass: t !== null && t <= r.attack.theftAt, saw: t === null ? 'not every honest node revoked farm’s key' : 'every honest node had revoked farm’s key by round ' + t + ' (stolen in round ' + r.attack.theftAt + ')' }; },
  I8: (r) => { const a = r.organ8.thief.blackHoled, b = r.organ9.thief.blackHoled; return { pass: a > 0 && b <= 0.2 * a, saw: 'tasks sent to farm’s key that never came back answered, from round ' + r.attack.theftAt + ': organ 8 ' + a + ' (of ' + r.organ8.thief.toFarm + ' sent), organ 9 ' + b + ' (of ' + r.organ9.thief.toFarm + ')' }; },
  I9: (r) => { const t = r.organ9.takeover.everyHonestCutBy; return { pass: t !== null && t <= r.attack.takeoverAt + 1, saw: t === null ? 'not every honest node cut south off' : 'every honest node had cut south off by round ' + t + ' (taken over in round ' + r.attack.takeoverAt + ')' }; },
  I10: (r) => { const a = r.organ8.takeover.toSouth, b = r.organ9.takeover.toSouth, q = r.quiet.takeover.toSouth; return { pass: a > q && b <= 0.5 * a, saw: 'cases sent to south from round ' + r.attack.takeoverAt + ': organ 8 ' + a + ', organ 9 ' + b + ' (' + pc(b, a) + '); honest south, with no attacker, was sent ' + q }; },
  I11: (r) => ({ pass: r.organ9.tasks.rightCount >= r.organ8.tasks.rightCount, saw: 'tasks answered right under the attacks: organ 8 ' + r.organ8.tasks.rightCount + ', organ 9 ' + r.organ9.tasks.rightCount + ' of ' + r.organ9.tasks.total + '; organ 9 with no attacker ' + r.quiet.tasks.rightCount }),
  I12: (r) => { const fl = r.organ9.rounds.filter((x) => x.round >= r.attack.floodFrom), first = sum(fl.slice(0, 5), (x) => x.flood.checked), last = sum(fl.slice(-5), (x) => x.flood.checked); return { pass: fl.length >= 10 && last <= 0.1 * first, saw: 'organ 9, forgeries checked: ' + first + ' in the flood’s first five rounds, ' + last + ' in its last five; organ 8 checked ' + sum(r.organ8.rounds.filter((x) => x.round >= r.attack.floodFrom).slice(-5), (x) => x.flood.checked) + ' in its last five' }; },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-9.mjs');
if (isMain) {
  const pre = read('data/organ-9/prereg.json'), rec = read('data/organ-9/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-9.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-9/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-9/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

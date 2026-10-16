#!/usr/bin/env node
// tools/judge-3.mjs — organ 3 (the gate) judged against the rules sealed before it was measured.
//   node tools/judge-3.mjs --write   → data/organ-3/verdict.json      node tools/judge-3.mjs --check → refuse on drift
// Rules as code, pinned by the seal. A failed property is red; a failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export const RULES = {
  G1: (r) => {
    const i = r.input, worst = Object.entries(i.attacks).filter(([, a]) => a.admitted > 0).map(([k]) => k);
    return { pass: i.legitAdmitted === i.legit && i.legit === 60 && i.breached === 0 && i.threw === 0 && i.nextStillAdmitted === true && Object.keys(i.attacks).length >= 10,
      saw: i.legitAdmitted + '/' + i.legit + ' legitimate messages admitted in order; ' + i.breached + ' of ' + i.attacksTried + ' attacks admitted across ' + Object.keys(i.attacks).length + ' families' + (worst.length ? ' (through: ' + worst.join('; ') + ')' : '') + '; ' + i.threw + ' throws; the next legitimate message ' + (i.nextStillAdmitted ? 'still admitted' : 'refused') };
  },
  G2: (r) => {
    const w = r.knowledge.weighings, adopted = w.filter((x) => x.adopt).map((x) => x.device + ' · ' + x.organism + ' · ' + x.lesson).sort();
    const expected = ['no-water · lacking-shop · shopper 21', 'no-water · lacking-shop · shopper 7', 'reference · lacking-shop · shopper 21', 'reference · lacking-shop · shopper 7'];
    return { pass: w.length === 30 && JSON.stringify(adopted) === JSON.stringify(expected), saw: adopted.length + ' of ' + w.length + ' lessons adopted: ' + (adopted.join(', ') || 'none') };
  },
  G3: (r) => {
    const L = r.replication.lineage, R = r.replication.refusals;
    const ok = L.length === 3 && L.every((g, k) => g.namesParent && g.live === 4 && g.sameRecipes && g.gate === (61 + k) / 100) && R.length === 8 && R.every((x) => !x.sealed) && r.replication.provenOrgansFromANoisyDevice === true;
    return { pass: ok, saw: L.length + ' generations, each naming its parent, ' + L.map((g) => g.live + ' live at bar ' + g.gate).join(' → ') + '; ' + R.filter((x) => !x.sealed).length + '/' + R.length + ' forbidden children refused; proven organs from a noisy device ' + (r.replication.provenOrgansFromANoisyDevice ? 'passed on' : 'refused') };
  },
  G4: (r) => {
    const tried = r.input.attacks['every one-character change to a valid next message'].tried + r.input.attacks['random damage — truncations, insertions, deletions, repeats'].tried;
    return { pass: r.immune.knownAgain === tried && r.immune.remembered > 0 && r.immune.remembered <= tried, saw: r.immune.knownAgain + '/' + tried + ' refused inputs known again on sight, from ' + r.immune.remembered + ' distinct fingerprints' };
  },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-3.mjs');
if (isMain) {
  const pre = read('data/organ-3/prereg.json'), rec = read('data/organ-3/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-3.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-3/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-3/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

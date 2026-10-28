#!/usr/bin/env node
// tools/judge-13.mjs — organ 13 (the seed grows the whole system) judged against the rules sealed before it ran.
//   --write → data/organ-13/verdict.json      --check → refuse on drift. A failed prediction is kept.
// S7 reads data/organ-13/tab.json: what a browser tab reported when it grew the same system on the page.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const D = ['shopper', 'triage', 'water', 'crop'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const only = (t, key, n) => same(t, { [key]: n });
const say = (t) => Object.entries(t).map(([k, n]) => n + ' ' + k).join(', ');

export const RULES = {
  S1: (r) => {
    const s = r.system, ok = r.genome.bytes <= 2048 && r.genome.sameAsOrgan1 === true && same(s.plan.live, D) && same(s.nodes, ['keeper', ...D]) && s.roster.members === 5 && s.everyPinsEvery === true
      && r.offline.networkTouched === 0 && r.offline.imports.network.length === 0;
    return { pass: ok, saw: 'a ' + r.genome.bytes + '-byte genome (organ 1’s: ' + r.genome.sameAsOrgan1 + ') grew organism ' + s.organism + ' and ' + s.nodes.length + ' nodes (' + s.nodes.join(', ') + '); the founder’s roster names ' + s.roster.members + '; every node pins every other: ' + s.everyPinsEvery + '; network touched ' + r.offline.networkTouched + ' times; ' + r.offline.imports.files + ' files loaded, network modules named: ' + (r.offline.imports.network.join(', ') || 'none') };
  },
  S2: (r) => {
    const rows = D.map((d) => ({ d, ...r.asked[d] }));
    const total = rows.reduce((a, x) => a + x.held, 0);
    const ok = rows.every((x) => only(x.outcomes, 'verified', x.held) && x.sameAsOrganism === x.held && x.auc === x.heldAuc) && r.system.credited === total;
    return { pass: ok, saw: rows.map((x) => x.d + ': ' + say(x.outcomes) + ' of ' + x.held + ', ' + x.sameAsOrganism + ' the organism’s own answer, AUC ' + x.auc + ' (held ' + x.heldAuc + ')').join('; ') + '; the keeper’s ledger credits ' + r.system.credited + ' of ' + total };
  },
  S3: (r) => {
    const n = r.hostile.noisy, w = r.hostile.dry, g = r.refusedGenome;
    const ok = same(n.plan.cut, ['shopper']) && same(n.nodes, ['keeper', 'triage', 'water', 'crop']) && n.roster.members === 4 && /^refused: /.test(n.ask)
      && same(w.plan.dormant, ['water']) && same(w.nodes, ['keeper', 'shopper', 'triage', 'crop']) && w.roster.members === 4 && /^refused: /.test(w.ask)
      && g.ok === false && /^the genome was refused: /.test(g.why) && g.grew.length === 0;
    return { pass: ok, saw: 'noisy shop: cut ' + (n.plan.cut.join(', ') || 'none') + ', nodes ' + n.nodes.join(', ') + ', asking the shop ' + n.ask + '; no water: dormant ' + (w.plan.dormant.join(', ') || 'none') + ', nodes ' + w.nodes.join(', ') + ', asking water ' + w.ask + '; a changed genome: ' + g.why + ', grew ' + (g.grew.join(', ') || 'nothing') };
  },
  S4: (r) => {
    const t = r.tamper;
    const sum = (x) => Object.values(x).reduce((a, n) => a + n, 0);
    const ok = t.genome.positions > 0 && sum(t.genome.reasons) === t.genome.positions && !('GREW' in t.genome.reasons)
      && t.roster.positions > 0 && sum(t.roster.reasons) === t.roster.positions && !('READ' in t.roster.reasons) && only(t.ask.outcomes, 'refused', t.ask.bits) && only(t.answer.outcomes, 'refused', t.answer.bits)
      && t.genuineAfter === 'verified' && t.credited === 1 && t.replayAsk === 'refused' && t.replayAnswer === 'refused';
    return { pass: ok, saw: 'genome, ' + t.genome.positions + ' one-character changes: ' + say(t.genome.reasons) + '; roster, ' + t.roster.positions + ': ' + say(t.roster.reasons) + '; ask, ' + t.ask.bits + ' one-bit changes at the organ’s door: ' + say(t.ask.outcomes) + '; answer, ' + t.answer.bits + ' at the keeper’s door: ' + say(t.answer.outcomes) + '; then the genuine answer: ' + t.genuineAfter + ' (credited ' + t.credited + '); replayed ask ' + t.replayAsk + ', replayed answer ' + t.replayAnswer };
  },
  S5: (r) => {
    const { liar, stale } = r.lies;
    const ok = only(liar.outcomes, 'failed', liar.told) && liar.credited === 0 && only(stale.outcomes, 'failed', stale.told) && stale.credited === 0;
    return { pass: ok, saw: 'the liar with the triage organ’s key: ' + say(liar.outcomes) + ' of ' + liar.told + ', credited ' + liar.credited + '; the stale organ with the child’s shop key: ' + say(stale.outcomes) + ' of ' + stale.told + ', credited ' + stale.credited };
  },
  S6: (r) => {
    const b = r.bred, a = b.shopAuc;
    const ok = b.sameChildAsOrgan5 === true && same(b.parents, [b.origin, b.evolved]) && same(b.nodes, ['keeper', ...D]) && b.roster.members === 5 && b.everyPinsEvery === true
      && D.every((d) => only(b.asked[d], 'verified', Object.values(b.asked[d]).reduce((x, y) => x + y, 0))) && !b.parentOrganisms.includes(b.organism) && a.child >= Math.max(a.origin, a.evolved);
    return { pass: ok, saw: 'child ' + b.child + ' (organ 5’s: ' + b.sameChildAsOrgan5 + ') names ' + b.parents.join(' + ') + '; its system: ' + b.nodes.join(', ') + ', every node pins every other: ' + b.everyPinsEvery + '; through its mesh ' + D.map((d) => d + ' ' + say(b.asked[d])).join(', ') + '; organism ' + b.organism + ' (parents ' + b.parentOrganisms.join(', ') + '); shop AUC child ' + a.child + ', origin ' + a.origin + ', evolved ' + a.evolved + '; same node keys as the parent’s system: ' + b.sameKeys };
  },
  S7: (r, tab) => {
    if (!tab) return { pass: false, saw: 'not run in a tab yet' };
    const p = r.portable, f = tab.fingerprint || {};
    const ok = ['organism', 'roster', 'answers', 'digest', 'asked', 'verified'].every((k) => f[k] === p[k]) && p.verified === p.asked && typeof tab.seconds === 'number' && tab.seconds < 10;
    return { pass: ok, saw: 'in ' + String(tab.browser) + ': fingerprint ' + String(f.digest).slice(0, 16) + ' (this record: ' + p.digest.slice(0, 16) + '), organism ' + f.organism + ', ' + f.verified + '/' + f.asked + ' asks verified through its mesh, grown and asked in ' + tab.seconds + ' s' };
  },
};

export function judge(prereg, record, tab) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record, tab) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-13.mjs');
if (isMain) {
  const pre = read('data/organ-13/prereg.json'), rec = read('data/organ-13/record.json');
  const tabText = existsSync(new URL('data/organ-13/tab.json', ROOT)) ? read('data/organ-13/tab.json') : null;
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec), tabText && JSON.parse(tabText));
  const text = JSON.stringify({ kind: 'living-seed.organ-13.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), tab: tabText ? sha256Hex(tabText).slice(0, 16) : null, verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-13/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-13/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

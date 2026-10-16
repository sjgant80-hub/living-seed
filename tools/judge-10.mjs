#!/usr/bin/env node
// tools/judge-10.mjs — organ 10, judged against the rules sealed before it ran.
//   --write → data/organ-10/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pc = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';
const lives = (r) => ['shop', 'calm', 'flip'].flatMap((s) => ['audited', 'still', 'blind'].map((w) => [s + ' · ' + w, r[s][w]]));
const downs = (life) => life.events.filter((e) => e.kind === 'stand-down');
const backs = (life) => life.events.filter((e) => e.kind === 'return');

export const RULES = {
  T1: (r) => { const bad = lives(r).filter(([, l]) => !l.chain).map(([n]) => n); return { pass: !bad.length && r.replay.identical, saw: 'ledgers whose links all hold: ' + (9 - bad.length) + ' of 9' + (bad.length ? ' (not: ' + bad.join(', ') + ')' : '') + '; the shop life replayed from nothing: ' + (r.replay.identical ? 'the same head, ' + r.replay.head : 'a DIFFERENT head') }; },
  T2: (r) => { const c = r.tamper.caught, n = r.tamper.tried; return { pass: n > 0 && c.changed === n && c.dropped === n && c.swapped === n && c.rewritten === n, saw: 'of ' + n + ' acts tampered with: changed caught ' + c.changed + ', dropped ' + c.dropped + ', swapped ' + c.swapped + ', rewritten with every later link re-made ' + c.rewritten + ' (by the replay)' }; },
  T3: (r) => ({ pass: r.unproven.length > 0 && r.unproven.every((u) => u.refused), saw: r.unproven.map((u) => u.what + ': ' + (u.refused ? 'refused — ' + u.why : 'ALLOWED')).join('; ') }),
  T4: (r) => { const a = r.calm.audited; return { pass: downs(a).length === 0, saw: 'stand-downs on the streams with no drift: ' + downs(a).length + ' (' + a.answered + ' answers; ' + pc(a.right, a.answered) + ' right)' }; },
  T5: (r) => { const a = r.flip.audited, d = downs(a).find((e) => e.at >= r.flip.at); return { pass: Boolean(d) && d.at - r.flip.at <= 250 && !backs(a).some((e) => e.at >= r.flip.at), saw: d ? 'the ' + r.flip.domain + ' organ stood down ' + (d.at - r.flip.at) + ' cases after the reversal (its window: ' + d.accuracy + ' against a claim of ' + d.claim + '); returns after it: ' + backs(a).filter((e) => e.at >= r.flip.at).length : 'it never stood down after the reversal' }; },
  T6: (r) => { const w = r.flip.wrongAfter; return { pass: w.audited <= 0.3 * w.blind, saw: 'answered wrong after the reversal: audited ' + w.audited + ', without regrowing ' + w.still + ', not audited ' + w.blind + ' (' + pc(w.audited, w.blind) + ')' }; },
  T7: (r) => { const a = r.shop.audited, d = downs(a); return { pass: d.length > 0, saw: d.length ? 'on the real shop months the shop organ stood down ' + d.length + ' time(s): ' + d.map((e) => 'at case ' + e.at + ' (window ' + e.accuracy + ' against its claim ' + e.claim + ')').join(', ') : 'it never stood down on the real shop months' }; },
  T8: (r) => { const a = r.shop.audited, d = downs(a)[0], b = d && backs(a).find((e) => e.at > d.at); return { pass: Boolean(b), saw: !d ? 'it never stood down, so nothing to return from' : b ? 'a regrown shop organ returned at case ' + b.at + ' (AUC ' + b.heldAuc + ' on its newest cases; it claims ' + b.claim + ')' : 'no regrown organ cleared the gate before the stream ended' }; },
  T9: (r) => { const a = r.shop.audited, b = r.shop.blind, pa = a.right / a.answered, pb = b.right / b.answered; return { pass: pa > pb && a.right >= 0.8 * b.right, saw: 'the real shop months — audited: ' + a.right + ' right of ' + a.answered + ' answered (' + pc(a.right, a.answered) + '); not audited: ' + b.right + ' of ' + b.answered + ' (' + pc(b.right, b.answered) + '); right answers kept ' + pc(a.right, b.right) }; },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-10.mjs');
if (isMain) {
  const pre = read('data/organ-10/prereg.json'), rec = read('data/organ-10/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-10.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-10/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-10/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

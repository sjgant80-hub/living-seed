#!/usr/bin/env node
// tools/judge-10b.mjs — organ 10's self-audit, second attempt, judged against the rules sealed before it ran.
//   --write → data/organ-10b/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pc = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';
const of = (life, kind) => life.events.filter((e) => e.kind === kind);

export const RULES = {
  W1: (r) => { const ls = [r.shop.audited, r.shop.blind, r.calm, r.flip.audited, r.flip.organ10, r.flip.blind]; return { pass: ls.every((l) => l.chain) && r.replay.identical, saw: 'ledgers whose links hold: ' + ls.filter((l) => l.chain).length + ' of ' + ls.length + '; the shop life replayed from nothing: ' + (r.replay.identical ? 'the same head, ' + r.replay.head : 'a DIFFERENT head') }; },
  W2: (r) => ({ pass: r.unproven.length > 0 && r.unproven.every((u) => u.refused), saw: r.unproven.map((u) => u.what + ': ' + (u.refused ? 'refused — ' + u.why : 'ALLOWED')).join('; ') }),
  W3: (r) => ({ pass: r.calm.events.length === 0, saw: 'on the streams with no drift: ' + of(r.calm, 'stand-down').length + ' stand-downs, ' + of(r.calm, 'reclaim').length + ' claims lowered (' + r.calm.answered + ' answers)' }),
  W4: (r) => { const d = of(r.flip.audited, 'stand-down').find((e) => e.at >= r.reversal.at); return { pass: Boolean(d) && d.window === 50 && d.at - r.reversal.at <= 60, saw: d ? 'the ' + r.reversal.domain + ' organ stood down ' + (d.at - r.reversal.at) + ' cases after the reversal (case ' + r.reversal.at + '), by the ' + d.window + '-answer window (' + d.accuracy + ' against ' + d.claim + ')' : 'it never stood down after the reversal' }; },
  W5: (r) => { const w = r.flip.wrongAfter; return { pass: w.audited <= 0.3 * w.blind, saw: 'answered wrong after the reversal: 10b ' + w.audited + ', organ 10 ' + w.organ10 + ', not audited ' + w.blind + ' (10b: ' + pc(w.audited, w.blind) + ')' }; },
  W6: (r) => { const a = r.shop.audited; return { pass: of(a, 'reclaim').length > 0 && of(a, 'stand-down').length === 0, saw: 'on the real shop months: ' + of(a, 'reclaim').map((e) => 'claim lowered ' + e.from + ' → ' + e.to + ' at case ' + e.at + ' (' + e.window + ' answers)').join('; ') + (of(a, 'reclaim').length ? '' : 'no claim lowered') + '; stand-downs ' + of(a, 'stand-down').length }; },
  W7: (r) => { const first = of(r.shop.audited, 'reclaim')[0], ms = r.shop.months.audited, ks = []; let k = 0; for (const m of ms) { k += m.cases; ks.push(k - 1); } const after = first ? ms.filter((m, i) => ks[i] >= first.at) : []; const blindOver = r.shop.months.blind.filter((m) => m.over > 0.03).length; return { pass: Boolean(first) && after.length > 0 && after.every((m) => m.over <= 0.03) && blindOver >= 3, saw: 'claim at each month’s end against what that month delivered — 10b: ' + ms.map((m) => m.month + ' ' + m.claimAtEnd + ' vs ' + m.delivered).join(', ') + '; not audited, months over-claimed by more than 3 points: ' + blindOver }; },
  W8: (r) => { const a = r.shop.audited, b = r.shop.blind; return { pass: a.right === b.right && a.answered === b.answered, saw: 'the real shop months: 10b answered ' + a.answered + ', ' + a.right + ' right; not audited ' + b.answered + ', ' + b.right + ' right — lowering a claim changes what it says about its answers, not the answers' }; },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-10b.mjs');
if (isMain) {
  const pre = read('data/organ-10b/prereg.json'), rec = read('data/organ-10b/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-10b.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-10b/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-10b/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

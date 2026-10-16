#!/usr/bin/env node
// tools/judge-11.mjs — organ 11, the full organism, judged against the rules sealed before it ran.
//   --write → data/organ-11/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const lives = (r) => [['A, August–September', r.live], ['A’s child, November–December', r.liveOn.child], ['A’s parent, November–December', r.liveOn.parent], ['B’s child, November–December', r.spread.child], ['B’s origin, November–December', r.spread.origin]];

export const RULES = {
  K1: (r) => { const steps = [['the card booted under A’s trust', r.seed.ok], ['every life’s ledger holds', lives(r).every(([, l]) => l.chain)], ['A sealed a child', r.improve.ok], ['the child opens and names its parent', r.improve.opened && r.improve.parents && r.improve.parents[0] === r.improve.parent], ['the child became a card', r.reproduce.ok], ['B booted the card, trusting A', r.spread.booted && r.spread.id === r.improve.child], ['B grew it on its own data', Array.isArray(r.spread.organs)]];
    return { pass: steps.every(([, ok]) => ok), saw: steps.map(([w, ok]) => w + (ok ? ' ✓' : ' ✗')).join('; ') }; },
  K2: (r) => { const m = r.memory, t = Object.entries(m.tampered); return { pass: m.woke && m.wokeHead === m.head && m.same && t.length > 0 && t.every(([, v]) => !v.woke), saw: 'woke from ' + m.bytes + ' bytes of signed memory (' + m.cases + ' cases) at ' + (m.wokeHead === m.head ? 'the same head' : 'a DIFFERENT head') + '; carrying on through October ' + (m.same ? 'equals' : 'DIFFERS from') + ' never having stopped; tampered memories: ' + t.map(([k, v]) => k + ' — ' + (v.woke ? 'WOKE' : 'refused (' + v.why + ')')).join('; ') }; },
  K3: (r) => ({ pass: r.spread.refusedWithoutTrust, saw: 'B with A missing from its trust: ' + (r.spread.refusedWithoutTrust ? 'refused — ' + r.spread.refusal : 'it BOOTED') }),
  K4: (r) => { const a = r.improve.organs.filter((o) => o.adopted); return { pass: a.length > 0, saw: r.improve.organs.map((o) => o.domain + (o.adopted ? ' adopted ' + o.from + ' → ' + o.to : ' kept (' + o.from + (o.candidate === null || o.candidate === undefined ? '' : '; best candidate ' + o.candidate) + ')')).join('; ') }; },
  K5: (r) => { const c = r.liveOn.child, p = r.liveOn.parent; return { pass: c.auc >= p.auc, saw: 'A’s November–December (' + r.liveOn.cases + ' real sessions): the child AUC ' + c.auc + ', ' + c.right + ' of ' + c.answered + ' right; the parent AUC ' + p.auc + ', ' + p.right + ' of ' + p.answered + '; the origin regrown on the same history AUC ' + r.liveOn.regrown.auc }; },
  K6: (r) => { const os = r.spread.organs || []; return { pass: os.length > 0 && os.every((o) => o.state === 'live'), saw: 'on B: ' + os.map((o) => o.domain + ' ' + o.state + ' (' + o.heldAuc + ')').join(', ') }; },
  K7: (r) => { const c = r.spread.child, o = r.spread.origin; return { pass: c.auc >= o.auc, saw: 'B’s November–December (' + r.spread.cases + ' real sessions, never seen by A): the child AUC ' + c.auc + ', ' + c.right + ' of ' + c.answered + ' right; the origin on the same data AUC ' + o.auc + ', ' + o.right + ' of ' + o.answered }; },
  K8: (r) => { const ends = [['A', r.liveOn.child], ['B', r.spread.child]].map(([d, l]) => ({ d, claim: l.final.live.shopper, delivered: l.accuracy, down: l.final.down.includes('shopper') })); return { pass: ends.every((e) => !e.down && e.claim !== undefined && e.claim - e.delivered <= 0.03), saw: ends.map((e) => e.d + ': claim at the end ' + e.claim + ', delivered ' + e.delivered + (e.down ? ', STOOD DOWN' : '')).join('; ') }; },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-11.mjs');
if (isMain) {
  const pre = read('data/organ-11/prereg.json'), rec = read('data/organ-11/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-11.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-11/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-11/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

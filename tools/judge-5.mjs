#!/usr/bin/env node
// tools/judge-5.mjs — organ 5 (breeding and the card) judged against the rules sealed before it ran.
//   --write → data/organ-5/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const D = ['shopper', 'triage', 'water', 'crop'];

export const RULES = {
  C1: (r) => {
    const c = Object.entries(r.cards);
    return { pass: c.length === 4 && c.every(([, x]) => x.roundTrip && x.deterministic && x.bytes <= 200000), saw: c.map(([k, x]) => k + ' ' + x.bytes + ' B ' + (x.roundTrip ? 'round-trips' : 'LOST') + (x.deterministic ? ', same bytes twice' : ', differs')).join('; ') };
  },
  C2: (r) => {
    const a = r.attacks;
    return { pass: a.flipsRefused === a.flips && a.forgedRefused === a.forged && a.truncRefused === a.truncations && a.recompressedOpens === true,
      saw: a.flipsRefused + '/' + a.flips + ' damaged cards refused; ' + a.forgedRefused + '/' + a.forged + ' re-wrapped forgeries refused by the seal; ' + a.truncRefused + '/' + a.truncations + ' truncations refused; re-compressed by another tool ' + (a.recompressedOpens ? 'still opens' : 'does not open') };
  },
  C3: (r) => ({ pass: r.child.live === 4 && r.child.dropped.length === 0, saw: 'the child carries ' + r.child.live + ' live organs, dropped ' + (r.child.dropped.map((d) => d.domain).join(', ') || 'none') + '; crossed ' + r.child.crossed.join(', ') }),
  C4: (r) => {
    const p = r.parents.heldAuc, c = r.child.heldAuc;
    const rows = D.map((d) => ({ d, c: c[d], lo: Math.min(p.origin[d], p.evolved[d]), hi: Math.max(p.origin[d], p.evolved[d]) }));
    const ok = rows.every((x) => typeof x.c === 'number' && x.c >= x.lo - 0.005) && rows.some((x) => typeof x.c === 'number' && x.c >= x.hi);
    return { pass: ok, saw: rows.map((x) => x.d + ' child ' + x.c + ' (parents ' + x.lo + '–' + x.hi + ')').join('; ') + ' on unseen cases' };
  },
  C5: (r) => {
    const h = r.hostile, ok = JSON.stringify(h.noisy.dropped.map((d) => d.domain)) === '["shopper"]' && h.noisy.carried === 3 && /^cut: /.test(h.noisy.dropped[0].why)
      && JSON.stringify(h.dry.dropped.map((d) => d.domain)) === '["water"]' && h.dry.carried === 3 && /^dormant: /.test(h.dry.dropped[0].why);
    return { pass: ok, saw: 'noisy shop: dropped ' + h.noisy.dropped.map((d) => d.domain + ' (' + d.why.split(':')[0] + ')').join(', ') + ', carries ' + h.noisy.carried + '; no water: dropped ' + h.dry.dropped.map((d) => d.domain + ' (' + d.why.split(':')[0] + ')').join(', ') + ', carries ' + h.dry.carried };
  },
  C6: (r) => {
    const t = r.trade;
    return { pass: t.sameGenome && t.organismA !== t.organismB && t.untrusted === 'the genome in the card was refused: untrusted maker', saw: 'the same genome opened on both devices: ' + t.sameGenome + '; organisms ' + t.organismA + ' and ' + t.organismB + '; under a stranger’s trust list: ' + t.untrusted };
  },
  C7: (r) => ({ pass: r.trade.liveA === r.child.live && r.trade.liveB === r.child.live, saw: 'live on device A: ' + r.trade.liveA + ', on device B: ' + r.trade.liveB + ', of ' + r.child.live }),
  C8: (r) => {
    const ok = JSON.stringify(r.child.parents) === JSON.stringify([r.parents.origin, r.parents.evolved]) && r.child.gate === 0.6 && JSON.stringify(r.parents.evolvedParents) === JSON.stringify([r.parents.origin]) && JSON.stringify(r.grandchild.parents) === JSON.stringify([r.child.id, r.parents.origin]) && r.grandchild.live === r.grandchild.carried;
    return { pass: ok, saw: 'evolved ← origin; child ← origin + evolved at bar ' + r.child.gate + '; grandchild ← child + origin, ' + r.grandchild.live + '/' + r.grandchild.carried + ' live' };
  },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-5.mjs');
if (isMain) {
  const pre = read('data/organ-5/prereg.json'), rec = read('data/organ-5/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-5.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-5/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-5/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}

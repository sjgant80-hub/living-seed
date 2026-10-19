#!/usr/bin/env node
// tools/night.mjs — receipt (a): does the organism improve on its own hardware? One sealed night at a time.
//
// Each night starts from the champion the night before left (night 1: organ 1's origin genome). The organism evolves
// every organ on device A's own labelled history (organ 11's device: the even real shop sessions, February–May +
// August–September), blind to October; the gate adopts a candidate only if it beats the organ it would replace on
// October by the margin AND by Z standard errors of that organ's own October AUC — a gain larger than the noise. The
// champion moves only to a child the gate adopted. Both are then scored on November–December, which never steers a
// choice: the organism cannot learn its way to that score, so it says whether a night really made it better.
//
//   node tools/night.mjs seal <n>              → data/nights/<n>/prereg.json   (commit + push it before running)
//   node tools/night.mjs run <n> [--check]     → data/nights/<n>/record.json
//   node tools/night.mjs judge <n> [--write|--check] → data/nights/<n>/verdict.json
// Deterministic: a night's seed is 100 + n.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as O from '../src/organism.mjs';
import * as A from '../src/align.mjs';
import { open } from '../src/genome.mjs';
import { auc } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { fileHash } from './judge.mjs';
import { GENOME, MONTH } from './measure-10.mjs';
import { key, months, device, stream } from './measure-11.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
export const Z = 2, EVOLVE = { generations: 30, children: 8, folds: 3 }, WEEK = 7;
/** night 1 judged a candidate on October pooled; it adopted a gain the holiday months undid. From night 2 the gate is
 *  time-folded: the shop candidate is evolved on February–May and must beat the champion on August, September and
 *  October, each on its own, by the margin and Z standard errors of that month's AUC. */
export const METHOD = (n) => (n === 1 ? 'pooled' : 'time-folds'), SLICES = ['Aug', 'Sep', 'Oct'];
const dir = (n) => 'data/nights/' + n + '/';
const PINNED = ['src/organism.mjs', 'src/align.mjs', 'src/evolve.mjs', 'src/germinate.mjs', 'src/body.mjs', 'src/genome.mjs', 'vendor/seed-library/seedlib.mjs',
  'vendor/seed-library/domains.mjs', 'data/online_shoppers_intention.csv', 'data/record.json', 'tools/night.mjs', 'tools/measure-11.mjs', 'tools/measure-10.mjs', 'tools/judge.mjs'];

/** the champion a night starts from: the origin for night 1, else what the night before left */
const startOf = (n) => (n === 1 ? GENOME : JSON.parse(read(dir(n - 1) + 'record.json')).after.genome);

export function prereg(n) {
  const rules = [
    { id: 'N1', kind: 'property', claim: 'the night starts from the champion ' + (n === 1 ? 'the origin genome is' : 'night ' + (n - 1) + ' left') },
    { id: 'N2', kind: 'property', claim: METHOD(n) === 'pooled' ? 'the champion moves only to a child the noise-aware gate adopted' : 'the champion moves only to a child the time-fold gate adopted (the shop candidate beating it on August, September and October, each on its own, by the margin and ' + Z + ' standard errors)' },
    { id: 'N3', kind: 'prediction', claim: 'the champion after tonight scores no lower on November–December (never used to choose) than the champion before it' },
  ];
  if (n >= WEEK) rules.push({ id: 'N4', kind: 'prediction', claim: 'over the week, the champion improved: after night ' + n + ' it scores higher on November–December than the origin genome did before night 1' });
  return { kind: 'living-seed.night.prereg', v: 1, night: n, seed: 100 + n, z: Z, evolve: EVOLVE, ...(METHOD(n) === 'pooled' ? {} : { method: METHOD(n), slices: SLICES }), rules,
    files: Object.fromEntries([...PINNED, ...(n > 1 ? [dir(n - 1) + 'record.json'] : [])].map((p) => { const b = readFileSync(new URL(p, ROOT)); if (b.includes(13)) throw new Error(p + ' holds a carriage return'); return [p, fileHash(b)]; })) };
}

export async function record(n) {
  const maker = await key('origin'), devA = await key('device-a-11'), trust = [maker.pub, devA.pub];
  const hist = device(0, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') }), final = stream(0, 'Nov', 'Dec');
  const before = startOf(n);
  let r;
  if (METHOD(n) === 'pooled') r = await O.improve(before, hist, devA, { trust, evolve: { ...EVOLVE, seed: 100 + n }, z: Z });
  else {   // the time-fold gate: evolve on February–May, judge on each later month on its own
    const gate = device(0, { train: months('Feb', 'Mar', 'May'), held: months(...SLICES) });
    r = await O.improve(before, gate, devA, { trust, evolve: { ...EVOLVE, seed: 100 + n }, z: Z, slices: { shopper: SLICES.map((m) => gate.data.shopper.heldRows.filter((i) => MONTH[i] === m)) } });
  }
  const adopted = r.organs.some((o) => o.adopted), after = adopted ? r.child : before;
  const score = async (g) => { const l = await A.life(g, hist, final, { checks: A.CHECKS }), ans = l.ledger.filter((e) => e.act.kind === 'answer'); return { id: (await open(g)).id, finalAuc: auc(ans.map((e) => e.act.receipt.score), ans.map((e) => final[e.act.at].truth)), right: l.right, answered: l.answered }; };
  return { kind: 'living-seed.night.record', v: 1, night: n, seed: 100 + n, z: Z, ...(METHOD(n) === 'pooled' ? {} : { method: METHOD(n) }), origin: (await open(GENOME)).id,
    previous: n === 1 ? null : JSON.parse(read(dir(n - 1) + 'record.json')).after.id,
    before: await score(before), organs: r.organs, adopted, child: r.id, after: { ...(await score(after)), genome: after } };
}

export const RULES = {
  N1: (r) => { const want = r.night === 1 ? r.origin : r.previous; return { pass: r.before.id === want, saw: 'started from ' + r.before.id + (r.night === 1 ? ' (the origin genome)' : ' (night ' + (r.night - 1) + ' left ' + r.previous + ')') }; },
  N2: (r) => ({ pass: r.adopted ? r.after.id === r.child : r.after.id === r.before.id, saw: (r.adopted ? 'the gate adopted ' + r.organs.filter((o) => o.adopted).map((o) => o.domain + ' ' + o.from + ' → ' + o.to).join(', ') + '; the champion is now ' + r.after.id : 'the gate adopted nothing — ' + r.organs.map((o) => o.domain + (o.slices ? ' (by month: ' + o.slices.map((s, k) => SLICES[k] + ' ' + s.candidate + ' vs ' + s.mine).join(', ') + ')' : o.candidate === null || o.candidate === undefined ? '' : ' best ' + o.candidate + ' vs ' + o.from)).join(', ') + '; the champion stays ' + r.after.id) }),
  N3: (r) => ({ pass: r.after.finalAuc >= r.before.finalAuc, saw: 'November–December: before ' + r.before.finalAuc + ', after ' + r.after.finalAuc }),
  N4: (r, first) => ({ pass: Boolean(first) && r.after.finalAuc > first.before.finalAuc, saw: 'the origin before night 1: ' + (first ? first.before.finalAuc : '—') + '; the champion after night ' + r.night + ': ' + r.after.finalAuc }),
};

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/night.mjs');
if (isMain) {
  const [cmd, arg] = process.argv.slice(2), n = Number(arg);
  if (!Number.isSafeInteger(n) || n < 1) { console.log('usage: node tools/night.mjs seal|run|judge <night ≥ 1>'); process.exit(2); }
  mkdirSync(new URL(dir(n), ROOT), { recursive: true });
  if (cmd === 'seal') {
    if (existsSync(new URL(dir(n) + 'prereg.json', ROOT))) { console.log('REFUSED · night ' + n + ' is already sealed'); process.exit(1); }
    writeFileSync(new URL(dir(n) + 'prereg.json', ROOT), JSON.stringify(prereg(n), null, 1) + '\n');
    console.log('sealed night ' + n + ' · seed ' + (100 + n) + ' · z ' + Z);
  } else if (cmd === 'run') {
    const text = JSON.stringify(await record(n), null, 1) + '\n';
    if (process.argv.includes('--check')) { const c = read(dir(n) + 'record.json'); if (c !== text) { console.log('RECORD MISMATCH · night ' + n); process.exit(1); } console.log('RECORD REPRODUCED · night ' + n + ' · ' + sha256Hex(text).slice(0, 16)); }
    else { writeFileSync(new URL(dir(n) + 'record.json', ROOT), text); console.log('wrote night ' + n + ' · ' + sha256Hex(text).slice(0, 16)); }
  } else if (cmd === 'judge') {
    const pre = read(dir(n) + 'prereg.json'), rec = read(dir(n) + 'record.json'), r = JSON.parse(rec), first = n > 1 ? JSON.parse(read(dir(1) + 'record.json')) : r;
    const verdicts = JSON.parse(pre).rules.map((rule) => { let v; try { v = RULES[rule.id](r, first); } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; } return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw }; });
    const text = JSON.stringify({ kind: 'living-seed.night.verdict', v: 1, night: n, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
    let red = 0;
    for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
    if (process.argv.includes('--write')) writeFileSync(new URL(dir(n) + 'verdict.json', ROOT), text);
    if (process.argv.includes('--check') && read(dir(n) + 'verdict.json') !== text) { console.log('VERDICT DRIFT · night ' + n); red++; }
    const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
    console.log((red ? 'RED · ' : 'JUDGED · ') + 'night ' + n + ' · ' + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
    process.exit(red ? 1 : 0);
  } else { console.log('usage: node tools/night.mjs seal|run|judge <night ≥ 1>'); process.exit(2); }
}

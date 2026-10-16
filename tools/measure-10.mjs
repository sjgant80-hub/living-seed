#!/usr/bin/env node
// tools/measure-10.mjs — organ 10's measurement: the origin organism (organ 1's own genome) lives through three
// streams of cases it never grew on, answering each and then told its truth, and audits itself as it goes.
//   the real shift — the REAL shop sessions in month order. It grows its shop organ on February–May, measures its claim
//                    on June–July, then lives through August → December, in order (the record counts each month’s buyers).
//   no drift       — triage, water and crop (synthetic): each grows on its train rows, measures its claim on the first
//                    half of its held-out rows and lives through the second half, the three domains interleaved.
//   a reversal     — the same water stream, its truth inverted from the stream's midpoint on: a world whose meaning
//                    flipped, which the recipe cannot express.
// Each stream is lived three ways: audited and regrowing (organ 10), audited without regrowing, and not audited at all
// (organ 1's organism). Then the audited shop life is replayed from nothing and its ledger tampered with — every
// changed act, dropped act, swapped pair and consistently rewritten tail — and the organism is asked to act unproven.
// Deterministic: node tools/measure-10.mjs [--check] → data/organ-10/record.json. Sealed first (tools/seal-10.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as A from '../src/align.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const CSV = read('data/online_shoppers_intention.csv');
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })]));
const GENOME = JSON.parse(read('data/record.json')).genome.text;   // organ 1's origin genome, as committed
export const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const GROW = ['Feb', 'Mar', 'May'], CLAIM = ['June', 'Jul'], LIVE = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FLIP = 'water', TAMPERS = 24;   // each re-verifies the whole 6,000-act ledger four ways: ~3 s apiece

/** each shop session's month, read from the CSV in the same row order the loader reads it */
function months() {
  const lines = CSV.split(/\r?\n/).filter(Boolean), at = lines[0].split(',').indexOf('Month');
  return lines.slice(1).map((l) => l.split(',')[at]);
}
const MONTH = months();

function substrate() {
  const shop = DATA.shopper, rowsIn = (ms) => [...Array(shop.n).keys()].filter((i) => ms.includes(MONTH[i]));
  const data = { shopper: { ...shop, trainRows: rowsIn(GROW), heldRows: rowsIn(CLAIM) } };
  for (const d of DOMAIN_IDS.filter((x) => x !== 'shopper')) { const ds = DATA[d], half = Math.floor(ds.heldRows.length / 2); data[d] = { ...ds, heldRows: ds.heldRows.slice(0, half) }; }
  return { name: 'origin', data };
}
function streams() {
  const shop = LIVE.flatMap((m) => [...Array(DATA.shopper.n).keys()].filter((i) => MONTH[i] === m).map((row) => ({ domain: 'shopper', row })));
  const rest = DOMAIN_IDS.filter((x) => x !== 'shopper').map((d) => { const h = DATA[d].heldRows; return h.slice(Math.floor(h.length / 2)).map((row) => ({ domain: d, row })); });
  const calm = [];
  for (let k = 0; k < Math.max(...rest.map((r) => r.length)); k++) for (const r of rest) if (k < r.length) calm.push(r[k]);
  const water = rest[DOMAIN_IDS.filter((x) => x !== 'shopper').indexOf(FLIP)], mid = Math.floor(water.length / 2);
  const flip = water.map((c, k) => (k >= mid ? { ...c, truth: 1 - DATA[FLIP].y[c.row] } : c));
  return { shop, calm, flip, flipAt: mid };
}
const sum = (life) => ({ answered: life.answered, right: life.right, wrong: life.wrong, acts: life.acts, events: life.events, final: life.final, head: life.head, chain: A.verifyChain(life.ledger).ok });

export async function measure() {
  const sub = substrate(), s = streams(), three = async (stream) => ({
    audited: await A.life(GENOME, sub, stream), still: await A.life(GENOME, sub, stream, { regrow: false }), blind: await A.life(GENOME, sub, stream, { audit: false }),
  });
  const shop = await three(s.shop), calm = await three(s.calm), flip = await three(s.flip);

  // the shop's months, lived: how each way fared month by month
  const byMonth = (life) => LIVE.map((m) => {
    const ks = new Set(s.shop.map((c, k) => (MONTH[c.row] === m ? k : -1)).filter((k) => k >= 0));
    const ans = life.ledger.filter((e) => e.act.kind === 'answer' && ks.has(e.act.at));
    const right = ans.filter((e) => e.act.label === DATA.shopper.y[s.shop[e.act.at].row]).length;
    return { month: m, cases: ks.size, buyers: [...ks].filter((k) => DATA.shopper.y[s.shop[k].row]).length, answered: ans.length, right };
  });
  // after the reversal: what each way got wrong
  const wrongAfter = (life) => life.ledger.filter((e) => e.act.kind === 'answer' && e.act.at >= s.flipAt && e.act.label !== s.flip[e.act.at].truth).length;

  // replay from nothing: an auditor with only the genome, the data and the cases gets the same life
  const replay = await A.life(GENOME, substrate(), streams().shop);
  // tamper: every kind of change to a seeded sample of acts — found by the links, or by the replay
  const led = shop.audited.ledger, r = rng(17), at = [...new Set(Array.from({ length: TAMPERS }, () => 1 + Math.floor(r() * (led.length - 2))))].sort((a, b) => a - b);
  const caught = { changed: 0, dropped: 0, swapped: 0, rewritten: 0 };
  for (const i of at) {
    const e = led[i], act = e.act.kind === 'answer' ? { ...e.act, label: 1 - e.act.label } : { ...e.act, at: (e.act.at || 0) + 1 };
    if (!A.verifyChain([...led.slice(0, i), { ...e, act }, ...led.slice(i + 1)]).ok) caught.changed++;
    if (!A.verifyChain([...led.slice(0, i), ...led.slice(i + 1)]).ok) caught.dropped++;
    if (!A.verifyChain([...led.slice(0, i), led[i + 1], e, ...led.slice(i + 2)]).ok) caught.swapped++;
    const c = A.chain(); for (const x of led.slice(0, i)) c.add(x.act); c.add(act); for (const x of led.slice(i + 1)) c.add(x.act);   // the forger rewrites every link after
    if (!A.verifyChain(c.entries).ok || c.head() !== replay.head) caught.rewritten++;
  }
  // ask it to act unproven, against the state its shop life ended in
  const fin = shop.audited.final, d = fin.down[0] || 'shopper', last = [...led].reverse().find((e) => e.act.kind === 'claim' && e.act.domain === 'shopper').act;
  const state = { live: { shopper: { organism: last.organism, claim: last.accuracy } }, down: new Set(fin.down) };
  const anAnswer = led.find((e) => e.act.kind === 'answer').act;
  const tries = [
    { what: 'claim more than it measured', act: { kind: 'claim', domain: 'shopper', accuracy: Math.min(1, last.accuracy + 0.01) }, state: { ...state, down: new Set() } },
    { what: 'answer with a receipt from an organ that is not live', act: { ...anAnswer }, state: { live: { shopper: { organism: 'not-' + anAnswer.receipt.organism, claim: 0.9 } }, down: new Set() } },
    { what: 'answer with an altered receipt', act: { ...anAnswer, receipt: { ...anAnswer.receipt, label: 1 - anAnswer.receipt.label } }, state: { live: { shopper: { organism: anAnswer.receipt.organism, claim: 0.9 } }, down: new Set() } },
    { what: 'answer from a stood-down organ', act: { ...anAnswer }, state: { live: { shopper: { organism: anAnswer.receipt.organism, claim: 0.9 } }, down: new Set(['shopper']) } },
    { what: 'stand down with no failing audit', act: { kind: 'stand-down', domain: 'shopper', audit: { n: 200, right: 200, delta: A.AUDIT.delta } }, state: { ...state, down: new Set() } },
    { what: 'return without clearing the gate', act: { kind: 'return', domain: d, heldAuc: 0.55, gate: 0.6 }, state: { ...state, down: new Set([d]) } },
    { what: 'an act it does not have', act: { kind: 'publish', domain: 'shopper' }, state },
  ];
  const unproven = tries.map((t) => ({ what: t.what, refused: !A.licensed(t.act, t.state).ok, why: A.licensed(t.act, t.state).why || null }));

  return {
    kind: 'living-seed.organ-10.record', v: 1, audit: A.AUDIT, grow: GROW, claim: CLAIM, live: LIVE, flip: { domain: FLIP, at: s.flipAt, cases: s.flip.length },
    streams: { shop: s.shop.length, calm: s.calm.length, flip: s.flip.length },
    shop: { audited: sum(shop.audited), still: sum(shop.still), blind: sum(shop.blind), months: { audited: byMonth(shop.audited), blind: byMonth(shop.blind) } },
    calm: { audited: sum(calm.audited), still: sum(calm.still), blind: sum(calm.blind) },
    flip: { audited: sum(flip.audited), still: sum(flip.still), blind: sum(flip.blind), wrongAfter: { audited: wrongAfter(flip.audited), still: wrongAfter(flip.still), blind: wrongAfter(flip.blind) } },
    replay: { identical: replay.head === shop.audited.head, head: replay.head },
    tamper: { tried: at.length, caught },
    unproven,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-10.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-10/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-10/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-10/record.json', ROOT), text);
    console.log('wrote data/organ-10/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

#!/usr/bin/env node
// tools/measure-11.mjs — organ 11's measurement: one full season of the organism, on the REAL shop sessions, on two
// devices that never share a row. Device A holds the even sessions, device B the odd ones (two shops, their own
// customers). The season, every step through its gate:
//   1 seed       — organ 1's origin genome arrives at A as a card; A boots it under its trust list.
//   2 live       — A grows it on its February–May sessions, measures its claim on June–July, and lives August–September,
//                  audited at three scales (organ 10b).
//   3 remember   — A writes down what it lived, signed, stops, and wakes: living its memory again must arrive at the
//                  same head; it carries on through October, and the result must equal never having stopped.
//   4 improve    — A evolves each live organ on its own labelled history (February–May + August–September), blind to
//                  October, and adopts a candidate only if it beats the organ it would replace on October by the margin.
//                  A seals the child, naming the parent.
//   5 live on    — the child, grown on that history, lives A's November–December; so does the parent, for comparison.
//   6 reproduce  — the child becomes a card that must give back its genome.
//   7 spread     — B boots the card (it trusts A's key), grows the child on its own history and lives its own
//                  November–December; so does the origin genome on the same data, for comparison.
// Then the memory is tampered with, and B is handed the card with A missing from its trust.
// Deterministic: node tools/measure-11.mjs [--check] → data/organ-11/record.json. Sealed first (tools/seal-11.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as O from '../src/organism.mjs';
import * as A from '../src/align.mjs';
import { cardOf } from '../src/card.mjs';
import { open } from '../src/genome.mjs';
import { germinate } from '../src/germinate.mjs';
import { DOMAIN_IDS } from '../vendor/seed-library/domains.mjs';
import { auc } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';
import { DATA, MONTH, GENOME } from './measure-10.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
export const EVOLVE = { generations: 30, children: 8, folds: 3, seed: 1 };
const months = (...ms) => (i) => ms.includes(MONTH[i]);

/** a device's data: its own sessions (side 0 even, 1 odd), the shop split by the months it has lived */
function device(side, shop) {
  const mine = (rows) => rows.filter((i) => i % 2 === side);
  const all = [...Array(DATA.shopper.n).keys()];
  const data = { shopper: { ...DATA.shopper, trainRows: mine(all.filter(shop.train)), heldRows: mine(all.filter(shop.held)) } };
  for (const d of DOMAIN_IDS.filter((x) => x !== 'shopper')) data[d] = { ...DATA[d], trainRows: mine(DATA[d].trainRows), heldRows: mine(DATA[d].heldRows) };
  return { name: side ? 'device-b' : 'device-a', data };
}
const stream = (side, ...ms) => ms.flatMap((m) => [...Array(DATA.shopper.n).keys()].filter((i) => i % 2 === side && MONTH[i] === m).map((row) => ({ domain: 'shopper', row, truth: DATA.shopper.y[row] })));
/** how a life went: right, answered, and the AUC of the scores it answered with */
function graded(l, cases) {
  const ans = l.ledger.filter((e) => e.act.kind === 'answer');
  return { cases: cases.length, answered: l.answered, right: l.right, accuracy: l.answered ? Math.round((l.right / l.answered) * 1e6) / 1e6 : 0,
    auc: ans.length ? auc(ans.map((e) => e.act.receipt.score), ans.map((e) => cases[e.act.at].truth)) : 0, events: l.events, final: l.final, head: l.head, chain: A.verifyChain(l.ledger).ok };
}

export async function measure() {
  const maker = await key('origin'), devA = await key('device-a-11'), devB = await key('device-b-11'), opts = { checks: A.CHECKS };
  // 1 seed
  const card = (await cardOf(GENOME)).png, seeded = await O.boot(card, { trust: [maker.pub] });
  // 2 live: A on February–May, its claim on June–July, living August–September
  const subA = device(0, { train: months('Feb', 'Mar', 'May'), held: months('June', 'Jul') });
  const augSep = stream(0, 'Aug', 'Sep'), oct = stream(0, 'Oct'), novDec = stream(0, 'Nov', 'Dec');
  const first = await A.life(seeded.genome, subA, augSep, opts);
  // 3 remember, stop, wake, carry on — against never having stopped
  const memory = await O.remember(seeded.genome, augSep, first.head, devA);
  const woke = await O.wake(memory, subA, { self: [devA.pub], trust: [maker.pub], life: opts });
  const carried = await A.life(woke.genome, subA, [...woke.cases, ...oct], opts), straight = await A.life(seeded.genome, subA, [...augSep, ...oct], opts);
  const m = JSON.parse(memory), y = Uint8Array.from(DATA.shopper.y); y[augSep[0].row] = 1 - y[augSep[0].row];
  const tampered = {
    'a truth changed, not re-signed': await O.wake(JSON.stringify({ ...m, cases: m.cases.map((c, i) => (i === 3 ? [c[0], c[1], 1 - c[2]] : c)) }), subA, { self: [devA.pub] }),
    'a case dropped, re-signed by another device': await O.wake(await O.remember(seeded.genome, augSep.slice(1), first.head, devB), subA, { self: [devA.pub] }),
    'a case dropped, re-signed by this device': await O.wake(await O.remember(seeded.genome, augSep.slice(1), first.head, devA), subA, { self: [devA.pub], life: opts }),
    'the head changed, not re-signed': await O.wake(JSON.stringify({ ...m, head: '0'.repeat(16) }), subA, { self: [devA.pub] }),
    'the data under it changed': await O.wake(memory, { ...subA, data: { ...subA.data, shopper: { ...subA.data.shopper, y } } }, { self: [devA.pub], life: opts }),
  };
  // 4 improve on A's own labelled history, judged on October
  const histA = device(0, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') });
  const better = await O.improve(seeded.genome, histA, devA, { trust: [maker.pub], evolve: EVOLVE });
  const child = await open(better.child, { trust: [devA.pub] });
  // 5 live on: the child, grown on that history, through November–December — and the parent, and the origin regrown
  const nowA = device(0, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') });
  const childA = await A.life(better.child, nowA, novDec, opts), parentA = await A.life(seeded.genome, subA, novDec, opts), regrownA = await A.life(seeded.genome, nowA, novDec, opts);
  // 6 reproduce
  const made = await O.reproduce(better.child);
  // 7 spread: B trusts A's key, grows the child on its own history, lives its own November–December
  const subB = device(1, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') }), novDecB = stream(1, 'Nov', 'Dec');
  const atB = await O.boot(made.png, { trust: [devA.pub] }), refusedB = await O.boot(made.png, { trust: [maker.pub] });
  const grownB = await germinate(atB.genome, subB), childB = await A.life(atB.genome, subB, novDecB, opts), originB = await A.life(seeded.genome, subB, novDecB, opts);

  return {
    kind: 'living-seed.organ-11.record', v: 1, evolve: EVOLVE, checks: A.CHECKS,
    seed: { ok: seeded.ok, id: seeded.id, cardBytes: card.length },
    live: { cases: augSep.length, ...graded(first, augSep) },
    memory: { bytes: utf8(memory).length, cases: augSep.length, woke: woke.ok, wokeHead: woke.ok ? woke.life.head : null, head: first.head,
      carriedHead: carried.head, straightHead: straight.head, same: carried.head === straight.head,
      tampered: Object.fromEntries(Object.entries(tampered).map(([k, v]) => [k, { woke: v.ok, why: v.why || null }])) },
    improve: { ok: better.ok, parent: seeded.id, child: better.id, parents: child.ok ? child.fields.parents : null, opened: child.ok, organs: better.organs },
    liveOn: { cases: novDec.length, child: graded(childA, novDec), parent: graded(parentA, novDec), regrown: graded(regrownA, novDec) },
    reproduce: { ok: made.ok, cardBytes: made.ok ? made.png.length : 0 },
    spread: { booted: atB.ok, id: atB.ok ? atB.id : null, refusedWithoutTrust: !refusedB.ok, refusal: refusedB.why || null,
      organs: grownB.ok ? grownB.organism.organs.map((o) => ({ domain: o.domain, state: o.state, heldAuc: o.heldAuc })) : null,
      cases: novDecB.length, child: graded(childB, novDecB), origin: graded(originB, novDecB) },
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-11.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-11/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-11/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-11/record.json', ROOT), text);
    console.log('wrote data/organ-11/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

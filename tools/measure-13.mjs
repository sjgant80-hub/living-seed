#!/usr/bin/env node
// tools/measure-13.mjs — organ 13's measurement: the seed grows the whole system. Deterministic (seeded keys, a public
// phrase, a fixed clock, every attack enumerated rather than drawn).
//   node tools/measure-13.mjs [--check]   → data/organ-13/record.json
//   node tools/measure-13.mjs --smoke     → runs every step on a few cases and prints only the record's shape (the
//                                           instrument checked before the seal, its numbers not read)
// The origin genome is organ 1's, sealed again here byte for byte; the child is organ 5's, bred again here byte for byte.
// The rules were sealed first (data/organ-13/prereg.json, tools/seal-13.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { KEEPER, grow, answerOf, roundTrip, fingerprint } from '../src/system.mjs';
import { seal, open } from '../src/genome.mjs';
import { caseOf } from '../src/germinate.mjs';
import { breed } from '../src/breed.mjs';
import { createNode, digestOf } from '../vendor/fall-kit-core/node.mjs';
import { readRoster } from '../vendor/fall-kit-core/roster.mjs';
import { hex } from '../vendor/fall-kit-core/identity.mjs';
import { sha256 } from '../vendor/fall-kit-core/vendor/light/sha256.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng, auc, round6 } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';
import { PHRASE, POLICY, TAB_CASES, clock, tabCases } from './organ-13.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const SMOKE = process.argv.includes('--smoke');
const LIES = SMOKE ? 3 : 100, BRED_ASKS = SMOKE ? 3 : 100;
const cap = (a) => (SMOKE ? a.slice(0, 3) : a);
const SEEDS = JSON.parse(read('data/seed-library-run.json')).library.seeds.map((s) => s.seed);
const EVOLVED = JSON.parse(read('data/organ-4b/record.json')).runs;
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const REF = { name: 'reference', data: DATA };
const HELD = Object.fromEntries(DOMAIN_IDS.map((d) => [d, cap(DATA[d].heldRows).map((i) => caseOf(DATA[d], i))]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const opts = (cases) => ({ policy: POLICY, clock, cases });
const tally = (xs) => xs.reduce((a, x) => ({ ...a, [x]: (a[x] || 0) + 1 }), {});
const values = (node) => node.ledger().log.filter((e) => e.entry.type === 'value').length;
// organ 1's one-character change: every position, the same rule
const flipChar = (t, i) => t.slice(0, i) + (t[i] === 'a' ? 'b' : t[i] === '\n' ? ' ' : t[i] === '0' ? '1' : 'a') + t.slice(i + 1);
const flipBit = (b, i) => { const c = b.slice(); c[i] ^= 1; return c; };
const hashOf = (core) => hex(sha256(new TextEncoder().encode(JSON.stringify(core))));

/** Every way out of the process, trapped: fetch, XMLHttpRequest, WebSocket, every socket (TCP and TLS), every datagram,
 *  every name lookup. A call is counted, and refused. */
function trapNetwork() {
  const hits = [];
  const at = [[globalThis, 'fetch'], [globalThis, 'XMLHttpRequest'], [globalThis, 'WebSocket'], [net.Socket.prototype, 'connect'], [dgram.Socket.prototype, 'send'], [dgram.Socket.prototype, 'bind'],
    [dns, 'lookup'], [dns, 'resolve'], [dns.promises, 'lookup'], [dns.promises, 'resolve']].map(([o, k]) => [o, k, Object.getOwnPropertyDescriptor(o, k)]);
  for (const [o, k] of at) Object.defineProperty(o, k, { configurable: true, writable: true, value: function () { hits.push(k); throw new Error('network: ' + k); } });
  return { hits, restore: () => { for (const [o, k, d] of at) if (d) Object.defineProperty(o, k, d); else delete o[k]; } };
}

/** Every file the system loads, followed from src/system.mjs through every import, and every module it names that is
 *  not a file of this repository. */
const NETWORK_MODULES = ['net', 'http', 'https', 'http2', 'dgram', 'dns', 'tls', 'undici', 'ws'].flatMap((m) => [m, 'node:' + m, 'node:' + m + '/promises', m + '/promises']);
function importsOf(entry) {
  const seen = new Set(), outside = new Set();
  const walk = (url) => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const m of readFileSync(url, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      if (m[1].startsWith('.')) walk(new URL(m[1], url)); else outside.add(m[1]);
    }
  };
  walk(new URL('src/system.mjs', ROOT));
  const files = [...seen].map((h) => h.slice(ROOT.href.length)).sort();
  return { files: files.length, list: files, outside: [...outside].sort(), network: [...outside].filter((m) => NETWORK_MODULES.includes(m) || /^[a-z]+:\/\//.test(m)).sort() };
}

const shape = (s) => ({
  plan: s.plan, nodes: Object.keys(s.nodes),
  roster: { members: s.roster.cards.length, bytes: utf8(JSON.stringify(s.roster)).length, digest: digestOf(s.roster) },
  everyPinsEvery: Object.values(s.nodes).every((n) => JSON.stringify(n.pinned().slice().sort()) === JSON.stringify(Object.values(s.nodes).filter((m) => m !== n).map((m) => m.id).sort())),
});

export async function measure() {
  const origin = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, await key('origin'));

  // S1 + S2: the system grows, and the keeper asks every held-out case of every organ through it, the network trapped
  const trap = trapNetwork();
  let sys, asked = {};
  try {
    sys = await grow(origin.text, REF, PHRASE, opts(HELD));
    for (const d of DOMAIN_IDS) {
      const outcomes = [], scores = [], ys = [];
      let same = 0;
      for (let k = 0; k < HELD[d].length; k++) {
        const t = await roundTrip(sys, d, HELD[d][k]);
        outcomes.push(t.outcome);
        if (JSON.stringify(t.answer) === JSON.stringify(answerOf(sys.organism, d, HELD[d][k]))) same++;
        if (t.outcome === 'verified') { scores.push(t.answer.receipt.score); ys.push(DATA[d].y[DATA[d].heldRows[k]]); }
      }
      asked[d] = { held: HELD[d].length, outcomes: tally(outcomes), sameAsOrganism: same, auc: round6(auc(scores, ys)), heldAuc: sys.organism.organs.find((o) => o.domain === d).heldAuc };
    }
  } finally { trap.restore(); }
  const system = { organism: sys.organism.id, organismBytes: utf8(JSON.stringify(sys.organism)).length, ...shape(sys), cardsBytes: utf8(JSON.stringify(Object.values(sys.nodes).map((n) => n.card()))).length, credited: values(sys.nodes[KEEPER]) };

  // S3: grows only what is verified — a device where the shop cannot be proved, one with no water data, a refused genome
  const r9 = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r9() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const { water, ...noWater } = DATA;
  const hostileOf = async (sub, domain) => { const s = await grow(origin.text, sub, PHRASE, opts({})); const q = await s.nodes[KEEPER].ask(domain, HELD[domain][0]); return { ...shape(s), ask: q.ok ? 'asked' : 'refused: ' + q.why }; };
  const hostile = { noisy: await hostileOf({ name: 'shuffled-shopper', data: { ...DATA, shopper: { ...DATA.shopper, y } } }, 'shopper'), dry: await hostileOf({ name: 'no-water', data: noWater }, 'water') };
  const bad = await grow(flipChar(origin.text, origin.text.indexOf('origin')), REF, PHRASE, opts({}));
  const refusedGenome = { ok: bad.ok, why: bad.why, grew: Object.keys(bad).filter((k) => !['ok', 'why'].includes(k)) };

  // S4: one door at every scale — every one-character change to the genome and to the signed roster, every one-bit change
  // to an ask at the organ's door and to its answer at the keeper's door; then the genuine answer; then both replayed
  const why = (s) => String(s).split(':')[0];
  const gReasons = [];
  for (let i = 0; i < (SMOKE ? 3 : origin.text.length); i++) { const g = await grow(flipChar(origin.text, i), REF, PHRASE, opts({})); gReasons.push(g.ok ? 'GREW' : why(g.why.replace('the genome was refused: ', ''))); }
  const rosterText = JSON.stringify(sys.roster), founder = sys.planted.ids.founder.id, rReasons = [];
  for (let i = 0; i < (SMOKE ? 3 : rosterText.length); i++) {
    let parsed;
    try { parsed = JSON.parse(flipChar(rosterText, i)); } catch { rReasons.push('not JSON'); continue; }
    const r = await readRoster(parsed, founder);
    rReasons.push(r.ok ? 'READ' : why(r.why));
  }
  const sP = await grow(origin.text, REF, PHRASE, opts({ triage: [HELD.triage[0]] }));
  const q = await sP.nodes[KEEPER].ask('triage', HELD.triage[0]);
  const askDoor = [];
  for (let i = 0; i < (SMOKE ? 3 : q.bytes.length); i++) { const r = await sP.nodes.triage.hear(flipBit(q.bytes, i)); askDoor.push(r.ok === false && r.replies.length === 0 ? 'refused' : 'ANSWERED'); }
  const reply = (await sP.nodes.triage.hear(q.bytes)).replies[0].bytes;
  const answerDoor = [];
  for (let i = 0; i < (SMOKE ? 3 : reply.length); i++) { const h = await sP.nodes[KEEPER].hear(flipBit(reply, i)); answerDoor.push(h.ok === false ? 'refused' : 'ADMITTED ' + h.outcome); }
  const genuine = await sP.nodes[KEEPER].hear(reply);
  const replayAsk = await sP.nodes.triage.hear(q.bytes), replayAnswer = await sP.nodes[KEEPER].hear(reply);
  const tamper = {
    genome: { positions: gReasons.length, reasons: tally(gReasons) },
    roster: { positions: rReasons.length, reasons: tally(rReasons) },
    ask: { bits: askDoor.length, outcomes: tally(askDoor) },
    answer: { bits: answerDoor.length, outcomes: tally(answerDoor) },
    genuineAfter: genuine.outcome || 'refused', credited: values(sP.nodes[KEEPER]),
    replayAsk: replayAsk.replies.length ? 'answered' : 'refused', replayAnswer: replayAnswer.ok === false ? 'refused' : 'admitted ' + replayAnswer.outcome,
  };

  // S5 + S6: a liar with the triage organ's own key; the child bred again, its own system; a stale organ with the child's
  // shop key answering from the parent
  const evolved = await seal({ name: 'evolved', parents: [origin.id], gate: { auc: 0.6 }, organs: DOMAIN_IDS.map((d) => EVOLVED.find((r) => r.name === d).champion) }, await key('peer-1'));
  const child = await breed(origin.text, evolved.text, REF, await key('peer-2'), { name: 'child', seed: 1 });
  const evolvedOrganism = (await grow(evolved.text, REF, PHRASE, opts({}))).organism;
  const liesBy = async (s, domain, answerFrom) => {
    const node = await createNode({ name: domain, identity: s.planted.ids[domain], genesis: s.planted.genesis, clock, skills: { [domain]: async (x) => answerFrom(x) } });
    await node.pin(s.nodes[KEEPER].card());
    const out = [];
    for (let k = 0; k < LIES; k++) out.push((await roundTrip(s, domain, HELD[domain][k], node)).outcome);
    return { told: LIES, outcomes: tally(out), credited: values(s.nodes[KEEPER]) };
  };
  const sL = await grow(origin.text, REF, PHRASE, opts({ triage: HELD.triage.slice(0, LIES) }));
  const liar = await liesBy(sL, 'triage', (x) => { const a = answerOf(sL.organism, 'triage', x); const { receiptHash, ...core } = { ...a.receipt, label: 1 - a.label }; return { ...a, label: 1 - a.label, receipt: { ...core, receiptHash: hashOf(core) } }; });
  const sS = await grow(child.text, REF, PHRASE, opts({ shopper: HELD.shopper.slice(0, LIES) }));
  const stale = await liesBy(sS, 'shopper', (x) => answerOf(sys.organism, 'shopper', x));

  const bredCases = Object.fromEntries(DOMAIN_IDS.map((d) => [d, HELD[d].slice(0, BRED_ASKS)]));
  const sC = await grow(child.text, REF, PHRASE, opts(bredCases));
  const bredAsked = {};
  for (const d of DOMAIN_IDS) { const out = []; for (const x of bredCases[d]) out.push((await roundTrip(sC, d, x)).outcome); bredAsked[d] = tally(out); }
  const shopAuc = (o) => round6(auc(HELD.shopper.map((x) => answerOf(o, 'shopper', x).receipt.score), cap(DATA.shopper.heldRows).map((i) => DATA.shopper.y[i])));
  const organ5 = JSON.parse(read('data/organ-5/record.json'));
  const bred = {
    child: child.id, sameChildAsOrgan5: child.id === organ5.child.id, parents: (await open(child.text)).fields.parents, origin: origin.id, evolved: evolved.id,
    organism: sC.organism.id, parentOrganisms: [sys.organism.id, evolvedOrganism.id], ...shape(sC), asked: bredAsked,
    shopAuc: { child: shopAuc(sC.organism), origin: shopAuc(sys.organism), evolved: shopAuc(evolvedOrganism) },
    sameKeys: DOMAIN_IDS.every((d) => sC.planted.ids[d].id === sys.planted.ids[d].id) && sC.planted.ids.founder.id === sys.planted.ids.founder.id,
  };

  // S7: the fingerprint a tab must reproduce — a fresh system, the first TAB_CASES held cases of each organ through it
  const sF = await grow(origin.text, REF, PHRASE, opts(tabCases(DATA)));
  const portable = { cases: TAB_CASES, ...(await fingerprint(sF, tabCases(DATA))), sameRosterAsFirst: digestOf(sF.roster) === digestOf(sys.roster) };

  return {
    kind: 'living-seed.organ-13.record', v: 1, phrase: PHRASE, policy: POLICY,
    genome: { id: origin.id, bytes: utf8(origin.text).length, organs: SEEDS.length, sameAsOrgan1: origin.text === JSON.parse(read('data/record.json')).genome.text },
    system, offline: { networkTouched: trap.hits.length, touched: tally(trap.hits), imports: importsOf() },
    asked, hostile, refusedGenome, tamper, lies: { liar, stale }, bred, portable,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-13.mjs');
if (isMain) {
  const t0 = Date.now(), rec = await measure();
  if (SMOKE) {
    const keys = (o, d = 0) => (o && typeof o === 'object' && !Array.isArray(o) && d < 2 ? '{' + Object.keys(o).map((k) => k + keys(o[k], d + 1)).join(' ') + '}' : '');
    console.log('SMOKE RAN END TO END · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + keys(rec));
    process.exit(0);
  }
  const text = JSON.stringify(rec, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-13/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } else {
    mkdirSync(new URL('data/organ-13/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-13/record.json', ROOT), text);
    console.log('wrote data/organ-13/record.json · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  }
}

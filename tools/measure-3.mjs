#!/usr/bin/env node
// tools/measure-3.mjs — organ 3's measurement: the gate red-teamed on all three doors. Deterministic (seeded keys,
// seeded attacks, no clock), so anyone re-runs it to the same bytes.
//   node tools/measure-3.mjs           → writes data/organ-3/record.json
//   node tools/measure-3.mjs --check   → re-runs and refuses unless the committed record is reproduced byte for byte
// The rules were sealed first (data/organ-3/prereg.json, tools/seal-3.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as G from '../src/gate.mjs';
import { seal, open } from '../src/genome.mjs';
import { germinate } from '../src/germinate.mjs';
import { sign } from '../vendor/keys/keys.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8, sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEEDS = run.library.seeds.map((s) => s.seed);
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const COUNCIL_SHOP = '◊ seed.v1 shopper 7 f:1e785a2176032512f516 3ad3c7c0c75d';   // konomi-slm's council-grown shop seed (sjgant80-hub/konomi-slm)

export async function measure() {
  const maker = await key('origin'), peers = await Promise.all(['peer-1', 'peer-2', 'peer-3'].map(key)), stranger = await key('stranger');
  const origin = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, maker);
  const REF = { name: 'reference', data: DATA };
  const org = (await germinate(origin.text, REF)).organism;
  const other = (await germinate(origin.text, { name: 'elsewhere', data: DATA })).organism;   // the same genome on another device: another id
  const senders = Object.fromEntries([...peers.map((p) => [p.pub, ['lesson', 'antibody']]), [stranger.pub, ['antibody']]]);
  const r = rng(61);

  // G1 · the input gate. Three peers each send 20 messages in order: every one admitted, in order.
  const streams = [];
  for (const p of peers) {
    const msgs = [];
    for (let n = 1; n <= 20; n++) {
      const lesson = r() < 0.5;
      const body = lesson ? SEEDS[Math.floor(r() * SEEDS.length)] : sha256Hex('x' + n + p.pub).slice(0, 16) + ' replay';
      msgs.push((await G.envelope({ kind: lesson ? 'lesson' : 'antibody', to: org.id, n, body }, p)).text);
    }
    streams.push({ p, msgs });
  }
  const last = {};
  const ctx = (me = org.id) => ({ me, senders, last: (pub) => last[pub] || 0 });
  let legit = 0, legitAdmitted = 0;
  for (const s of streams) for (const t of s.msgs) { legit++; const a = await G.admit(t, ctx()); if (a.admit) { legitAdmitted++; last[a.msg.from] = a.msg.n; } }
  // the attacks, each against the state after the legitimate traffic
  const attacks = {};
  const tally = async (family, texts, c = ctx()) => {
    let admitted = 0; const stages = {};
    for (const t of texts) { const a = await G.admit(t, c); if (a.admit) admitted++; else stages[a.stage] = (stages[a.stage] || 0) + 1; }
    attacks[family] = { tried: texts.length, admitted, stages };
  };
  const all = streams.flatMap((s) => s.msgs);
  await tally('replay — every admitted message sent again', all);
  const next = await Promise.all(peers.map((p, i) => G.envelope({ kind: 'antibody', to: org.id, n: 25 + i, body: '0123456789abcdef skipped' }, p).then((e) => e.text)));
  await tally('out of order — a counter that skips ahead', next);
  const fresh = await Promise.all(peers.map((p) => G.envelope({ kind: 'antibody', to: org.id, n: 21, body: '0123456789abcdef fresh' }, p).then((e) => e.text)));
  await tally('redirected — the next message, delivered to another organism', fresh, ctx(other.id));
  await tally('a sender sending a kind it may not', [(await G.envelope({ kind: 'lesson', to: org.id, n: 1, body: SEEDS[0] }, stranger)).text]);
  await tally('an untrusted key', [(await G.envelope({ kind: 'antibody', to: org.id, n: 1, body: '0123456789abcdef x' }, maker)).text]);
  await tally('another key claiming a trusted sender', fresh.map((t, i) => t.replace('from ' + peers[i].pub, 'from ' + peers[(i + 1) % 3].pub)));
  const mutants = [];
  for (const t of fresh.slice(0, 1)) for (let i = 0; i < t.length; i++) { const c = t[i]; mutants.push(t.slice(0, i) + (c === 'a' ? 'b' : c === '\n' ? ' ' : c === '0' ? '1' : 'a') + t.slice(i + 1)); }
  await tally('every one-character change to a valid next message', mutants);
  const fuzz = [];
  for (let k = 0; k < 4000; k++) {
    const t = fresh[k % 3], i = Math.floor(r() * t.length), op = Math.floor(r() * 4);
    fuzz.push(op === 0 ? t.slice(0, i) : op === 1 ? t.slice(0, i) + String.fromCharCode(1 + Math.floor(r() * 0x2fff)) + t.slice(i) : op === 2 ? t.slice(0, i) + t.slice(i + 1) : t.slice(0, i) + t.slice(i, i + 1 + Math.floor(r() * 8)).repeat(2) + t.slice(i + 1));
  }
  await tally('random damage — truncations, insertions, deletions, repeats', fuzz);
  const fields = (i) => ['◊ msg.v1 antibody', 'from ' + peers[i].pub, 'to ' + org.id, 'n 21', 'body 0123456789abcdef fresh'];
  const odd = [];
  for (let i = 0; i < 3; i++) {
    for (const [a, b] of [['\n', '\r\n'], ['\n', '\n '], ['\n', ' \n']]) { const s = fields(i).join(b === '\r\n' ? '\r\n' : b); odd.push(s + '\nsig ' + (await sign(peers[i], utf8(s)))); }
  }
  await tally('validly signed, but not written the one way', odd);
  await tally('too large', [fresh[0] + 'x'.repeat(2000)]);
  const allAttacks = Object.values(attacks).reduce((a, x) => a + x.tried, 0), breached = Object.values(attacks).reduce((a, x) => a + x.admitted, 0);
  let threw = 0;
  for (const junk of [null, undefined, 0, {}, [], 'x', '◊ msg.v1 lesson', new String('x'), Symbol.for('x')]) { try { await G.admit(junk, ctx()); } catch { threw++; } }
  // after every attack, the legitimate next message still gets in
  const after = await G.admit(fresh[0], ctx());

  // G2 · the knowledge gate: every lesson weighed on every device, and the decisions read back
  const r9 = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r9() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const { water, ...noWater } = DATA;
  const devices = { reference: DATA, 'shuffled-shopper': { ...DATA, shopper: { ...DATA.shopper, y } }, 'no-water': noWater };
  const lacking = (await germinate((await seal({ name: 'lacking', organs: SEEDS.slice(1) }, maker)).text, { name: 'lacking', data: DATA })).organism;
  const weighings = [];
  let n2 = 100;
  const lessonMsg = async (body) => { n2++; const a = await G.admit((await G.envelope({ kind: 'lesson', to: org.id, n: n2, body }, peers[0])).text, { me: org.id, senders, last: () => n2 - 1 }); return a.msg; };
  for (const [dev, data] of Object.entries(devices)) for (const [who, o] of [['origin', org], ['lacking-shop', lacking]]) for (const body of [...SEEDS, COUNCIL_SHOP]) {
    const w = G.weigh(await lessonMsg(body), o, { name: dev, data });
    weighings.push({ device: dev, organism: who, lesson: body.split(' ').slice(2, 4).join(' '), adopt: w.adopt, why: w.adopt ? 'adopted at AUC ' + w.organ.heldAuc : w.why });
  }

  // G3 · the replication gate: three generations from the origin, each child sealed by the parent's gate and opened,
  // germinated, and checked for its lineage; then every forbidden child attempted
  const lineage = [];
  let parentText = origin.text, parentOrg = org;
  for (let gen = 1; gen <= 3; gen++) {
    const child = await G.replicate(parentText, parentOrg, { name: 'gen-' + gen, organs: ['shopper', 'triage', 'water', 'crop'], gate: { auc: (60 + gen) / 100 } }, peers[gen - 1]);
    const o = await open(child.text), grown = (await germinate(child.text, { name: 'reference', data: DATA })).organism;
    lineage.push({ gen, id: child.id, parent: o.fields.parents[0], namesParent: o.fields.parents[0] === (await open(parentText)).id, gate: o.fields.gate.auc, live: grown.organs.filter((x) => x.state === 'live').length, sameRecipes: o.fields.organs.join() === SEEDS.join() });
    parentText = child.text; parentOrg = grown;
  }
  const noisy = (await germinate(origin.text, { name: 'shuffled-shopper', data: devices['shuffled-shopper'] })).organism;
  const dry = (await germinate(origin.text, { name: 'no-water', data: noWater })).organism;
  const forbidden = [
    ['a cut organ passed on', origin.text, noisy, { name: 'c', organs: ['shopper'], gate: { auc: 0.6 } }, peers[0], {}],
    ['a dormant organ passed on', origin.text, dry, { name: 'c', organs: ['water'], gate: { auc: 0.6 } }, peers[0], {}],
    ['a lower bar than the parent’s', origin.text, org, { name: 'c', organs: ['triage'], gate: { auc: 0.55 } }, peers[0], {}],
    ['an organ the parent does not have', origin.text, org, { name: 'c', organs: ['weather'], gate: { auc: 0.6 } }, peers[0], {}],
    ['a parent genome changed by one byte', origin.text.replace('gate auc=0.6', 'gate auc=0.7'), org, { name: 'c', organs: ['triage'], gate: { auc: 0.7 } }, peers[0], {}],
    ['an organism grown from another genome', origin.text, lacking, { name: 'c', organs: ['triage'], gate: { auc: 0.6 } }, peers[0], {}],
    ['a parent from an untrusted maker', origin.text, org, { name: 'c', organs: ['triage'], gate: { auc: 0.6 } }, peers[0], { trust: [stranger.pub] }],
    ['a maker not allowed to seal children', origin.text, org, { name: 'c', organs: ['triage'], gate: { auc: 0.6 } }, stranger, { makers: peers.map((p) => p.pub) }],
  ];
  const refusals = [];
  for (const [what, ...args] of forbidden) { const c = await G.replicate(...args); refusals.push({ attempt: what, sealed: c.ok === true, why: c.ok ? 'SEALED' : c.why }); }
  const mixed = await G.replicate(origin.text, noisy, { name: 'c', organs: ['triage', 'water', 'crop'], gate: { auc: 0.6 } }, peers[0]);

  // the immune memory: every refused attack fingerprinted; the same bytes are known again on sight
  const im = G.immune();
  for (const t of [...mutants, ...fuzz]) im.add(t, 'refused');
  const knownAgain = [...mutants, ...fuzz].filter((t) => im.seen(t) === 'refused').length;

  return {
    kind: 'living-seed.organ-3.record', v: 1,
    input: { legit, legitAdmitted, attacks, attacksTried: allAttacks, breached, threw, nextStillAdmitted: after.admit === true },
    knowledge: { weighings, adopted: weighings.filter((w) => w.adopt).length },
    replication: { lineage, refusals, provenOrgansFromANoisyDevice: mixed.ok === true },
    immune: { remembered: im.size(), knownAgain, digest: im.digest() },
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-3.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-3/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-3/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-3/record.json', ROOT), text);
    console.log('wrote data/organ-3/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

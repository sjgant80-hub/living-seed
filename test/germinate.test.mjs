import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Γ from '../src/germinate.mjs';
import { seal } from '../src/genome.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { germinate as express, rng, heldAccuracy } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8, sha256Hex } from '../vendor/seed-library/sha256.mjs';

const run = JSON.parse(readFileSync(new URL('../data/seed-library-run.json', import.meta.url), 'utf8'));
const SEEDS = run.library.seeds.map((s) => s.seed);
const SEALED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s]));
const CSV = readFileSync(new URL('../data/online_shoppers_intention.csv', import.meta.url), 'utf8');
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })]));
const MAKER = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
const OTHER = await fromSeed(sha256Bytes(utf8('living-seed/maker/other')));
const ORIGIN = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, MAKER);
const REF = { name: 'reference', data: DATA };
const grown = async (substrate, opts) => { const r = await Γ.germinate(ORIGIN.text, substrate, opts); assert.equal(r.ok, true, r.why); return r.organism; };
/** a dataset seen through one device: the same rows, its train rows restricted to the ones this device holds */
const shard = (ds, keep) => ({ ...ds, trainRows: ds.trainRows.filter(keep) });

test('Γ on the reference data: every organ grows, clears the gate and reproduces seed-library’s sealed score exactly', async () => {
  const o = await grown(REF);
  assert.deepEqual(Object.keys(o).sort(), ['by', 'gate', 'genome', 'id', 'kind', 'name', 'organs', 'parents', 'substrate', 'v']);
  assert.deepEqual([o.kind, o.v, o.genome, o.name, o.by, o.substrate], ['living-seed.organism', 1, ORIGIN.id, 'origin', MAKER.pub, 'reference']);
  assert.deepEqual([o.parents, o.gate], [[], { auc: 0.6 }]);
  assert.deepEqual(o.organs.map((x) => x.domain), ['shopper', 'triage', 'water', 'crop']);
  for (const x of o.organs) {
    const s = SEALED[x.domain];
    assert.equal(x.state, 'live', x.domain);
    assert.deepEqual([x.heldAuc, x.heldAcc, x.train, x.held, x.base], [s.heldAuc, s.heldAcc, s.train, s.held, s.base], x.domain);
    assert.equal(x.recipe, s.seed);
    assert.equal(x.why, 'AUC ' + s.heldAuc + ' on ' + s.held + ' cases it never grew on clears the gate (0.6)');
    assert.equal(x.body.rules.length, s.rules);
  }
  // the same genome on the same data grows the same organism, byte for byte
  const again = await grown(REF);
  assert.equal(again.id, o.id);
  assert.equal(Γ.stable(again), Γ.stable(o));
  const { id, ...record } = o;
  assert.equal(id, sha256Hex(Γ.stable(record)).slice(0, 16));
  assert.notEqual((await grown({ ...REF, name: 'elsewhere' })).id, o.id, 'where it grew is part of what it is');
});

test('answer: on every case it never grew on, the organism calls exactly what the ribosome grades — never abstaining on a live organ', async () => {
  const o = await grown(REF);
  for (const d of DOMAIN_IDS) {
    const ds = DATA[d];
    let right = 0;
    for (const i of ds.heldRows) {
      const a = Γ.answer(o, d, Γ.caseOf(ds, i));
      assert.equal(a.verdict, 'VERIFIED');
      if (a.label === ds.y[i]) right++;
    }
    const g = express(ds, SEEDS[DOMAIN_IDS.indexOf(d)]);
    assert.equal(Math.round((right / ds.heldRows.length) * 1e6) / 1e6, heldAccuracy(g.scorecard, ds, ds.trainRows, ds.heldRows), d);
  }
  // one call in full: the rules that fired, their sum, the line it is judged against
  const ds = DATA.triage, x = Γ.caseOf(ds, ds.heldRows[0]), a = Γ.answer(o, 'triage', x);
  const organ = o.organs.find((y) => y.domain === 'triage');
  const fired = organ.body.rules.filter((r) => (r.op === '>' ? x[r.feat] > r.v : x[r.feat] <= r.v));
  assert.deepEqual(a, { verdict: 'VERIFIED', label: a.score > organ.body.threshold ? 1 : 0, score: fired.reduce((s, r) => s + r.w, 0), threshold: organ.body.threshold, organ: 'triage', fired });
});

test('operatingPoint: the score that puts the train rows’ own share of yes cases on top', () => {
  const ds = { y: [0, 0, 0, 1, 1], cols: { a: [1, 2, 3, 4, 5] }, features: ['a'] };
  const card = { rules: [{ feat: 'a', op: '>', v: 0, w: 1 }, { feat: 'a', op: '>', v: 3, w: 1 }] };   // scores 1,1,1,2,2
  assert.equal(Γ.operatingPoint(card, ds, [0, 1, 2, 3, 4]), 2, 'base 0.4 → the top 40% sit at the cut');
  assert.equal(Γ.operatingPoint(card, ds, [0, 1, 2]), 1, 'no yes cases → the highest train score');
  assert.equal(Γ.operatingPoint(card, ds, [3, 4]), 2, 'all yes → the lowest is clamped to the top');
  assert.equal(Γ.operatingPoint(card, { ...ds, y: [1, 0, 0, 0, 0] }, [0, 1, 2, 3, 4]), 2, 'base 0.2 → the 80th percentile');
});

test('dormant: no local data for a domain — that organ waits and never answers; the rest of the organism lives', async () => {
  const { water, ...rest } = DATA;
  const o = await grown({ name: 'no-water', data: rest });
  const w = o.organs.find((x) => x.domain === 'water');
  assert.deepEqual(w, { domain: 'water', recipe: SEALED.water.seed, state: 'dormant', why: 'this device holds no water data' });
  assert.deepEqual(Γ.answer(o, 'water', Γ.caseOf(water, water.heldRows[0])), { verdict: 'ABSTAIN', why: 'its water organ is dormant: this device holds no water data' });
  assert.deepEqual(o.organs.filter((x) => x.state === 'live').map((x) => x.domain), ['shopper', 'triage', 'crop']);
  // a dataset that failed to load is no data, not a crash
  const bad = await grown({ name: 'bad-water', data: { ...rest, water: { ok: false, error: 'x' } } });
  assert.equal(bad.organs.find((x) => x.domain === 'water').state, 'dormant');
  assert.equal((await grown({ name: 'none', data: null })).organs.every((x) => x.state === 'dormant'), true);
  assert.equal((await grown({ name: 'proto', data: Object.create({ water: DATA.water }) })).organs.every((x) => x.state === 'dormant'), true, 'only data the substrate itself holds');
});

test('cut: an organ that does not clear the gate here, or cannot grow here, never answers', async () => {
  // the labels shuffled: nothing left to learn — the recipe grows, scores near a coin, and is cut
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const o = await grown({ name: 'shuffled', data: { ...DATA, shopper: { ...DATA.shopper, y } } });
  const s = o.organs.find((x) => x.domain === 'shopper');
  assert.equal(s.state, 'cut');
  assert.ok(s.heldAuc < 0.6, String(s.heldAuc));
  assert.equal(s.why, 'AUC ' + s.heldAuc + ' on cases it never grew on is under the gate (0.6)');
  assert.equal(s.body, undefined, 'a cut organ carries no body to answer from');
  assert.equal(Γ.answer(o, 'shopper', Γ.caseOf(DATA.shopper, 0)).verdict, 'ABSTAIN');
  assert.match(Γ.answer(o, 'shopper', Γ.caseOf(DATA.shopper, 0)).why, /^its shopper organ is cut: AUC /);
  // the gate is a floor: an organ exactly on it lives, one a hair under it is cut
  const at = async (auc, organ, data) => (await Γ.germinate((await seal({ name: 'origin', organs: [organ], gate: { auc } }, MAKER)).text, { name: 'gate', data })).organism.organs[0];
  assert.equal((await at(0.815, SEEDS[0], DATA)).state, 'live', 'AUC 0.815265 clears 0.815');
  assert.equal((await at(0.816, SEEDS[0], DATA)).state, 'cut', 'AUC 0.815265 is under 0.816');
  const n = 200, flat = { ok: true, name: 'triage', features: DATA.triage.features, n, y: Uint8Array.from({ length: n }, (_, i) => i % 2),
    cols: Object.fromEntries(DATA.triage.features.map((f) => [f, new Float64Array(n).fill(1)])), trainRows: [...Array(140).keys()], heldRows: [...Array(60).keys()].map((i) => i + 140) };
  const level = await at(0.5, SEEDS[1], { triage: flat });   // every case scores the same: exactly a coin
  assert.deepEqual([level.heldAuc, level.state], [0.5, 'live'], 'exactly on a 0.5 gate');
  assert.equal((await at(0.501, SEEDS[1], { triage: flat })).state, 'cut');
  // no train rows: it cannot grow at all
  const none = await grown({ name: 'empty', data: { ...DATA, crop: { ...DATA.crop, trainRows: [] } } });
  assert.deepEqual(none.organs.find((x) => x.domain === 'crop'), { domain: 'crop', recipe: SEALED.crop.seed, state: 'cut', why: 'it could not grow here: dataset has no train/held rows' });
});

test('two devices, two halves of the history: the same genome grows a different organism on each, fitted to what each holds', async () => {
  const a = await grown({ name: 'device-a', data: Object.fromEntries(DOMAIN_IDS.map((d) => [d, shard(DATA[d], (i) => i % 2 === 0)])) });
  const b = await grown({ name: 'device-b', data: Object.fromEntries(DOMAIN_IDS.map((d) => [d, shard(DATA[d], (i) => i % 2 === 1)])) });
  assert.notEqual(a.id, b.id);
  assert.equal(a.genome, b.genome);
  let differs = 0;
  for (const d of DOMAIN_IDS) {
    const [x, y] = [a, b].map((o) => o.organs.find((z) => z.domain === d));
    assert.equal(x.train + y.train, SEALED[d].train, d + ': the two halves are the whole history');
    assert.equal(x.held, SEALED[d].held, d + ': graded on the same cases');
    if (x.state === 'live' && y.state === 'live' && Γ.stable(x.body) !== Γ.stable(y.body)) differs++;
  }
  assert.ok(differs >= 1, 'rules fitted to each device’s own data: ' + differs + ' of 4 organs differ');
});

test('a refused genome grows nothing: tampered, untrusted, or nowhere to grow', async () => {
  const t = ORIGIN.text.replace('gate auc=0.6', 'gate auc=0.5');
  assert.deepEqual(await Γ.germinate(t, REF), { ok: false, why: 'the genome was refused: signature' });
  assert.deepEqual(await Γ.germinate(ORIGIN.text, REF, { trust: [OTHER.pub] }), { ok: false, why: 'the genome was refused: untrusted maker' });
  assert.equal((await Γ.germinate(ORIGIN.text, REF, { trust: [MAKER.pub] })).ok, true);
  for (const s of [null, undefined, 7, 'x', {}, { name: '' }, { name: 7, data: DATA }]) assert.deepEqual(await Γ.germinate(ORIGIN.text, s), { ok: false, why: 'no substrate to grow on' }, JSON.stringify(s));
  for (const g of [null, 7, '', 'nonsense']) assert.deepEqual(await Γ.germinate(g, REF), { ok: false, why: 'the genome was refused: not a genome' });
  assert.equal((await Γ.germinate(ORIGIN.text, { name: 'x', get data() { throw new Error('x'); } })).why, 'it could not germinate');
});

test('germination never reads the network — the seal check included', async () => {
  const g = globalThis, saved = { fetch: g.fetch, XMLHttpRequest: g.XMLHttpRequest, WebSocket: g.WebSocket, importScripts: g.importScripts };
  let touched = 0;
  const trap = () => { touched++; throw new Error('network'); };
  Object.assign(g, { fetch: trap, XMLHttpRequest: function () { trap(); }, WebSocket: function () { trap(); }, importScripts: trap });
  try {
    const r = await Γ.germinate(ORIGIN.text, REF);
    assert.equal(r.ok, true);
    assert.equal(r.organism.organs.filter((x) => x.state === 'live').length, 4);
  } finally { Object.assign(g, saved); }
  assert.equal(touched, 0);
});

test('answer abstains on anything it cannot vouch for — and never throws', async () => {
  const o = await grown(REF);
  const x = Γ.caseOf(DATA.triage, DATA.triage.heldRows[0]);
  assert.deepEqual(Γ.answer(o, 'weather', x), { verdict: 'ABSTAIN', why: 'it has no organ for weather' });
  const organ = o.organs.find((y) => y.domain === 'triage'), feat = organ.body.rules[0].feat;
  for (const v of [undefined, '5', NaN, Infinity, null]) assert.deepEqual(Γ.answer(o, 'triage', { ...x, [feat]: v }), { verdict: 'ABSTAIN', why: 'the case lacks a measurement its rules read' }, String(v));
  assert.equal(Γ.answer(o, 'triage', { ...x, unrelated: 'x' }).verdict, 'VERIFIED', 'a field its rules do not read changes nothing');
  // a measurement exactly on a rule's line: an at-most rule fires, an above rule does not
  const on = Object.fromEntries(organ.body.rules.map((r) => [r.feat, r.v]));
  const fired = Γ.answer(o, 'triage', { ...x, ...on }).fired;
  assert.deepEqual(fired, organ.body.rules.filter((r) => r.op === '<='));
  assert.ok(organ.body.rules.some((r) => r.op === '<=') && organ.body.rules.some((r) => r.op === '>'), 'the triage organ has rules of both kinds');
  for (const [org, d, c] of [[null, 'triage', x], [{}, 'triage', x], [o, 'triage', null], [{ organs: [{ domain: 'triage', state: 'live' }] }, 'triage', x]]) assert.deepEqual(Γ.answer(org, d, c), { verdict: 'ABSTAIN', why: 'the case could not be read' });
});

test('stable: one byte form — sorted keys, finite numbers, plain data only', () => {
  assert.equal(Γ.stable({ b: [1, 0.5, -2e-7], a: { d: true, c: null }, e: 'x"y' }), '{"a":{"c":null,"d":true},"b":[1,0.5,-2e-7],"e":"x\\"y"}');
  assert.equal(Γ.stable({ z: 1, a: 2 }), Γ.stable({ a: 2, z: 1 }));
  assert.deepEqual([Γ.stable(false), Γ.stable(0.1 + 0.2), Γ.stable([])], ['false', '0.30000000000000004', '[]']);
  for (const bad of [NaN, Infinity, -Infinity, undefined, () => 1, new Date(0), new Map(), Symbol('s'), 10n, { a: NaN }, [Infinity]]) assert.throws(() => Γ.stable(bad), String(typeof bad));
  assert.throws(() => Γ.stable(Object.create(null)), 'an object with no prototype is not a plain record');
});

test('sizes and cases: the genome that travels against the organism it grows into', async () => {
  const o = await grown(REF);
  const s = Γ.sizes(ORIGIN.text, o);
  assert.equal(s.genomeBytes, 496);
  assert.equal(s.grownBytes, new TextEncoder().encode(JSON.stringify(o.organs.map((x) => x.body))).length);
  assert.equal(s.ratio, Math.round((s.grownBytes / 496) * 1e6) / 1e6);
  const { water, ...rest } = DATA;
  assert.ok(Γ.sizes(ORIGIN.text, await grown({ name: 'no-water', data: rest })).grownBytes < s.grownBytes, 'only live organs count');
  assert.deepEqual(Γ.sizes('', { organs: [] }), { genomeBytes: 0, grownBytes: 2, ratio: 0 });
  const c = Γ.caseOf(DATA.triage, 3);
  assert.deepEqual(Object.keys(c), DATA.triage.features);
  assert.equal(c.spO2, DATA.triage.cols.spO2[3]);
});

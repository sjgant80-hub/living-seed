import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../src/body.mjs';
import { germinate, answer, caseOf, stable } from '../src/germinate.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { seal } from '../src/genome.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const run = JSON.parse(readFileSync(new URL('../data/seed-library-run.json', import.meta.url), 'utf8'));
const CSV = readFileSync(new URL('../data/online_shoppers_intention.csv', import.meta.url), 'utf8');
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })]));
const MAKER = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
const ORIGIN = await seal({ name: 'origin', organs: run.library.seeds.map((s) => s.seed) }, MAKER);
const REF = { name: 'reference', data: DATA };
const ORG = (await germinate(ORIGIN.text, REF)).organism;
const BODY = B.embody(ORG, REF).body;

test('fingerprint and membership: the shape of a feature, and how well a value sits in it', () => {
  const ds = { cols: { a: [1, 2, 3, 4, 5, 6, 7, 8, 9] } };
  const fp = B.fingerprint(ds, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'a');
  assert.deepEqual(Object.keys(fp), ['min', 'q1', 'med', 'q3', 'max']);
  assert.deepEqual([fp.min, fp.max], [1, 9]);
  assert.ok(fp.q1 < fp.med && fp.med < fp.q3);
  const shape = { min: 0, q1: 2, med: 3, q3: 4, max: 10 };
  assert.deepEqual([B.membership(2, shape), B.membership(3, shape), B.membership(4, shape)], [1, 1, 1], 'the middle half, edges included');
  // outside: span = max(q3 - q1 = 2, (max - min) / 2 = 5) = 5
  assert.equal(B.membership(9, shape), Math.round(Math.exp(-1) * 1e6) / 1e6, 'five above the middle half: e^-1');
  assert.equal(B.membership(-3, shape), Math.round(Math.exp(-1) * 1e6) / 1e6, 'five below it');
  assert.equal(B.membership(1, { min: 1, q1: 2, med: 2, q3: 2, max: 2 }), Math.round(Math.exp(-2) * 1e6) / 1e6, 'a narrow shape: span from the range');
  assert.equal(B.membership(3, { min: 2, q1: 2, med: 2, q3: 2, max: 2 }) < 1e-6, true, 'a shape with no width: anything else is far');
  for (const bad of [NaN, Infinity, '3', null, undefined]) assert.equal(B.membership(bad, shape), 0);
  assert.equal(B.membership(3, null), 0);
});

test('embody: every live organ becomes a pattern with the shape of its own train data; the rest rest', async () => {
  assert.deepEqual(Object.keys(BODY.patterns), ['shopper', 'triage', 'water', 'crop']);
  assert.deepEqual([BODY.organism, BODY.genome, BODY.gate, BODY.resting], [ORG.id, ORIGIN.id, 0.6, []]);
  const p = BODY.patterns.triage, o = ORG.organs.find((x) => x.domain === 'triage');
  assert.deepEqual([p.rules, p.threshold, p.heldAuc, p.held, p.features], [o.body.rules, o.body.threshold, o.heldAuc, o.held, DATA.triage.features]);
  assert.deepEqual(p.shape.spO2, B.fingerprint(DATA.triage, DATA.triage.trainRows, 'spO2'));
  // a device with no water data: water rests, dormant, with its reason
  const { water, ...rest } = DATA;
  const nw = { name: 'no-water', data: rest }, o2 = (await germinate(ORIGIN.text, nw)).organism;
  const b2 = B.embody(o2, nw).body;
  assert.deepEqual(Object.keys(b2.patterns), ['shopper', 'triage', 'crop']);
  assert.deepEqual(b2.resting, [{ domain: 'water', state: 'dormant', why: 'this device holds no water data' }]);
  assert.deepEqual(B.ask(b2, B.ask.length ? caseOf(water, water.heldRows[0]) : {}, { domain: 'water' }), { verdict: 'ABSTAIN', why: 'its water organ is dormant: this device holds no water data' });
  // refusals
  assert.deepEqual(B.embody(null, REF), { ok: false, why: 'not an organism' });
  assert.deepEqual(B.embody({ organs: [] }, REF), { ok: false, why: 'not an organism' });
  assert.deepEqual(B.embody({ organs: [], id: '' }, REF), { ok: false, why: 'not an organism' });
  assert.deepEqual(B.embody(ORG, { name: 'elsewhere', data: DATA }), { ok: false, why: 'the body forms on the substrate the organism grew on' });
  assert.deepEqual(B.embody(ORG, null), { ok: false, why: 'the body forms on the substrate the organism grew on' });
  assert.deepEqual(B.embody({ ...ORG, organs: [{ domain: 'triage', state: 'live' }] }, REF), { ok: false, why: 'the body could not form' });
  assert.equal(B.embody(ORG, { name: 'reference' }).body.resting.length, 4, 'no data on the substrate: every organ rests');
});

test('ask: an organ that resembles the case answers exactly as the organ would, with a receipt that re-hashes', () => {
  let verified = 0, routedRight = 0, n = 0;
  for (const d of DOMAIN_IDS) {
    const ds = DATA[d];
    for (const i of ds.heldRows.slice(0, 150)) {
      n++;
      const x = caseOf(ds, i), a = B.ask(BODY, x, { domain: d }), o = answer(ORG, d, x);
      if (a.verdict === 'VERIFIED') {
        verified++;
        assert.deepEqual([a.label, a.score, a.threshold, a.domain, a.fired], [o.label, o.score, o.threshold, d, o.fired]);
        assert.ok(a.fit >= B.ROUTE_MIN);
        assert.equal(B.checkReceipt(a.receipt), true);
        assert.deepEqual([a.receipt.genome, a.receipt.organism, a.receipt.domain, a.receipt.label, a.receipt.gate], [ORIGIN.id, ORG.id, d, a.label, 0.6]);
      } else assert.match(a.why, /^out of distribution: the case is unlike the data its \w+ organ grew on$/);
      if (B.ask(BODY, x).domain === d) routedRight++;
    }
  }
  assert.ok(verified / n > 0.9, 'most unseen cases resemble their organ: ' + verified + '/' + n);
  assert.ok(routedRight / n > 0.9, 'unasked, most cases find their own organ: ' + routedRight + '/' + n);
});

test('ask abstains far from the data, on organs it lacks, on cases it cannot read — and never throws', () => {
  const ds = DATA.water, x = caseOf(ds, ds.heldRows[0]);
  const far = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v * 1000 + 1e6]));
  const a = B.ask(BODY, far);
  assert.equal(a.verdict, 'ABSTAIN');
  assert.equal(a.why, 'out of distribution: the case is unlike the data any organ grew on');
  assert.ok(a.fit < B.ROUTE_MIN);
  assert.equal(B.ask(BODY, far, { domain: 'water' }).why, 'out of distribution: the case is unlike the data its water organ grew on');
  assert.deepEqual(B.ask(BODY, x, { domain: 'weather' }), { verdict: 'ABSTAIN', why: 'it has no organ for weather' });
  // a case missing one measurement fits no organ fully
  const { ph, ...partial } = x;
  assert.equal(B.ask(BODY, partial, { domain: 'water' }).verdict, 'ABSTAIN');
  assert.equal(B.route(BODY, partial).find((r) => r.domain === 'water').fit, 0);
  for (const bad of [null, undefined, 7, 'x', [], [1]]) assert.deepEqual(B.ask(BODY, bad), { verdict: 'ABSTAIN', why: 'the case could not be read' });
  assert.equal(B.ask(null, x).verdict, 'ABSTAIN');
  assert.equal(B.ask({ patterns: {}, resting: [] }, x).why, 'out of distribution: the case is unlike the data any organ grew on');
  // exactly on the routing floor: answered; a hair under: refused
  const one = { patterns: { t: { domain: 't', rules: [{ feat: 'a', op: '>', v: 0, w: 1 }], threshold: 0, heldAuc: 0.9, held: 9, features: ['a'], shape: { a: { min: 0, q1: 0, med: 0, q3: 0, max: 2 } } } }, resting: [], genome: 'g', organism: 'o', gate: 0.6 };
  const at = (fit) => B.ask(one, { a: -Math.log(fit) });   // span = 1, so membership = fit
  assert.equal(at(B.ROUTE_MIN + 1e-6).verdict, 'VERIFIED');
  assert.equal(at(B.ROUTE_MIN - 1e-6).verdict, 'ABSTAIN');
  assert.equal(B.route(one, { a: -Math.log(B.ROUTE_MIN) })[0].fit, B.ROUTE_MIN);
  assert.equal(at(B.ROUTE_MIN).verdict, 'VERIFIED', 'exactly on the floor is in');
});

test('route: every organ ranked by fit, best first, ties by name', () => {
  const x = caseOf(DATA.crop, DATA.crop.heldRows[3]);
  const r = B.route(BODY, x);
  assert.equal(r.length, 4);
  assert.equal(r[0].domain, 'crop');
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].fit >= r[i].fit);
  assert.ok(r.slice(1).every((z) => z.fit === 0), 'a crop case measures none of the other organs’ features');
  assert.deepEqual(B.route(BODY, {}).map((z) => z.domain), ['shopper', 'triage', 'water', 'crop'], 'all zero: the genome’s order');
  // one measurement the rules never read, made NaN: the case is not fully measured, so no organ fits it
  const organ = BODY.patterns.crop, unread = organ.features.find((f) => !organ.rules.some((q) => q.feat === f));
  assert.ok(unread, 'the crop organ leaves a feature unread');
  assert.equal(B.ask(BODY, { ...x, [unread]: NaN }, { domain: 'crop' }).verdict, 'ABSTAIN');
  assert.equal(B.ask(BODY, { ...x, [unread]: '3' }, { domain: 'crop' }).verdict, 'ABSTAIN', 'text is not a measurement');
  assert.equal(B.ask(BODY, x, { domain: 'crop' }).verdict, 'VERIFIED');
});

test('receipts: any edited field breaks the hash', () => {
  const a = B.ask(BODY, caseOf(DATA.triage, DATA.triage.heldRows[0]), { domain: 'triage' });
  assert.equal(a.verdict, 'VERIFIED');
  for (const [k, v] of [['label', 1 - a.receipt.label], ['heldAuc', 0.99], ['domain', 'water'], ['organism', '0'.repeat(16)], ['fired', []], ['score', a.receipt.score + 1]]) assert.equal(B.checkReceipt({ ...a.receipt, [k]: v }), false, k);
  assert.equal(B.checkReceipt({ ...a.receipt, kind: 'x' }), false);
  assert.equal(B.checkReceipt({ ...a.receipt, hash: 7 }), false);
  for (const bad of [null, undefined, 'x', {}]) assert.equal(B.checkReceipt(bad), false);
});

test('cube: exact facts, every source kept, read back byte for byte, never blended or normalised', () => {
  let c = B.cube();
  assert.deepEqual(c, { facts: [], root: '0'.repeat(16) });
  const w = (f) => { const r = B.cubeWrite(c, f); assert.equal(r.ok, true, r.why); c = r.cube; return r.id; };
  const before = c;
  w({ key: 'recurrence', value: 6, source: 'eyeballed', ts: 1 });
  assert.deepEqual(before.facts, [], 'a write makes a new cube; the old one is untouched');
  w({ key: 'recurrence', value: 7, source: 'gated count', ts: 2 });
  w({ key: 'Recurrence', value: 'other', source: 'gated count', ts: 3 });
  w({ key: 'recurrence ', value: { nested: [1, 0.5] }, source: 'x', ts: 4 });
  assert.deepEqual(B.cubeRead(c, 'recurrence'), { verdict: 'EXACT', value: 7, source: 'gated count', ts: 2, id: c.facts[1].id });
  assert.equal(B.cubeRead(c, 'recurrence', { source: 'eyeballed' }).value, 6, 'one source’s own fact, never the other’s');
  assert.equal(B.cubeRead(c, 'Recurrence').value, 'other', 'case is part of the key');
  assert.deepEqual(B.cubeRead(c, 'recurrence ').value, { nested: [1, 0.5] }, 'so is a trailing space');
  assert.deepEqual(B.cubeHistory(c, 'recurrence').map((f) => f.value), [6, 7]);
  // a later write wins an exact tie; an older time loses even if written later
  w({ key: 't', value: 'a', source: 's', ts: 5 });
  w({ key: 't', value: 'b', source: 's', ts: 5 });
  w({ key: 't', value: 'c', source: 's', ts: 4 });
  assert.equal(B.cubeRead(c, 't').value, 'b');
  // missing: an abstention, not a guess
  assert.deepEqual(B.cubeRead(c, 'nothing'), { verdict: 'ABSTAIN', why: 'no fact under "nothing"' });
  assert.deepEqual(B.cubeRead(c, 'recurrence', { source: 'nobody' }), { verdict: 'ABSTAIN', why: 'no fact from "nobody" under "recurrence"' });
  // refusals
  for (const f of [null, {}, { key: '', value: 1, source: 's', ts: 1 }, { key: 'k', value: 1, source: '', ts: 1 }, { key: 7, value: 1, source: 's', ts: 1 }]) assert.deepEqual(B.cubeWrite(c, f), { ok: false, why: 'a fact needs a key and a source' });
  for (const ts of [NaN, Infinity, '1', undefined]) assert.deepEqual(B.cubeWrite(c, { key: 'k', value: 1, source: 's', ts }), { ok: false, why: 'a fact needs a time' });
  for (const value of [NaN, () => 1, new Date(0), undefined]) assert.deepEqual(B.cubeWrite(c, { key: 'k', value, source: 's', ts: 1 }), { ok: false, why: 'the value is not plain data' });
  assert.equal(B.cubeWrite(c, { key: 'k', value: null, source: 's', ts: 0 }).ok, true, 'null and time zero are facts');
});

test('cube check: every id and the chain re-derive; an edit, a removal or a reorder is found where it happened', () => {
  let c = B.cube();
  for (let i = 0; i < 5; i++) c = B.cubeWrite(c, { key: 'k' + i, value: i, source: 's', ts: i }).cube;
  assert.deepEqual(B.cubeCheck(c), { ok: true, at: -1 });
  const edit = { ...c, facts: c.facts.map((f, i) => (i === 2 ? { ...f, value: 99 } : f)) };
  assert.deepEqual(B.cubeCheck(edit), { ok: false, at: 2 });
  assert.deepEqual(B.cubeCheck({ ...c, facts: c.facts.slice(0, 4) }), { ok: false, at: 4 }, 'the last fact removed: the chain no longer reaches the root');
  assert.deepEqual(B.cubeCheck({ ...c, facts: [c.facts[1], c.facts[0], ...c.facts.slice(2)] }), { ok: false, at: 5 }, 'reordered: every fact is genuine, the chain is not');
  assert.deepEqual(B.cubeCheck({ ...c, root: 'f'.repeat(16) }), { ok: false, at: 5 });
  assert.deepEqual(B.cubeCheck(B.cube()), { ok: true, at: -1 });
  assert.deepEqual(B.cubeCheck(null), { ok: false, at: 0 });
});

test('memory: each episode names the one before it; any edit breaks the chain where it happened', () => {
  let m = B.memory();
  const r = (ep) => { const x = B.remember(m, ep); assert.equal(x.ok, true, x.why); m = x.memory; return x.id; };
  const a = r({ text: 'the genome was sealed before it was measured', what: 'seal', when: 1, why: 'order matters' });
  const b = r({ text: 'the shop organ cleared the gate at AUC 0.815', what: 'measure', when: 2, why: 'the receipt' });
  assert.deepEqual(m.entries.map((e) => [e.n, e.prev, e.id]), [[0, null, a], [1, a, b]]);
  assert.deepEqual(B.memoryCheck(m), { ok: true, at: -1 });
  assert.deepEqual(B.memoryCheck({ entries: [m.entries[0], { ...m.entries[1], text: 'edited' }] }), { ok: false, at: 1 });
  assert.deepEqual(B.memoryCheck({ entries: [m.entries[1], m.entries[0]] }), { ok: false, at: 0 });
  assert.deepEqual(B.memoryCheck({ entries: [m.entries[0], { ...m.entries[1], prev: null }] }), { ok: false, at: 1 });
  assert.deepEqual(B.memoryCheck({ entries: [m.entries[0], { ...m.entries[1], n: 2 }] }), { ok: false, at: 1 });
  assert.deepEqual(B.memoryCheck({ entries: [{ ...m.entries[0], when: 9 }] }), { ok: false, at: 0 });
  // a forger who re-hashes the entry they changed: the id holds, the chain does not
  const reHash = ({ id, ...core }) => ({ ...core, id: sha256Hex(stable(core)).slice(0, 16) });
  assert.deepEqual(B.memoryCheck({ entries: [m.entries[0], reHash({ ...m.entries[1], prev: null })] }), { ok: false, at: 1 }, 'cut loose from the entry before it');
  assert.deepEqual(B.memoryCheck({ entries: [m.entries[0], reHash({ ...m.entries[1], n: 5 })] }), { ok: false, at: 1 }, 'out of its place');
  assert.deepEqual(B.memoryCheck({ entries: [reHash({ ...m.entries[0], text: 'rewritten' })] }), { ok: true, at: -1 }, 'a lone first entry re-hashed is indistinguishable — the chain protects what follows it, not the newest entry');
  assert.deepEqual(B.memoryCheck(B.memory()), { ok: true, at: -1 });
  assert.deepEqual(B.memoryCheck(null), { ok: false, at: 0 });
  for (const ep of [null, {}, { text: '', what: 'w', when: 1, why: 'y' }, { text: 't', what: '', when: 1, why: 'y' }, { text: 't', what: 'w', when: 1, why: '' }]) assert.deepEqual(B.remember(m, ep), { ok: false, why: 'a memory needs its text, what it is, and why it was kept' });
  for (const when of [NaN, Infinity, '1']) assert.deepEqual(B.remember(m, { text: 't', what: 'w', when, why: 'y' }), { ok: false, why: 'a memory needs a time' });
  assert.deepEqual(B.remember(null, { text: 't', what: 'w', when: 1, why: 'y' }), { ok: false, why: 'the memory could not be written' });
});

test('recall: lexical and geometric rankings fused; nothing that shares no evidence with the query', () => {
  let m = B.memory();
  const eps = [
    ['the genome was sealed before it was measured', 'seal'],
    ['the shop organ cleared the gate at a held-out AUC of 0.815', 'measure'],
    ['the water organ stayed dormant on the device with no water samples', 'dormant'],
    ['one changed character in the genome is refused before parsing', 'tamper'],
  ];
  eps.forEach(([text, what], i) => { m = B.remember(m, { text, what, when: i, why: 'test' }).memory; });
  const top = (q, o) => B.recall(m, q, o).map((h) => h.what);
  assert.equal(top('dormant water')[0], 'dormant');
  assert.equal(top('which organ cleared the gate?')[0], 'measure');
  assert.equal(top('refusing tampered genomes')[0], 'tamper', 'a word form it never saw ("tampered", "refusing") still lands, by its trigrams');
  assert.deepEqual(top('xylophone quartz'), [], 'no shared evidence: nothing returned');
  assert.deepEqual(top('genome', { k: 1 }).length, 1);
  assert.deepEqual(top('genome', { k: 0 }), []);
  const h = B.recall(m, 'sealed before measured')[0];
  assert.deepEqual(Object.keys(h), ['id', 'text', 'what', 'when', 'why', 'bm25', 'cosine', 'fused', 'rank']);
  assert.equal(h.fused, Math.round((1 / 61 + 1 / 61) * 1e6) / 1e6, 'first by both rankings');
  assert.deepEqual([h.what, h.rank, h.id], ['seal', 1, m.entries[0].id]);
  assert.ok(h.bm25 > 0 && h.cosine > 0);
  assert.deepEqual(B.recall(B.memory(), 'genome'), []);
  assert.deepEqual(B.recall(m, '  !! '), [], 'a query with no words');
  assert.deepEqual(B.recall(null, 'genome'), []);
  // the floor: a purely geometric match must clear it
  assert.ok(B.recall(m, 'genomic', { floor: 0.99 }).every((x) => x.bm25 > 0));
});

test('fuse: lexical rank counts only where a word is shared; the floor is exclusive; ranks start at 1', () => {
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  assert.deepEqual(B.ranks([0.2, 0.9, 0.2, 0.5]), [3, 1, 4, 2], 'ties keep their order');
  assert.deepEqual(B.ranks([]), []);
  // item 1 shares a word; items 0 and 2 do not, and must not collect a lexical share for it
  assert.deepEqual(B.fuse([0, 0.5, 0], [0.9, 0.1, 0.5], { floor: 0 }), [
    { i: 1, fused: r6(1 / 61 + 1 / 63) }, { i: 0, fused: r6(1 / 61) }, { i: 2, fused: r6(1 / 62) }]);
  assert.deepEqual(B.fuse([0, 0], [0.2, 0.3], { floor: 0.2 }).map((x) => x.i), [1], 'a cosine exactly on the floor is out');
  assert.deepEqual(B.fuse([0.1, 0], [0, 0], {}).map((x) => x.i), [0], 'a shared word is in whatever its cosine');
  assert.deepEqual(B.fuse([1, 2, 3], [1, 2, 3], { k: 2 }).map((x) => x.i), [2, 1]);
  assert.deepEqual(B.fuse([1], [1], { k: -1 }), []);
  assert.deepEqual(B.fuse([], []), []);
});

test('vectors and words: deterministic, unit length, the same text in the same place', () => {
  // one word of n letters places n + 1 tokens: the word and its n trigrams (no two collide for these words)
  const used = (t) => B.vectorOf(t).filter((x) => x !== 0).length;
  assert.deepEqual([used('ab'), used('seed'), used('genome')], [3, 5, 7]);
  assert.deepEqual(B.words('The Shop, 0.815 — AUC!'), ['the', 'shop', '0', '815', 'auc']);
  assert.deepEqual(B.words(''), []);
  const v = B.vectorOf('the shop organ');
  assert.equal(v.length, B.DIMS);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-5);
  assert.deepEqual(B.vectorOf('the shop organ'), v);
  assert.deepEqual(B.vectorOf(''), new Array(B.DIMS).fill(0));
});

test('the slot: a proposer may name an organ, never answer — and is marked ungraded every time', () => {
  const says = (domain) => () => ({ domain });
  assert.deepEqual(B.imagine(BODY, 'will this visitor buy?', says('shopper')), { graded: false, proposal: 'shopper', why: 'a proposal only: to answer, give the case its measurements and ask the shopper organ' });
  assert.deepEqual(B.imagine(BODY, 'x', says('weather')), { graded: false, proposal: null, why: 'the proposer named "weather", which this body has no live organ for' });
  assert.deepEqual(B.imagine(BODY, 'x', () => ({})), { graded: false, proposal: null, why: 'the proposer named no organ' });
  assert.deepEqual(B.imagine(BODY, 'x', null), { graded: false, proposal: null, why: 'the proposer named no organ' });
  assert.deepEqual(B.imagine(BODY, 'x', () => { throw new Error('boom'); }), { graded: false, proposal: null, why: 'the proposer failed' });
  let seen = null;
  B.imagine(BODY, 42, (t) => { seen = t; return null; });
  assert.equal(seen, '42', 'the proposer is handed text');
});

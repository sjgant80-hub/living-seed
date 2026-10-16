// organism.test.mjs — organ 11, unit-tested on toy data made here (no real organ-11 result is seen before its seal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../src/organism.mjs';
import { life } from '../src/align.mjs';
import { seal, open } from '../src/genome.mjs';
import { cardOf } from '../src/card.mjs';
import { encodeSeed, stemGenome, rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/organism-' + s)));
function world(seed, n = 900) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0; }
  return { ok: true, name: 'alpha', features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(180).keys()].map((i) => i + 420) };
}
const DS = world(1), SUB = { name: 'toy', data: { alpha: DS } };
const CASES = [...Array(120).keys()].map((i) => ({ domain: 'alpha', row: 600 + i, truth: DS.y[600 + i] }));
const recipe = encodeSeed({ domain: 'alpha', seed: 1, genome: stemGenome() });
let G;
const genome = async () => G || (G = (await seal({ name: 'toy', gate: { auc: 0.6 }, organs: [recipe] }, await key('maker'))).text);

test('boot: a card opens to its genome — under the device’s trust; a card it cannot read, or a maker it does not trust, never germinates', async () => {
  const g = await genome(), maker = await key('maker'), png = (await cardOf(g)).png;
  const b = await O.boot(png, { trust: [maker.pub] });
  assert.equal(b.ok, true);
  assert.equal(b.genome, g);
  assert.equal(b.id, (await open(g)).id);
  assert.deepEqual(b.fields.organs, [recipe]);
  assert.equal((await O.boot(png)).ok, true, 'no trust list: any valid maker');
  const r = await O.boot(png, { trust: [(await key('someone')).pub] });
  assert.equal(r.ok, false);
  assert.match(r.why, /^the card was refused: the genome in the card was refused: /);
  assert.equal((await O.boot(new Uint8Array([1, 2, 3]))).ok, false);
});

test('reproduce: the child as a card that gives back the very genome it was made from', async () => {
  const g = await genome(), c = await O.reproduce(g);
  assert.equal(c.ok, true);
  assert.equal((await O.boot(c.png)).genome, g);
  assert.deepEqual(await O.reproduce('not a genome'), { ok: false, why: 'no card could be made: only a genome that opens becomes a card: not a genome' });
});

test('memory: written down, signed by the device; waking lives it again and must arrive at the same head', async () => {
  const g = await genome(), dev = await key('device'), l = await life(g, SUB, CASES);
  const text = await O.remember(g, CASES, l.head, dev), m = JSON.parse(text);
  assert.deepEqual(Object.keys(m), ['kind', 'v', 'genome', 'cases', 'head', 'by', 'sig']);
  assert.equal(m.kind, O.MEMORY);
  assert.deepEqual(m.cases[0], ['alpha', 600, DS.y[600]]);
  const w = await O.wake(text, SUB, { self: [dev.pub] });
  assert.equal(w.ok, true);
  assert.equal(w.life.head, l.head);
  assert.deepEqual(w.cases, CASES);
  assert.equal(w.genome, g);
  // continuing from the memory is the same as never having stopped
  const more = [...Array(60).keys()].map((i) => ({ domain: 'alpha', row: 720 + i, truth: DS.y[720 + i] }));
  assert.equal((await life(w.genome, SUB, [...w.cases, ...more])).head, (await life(g, SUB, [...CASES, ...more])).head);
});

test('memory: a changed case, a forged signature, another device, a different past or different data — it will not wake', async () => {
  const g = await genome(), dev = await key('device'), other = await key('other'), l = await life(g, SUB, CASES);
  const text = await O.remember(g, CASES, l.head, dev), m = JSON.parse(text);
  const W = (t, sub = SUB, opts = { self: [dev.pub] }) => O.wake(typeof t === 'string' ? t : JSON.stringify(t), sub, opts);
  const flipped = { ...m, cases: m.cases.map((c, i) => (i === 7 ? [c[0], c[1], 1 - c[2]] : c)) };
  assert.deepEqual(await W(flipped), { ok: false, why: 'the memory was changed after it was written' });
  assert.deepEqual(await W({ ...m, cases: m.cases.slice(1) }), { ok: false, why: 'the memory was changed after it was written' });
  assert.deepEqual(await W({ ...m, head: '0'.repeat(16) }), { ok: false, why: 'the memory was changed after it was written' });
  assert.deepEqual(await W(text, SUB, { self: [other.pub] }), { ok: false, why: 'the memory was not written by this device' });
  assert.deepEqual(await W(text, SUB, {}), { ok: false, why: 'the memory was not written by this device' });
  assert.deepEqual(await W({ ...m, by: other.pub }, SUB, { self: [other.pub] }), { ok: false, why: 'the memory was changed after it was written' }, 'another key named, the old signature');
  // a past that never happened, signed properly: living it again does not arrive at the head it claims
  const lie = JSON.parse(await O.remember(g, CASES.slice(1), l.head, dev));
  assert.deepEqual(await W(lie), { ok: false, why: 'living its memory again does not arrive where it left off — the data under it is not what it lived' });
  // the boundary, said plainly: the ledger records acts, not the truths the world reported — a truth that changed no act
  // leaves the same life, so only the signature vouches for it
  const quiet = JSON.parse(await O.remember(g, CASES.map((c, i) => (i === 7 ? { ...c, truth: 1 - c.truth } : c)), l.head, dev));
  assert.equal((await W(quiet)).ok, true);
  // the same memory on different data underneath
  const y = Uint8Array.from(DS.y); y[5] = 1 - y[5];
  assert.equal((await W(text, { name: 'toy', data: { alpha: { ...DS, y } } })).ok, false, 'its organ grew differently: the life does not match');
  assert.deepEqual(await W(text, SUB, { self: [dev.pub], trust: [other.pub] }), { ok: false, why: 'its genome was refused: untrusted maker' });
  assert.deepEqual(await W('not json'), { ok: false, why: 'the memory could not be read' });
  assert.deepEqual(await W({ ...m, kind: 'x' }), { ok: false, why: 'not a memory' });
  assert.deepEqual(await W({ ...m, v: 2 }), { ok: false, why: 'not a memory' });
  assert.deepEqual(await W({ ...m, cases: 'all' }), { ok: false, why: 'not a memory' });
  assert.deepEqual(await W(null), { ok: false, why: 'the memory could not be read' });
});

test('improve: evolved on the device’s own data, blind to what it is judged on, adopted only through the gate; the device seals the child', async () => {
  const g = await genome(), dev = await key('device'), r = await O.improve(g, SUB, dev, { evolve: { generations: 6, children: 4, folds: 3, seed: 1 } });
  assert.equal(r.ok, true);
  const child = await open(r.child);
  assert.deepEqual(child.fields.parents, [(await open(g)).id], 'it names its parent');
  assert.equal(child.fields.by || child.fields.maker || dev.pub, dev.pub);
  assert.equal(r.id, child.id);
  assert.equal(r.organs.length, 1);
  const o = r.organs[0];
  assert.equal(o.domain, 'alpha');
  if (o.adopted) { assert.ok(o.to - o.from > 0.002); assert.notEqual(child.fields.organs[0], recipe); }
  else { assert.equal(child.fields.organs[0], recipe, 'kept as it was'); assert.ok(o.candidate === null || o.candidate - o.from <= 0.002); }
  assert.equal(o.adopted, true, 'on this toy, evolution finds a verified gain');
  const E = { generations: 6, children: 4, folds: 3, seed: 1 }, gain = o.to - o.from;
  const exact = await O.improve(g, SUB, dev, { evolve: E, margin: gain });
  assert.equal(exact.organs[0].adopted, false, 'a gain exactly on the margin is not a gain');
  assert.equal(exact.organs[0].candidate, o.to);
  assert.equal((await O.improve(g, SUB, dev, { evolve: E, margin: gain - 1e-9 })).organs[0].adopted, true);
  const failed = await O.improve(g, SUB, dev, { evolve: { generations: 0 } });
  assert.deepEqual(failed.organs[0], { domain: 'alpha', adopted: false, from: o.from, candidate: null, why: 'no candidate beat it on cases the evolver never saw' }, 'an evolution that could not run adopts nothing');
  // a margin no candidate can beat: nothing is adopted, and the child carries the parent's recipe
  const none = await O.improve(g, SUB, dev, { evolve: { generations: 2, children: 2, folds: 3, seed: 1, margin: 1 } });
  assert.equal(none.organs[0].adopted, false);
  // an organ that is not live here is passed on unchanged
  const dormant = await O.improve(g, { name: 'toy', data: {} }, dev, { evolve: { generations: 2, children: 2 } });
  assert.deepEqual(dormant.organs, [{ domain: 'alpha', adopted: false, why: 'it is dormant here' }]);
  assert.deepEqual((await open(dormant.child)).fields.organs, [recipe]);
  assert.deepEqual(await O.improve('not a genome', SUB, dev), { ok: false, why: 'the genome was refused: not a genome' });
  assert.deepEqual(await O.improve(g, SUB, dev, { trust: [(await key('other')).pub] }), { ok: false, why: 'the genome was refused: untrusted maker' });
  assert.equal((await O.improve(g, SUB, { pub: 7 })).ok, false, 'no device keys, no child');
});

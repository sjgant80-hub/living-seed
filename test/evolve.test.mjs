// Organ 4's unit tests run on a small synthetic dataset made here, never on the four real domains: the measurement
// on those is sealed first (tools/seal-4.mjs), so nothing about it is seen before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/evolve.mjs';
import { encodeSeed, decodeSeed, stemGenome, rng, germinate as express, makeSeed } from '../vendor/seed-library/seedlib.mjs';

function toy(seed = 3, signal = true, n = 600) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10;
    y[i] = signal ? (cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0) : (r() < 0.3 ? 1 : 0);
  }
  return { ok: true, name: 'toy', features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(n - 420).keys()].map((i) => i + 420) };
}
const STEM = encodeSeed({ domain: 'toy', seed: 1, genome: stemGenome() });

test('blind: the same data with the held-out cases removed; the original untouched', () => {
  const ds = toy(), b = E.blind(ds);
  assert.deepEqual(b.heldRows, []);
  assert.equal(b.trainRows, ds.trainRows);
  assert.equal(b.cols, ds.cols);
  assert.equal(ds.heldRows.length, 180);
});

test('the evolver is never shown a held-out case, and refuses what it cannot evolve', () => {
  const ds = toy();
  assert.deepEqual(E.evolve(STEM, ds), { ok: false, why: 'the evolver is never shown the held-out cases — pass blind(dataset)' });
  assert.deepEqual(E.evolve(STEM, null), { ok: false, why: 'evolve needs a dataset' });
  assert.deepEqual(E.evolve(STEM, { trainRows: [] }), { ok: false, why: 'evolve needs a dataset' });
  const grow = encodeSeed(makeSeed({ domain: 'toy', seed: 1, grow: { population: 4, elites: 1, generations: 2 } }));
  assert.deepEqual(E.evolve(grow, E.blind(ds)), { ok: false, why: 'the recipe is not a fixed seed the ribosome reads' });
  assert.deepEqual(E.evolve('nonsense', E.blind(ds)), { ok: false, why: 'the recipe is not a fixed seed the ribosome reads' });
  for (const o of [{ generations: 0 }, { children: 0 }, { generations: 1.5 }, { children: '3' }]) assert.deepEqual(E.evolve(STEM, E.blind(ds), o), { ok: false, why: 'generations and children are whole numbers from 1' }, JSON.stringify(o));
  assert.deepEqual(E.evolve(STEM, { ...E.blind(ds), trainRows: [0] }), { ok: false, why: 'too few training cases to carve a validation slice' });
  assert.deepEqual(E.evolve(STEM, { ...E.blind(ds), cols: null }), { ok: false, why: 'the recipe could not be evolved' });
});

test('evolve: deterministic; the champion only ever moves up on validation, by more than the margin', () => {
  const b = E.blind(toy()), opts = { generations: 25, children: 6, seed: 4 };
  const e = E.evolve(STEM, b, opts);
  assert.equal(e.ok, true, e.why);
  assert.deepEqual(E.evolve(STEM, b, opts), e, 'the same seed, the same run');
  assert.notDeepEqual(E.evolve(STEM, b, { ...opts, seed: 5 }).trajectory, e.trajectory, 'another seed, another run');
  assert.equal(e.trajectory.length, 26);
  assert.equal(e.evals, 1 + 25 * 6);
  assert.equal(e.champion, e.accepted[e.accepted.length - 1].recipe);
  assert.deepEqual(e.accepted[0], { gen: 0, recipe: STEM, val: e.trajectory[0].val });
  for (let i = 1; i < e.accepted.length; i++) assert.ok(e.accepted[i].val > e.accepted[i - 1].val + E.MARGIN, 'each kept step beats the last by the margin');
  for (let i = 1; i < e.trajectory.length; i++) {
    const t = e.trajectory[i], prev = e.trajectory[i - 1];
    assert.ok(t.val >= prev.val, 'the champion never gets worse on validation');
    assert.equal(t.accepted, t.val > prev.val, 'it moves exactly when a child was accepted');
    assert.equal(t.accepted, t.best - prev.val > E.MARGIN);
    if (!t.accepted) assert.equal(t.val, prev.val);
    assert.ok(t.k >= E.K_MIN && t.k <= E.K_MAX);
  }
  assert.ok(e.accepted.length >= 2, 'there is signal in the toy data: it climbs at least once');
  assert.ok(e.trajectory[25].val > e.trajectory[0].val);
  for (const a of e.accepted) { const d = decodeSeed(a.recipe); assert.equal(d.ok, true); assert.equal(encodeSeed(d.seed), a.recipe); assert.equal(d.seed.domain, 'toy'); }
  // the step size moves with the success rate — it is regulated, not fixed
  assert.ok(new Set(e.trajectory.map((t) => t.k)).size >= 2, 'k changed during the run');
  assert.equal(E.evolve(STEM, b, { generations: 3, children: 2, seed: 4, k: 99 }).trajectory[0].k, E.K_MAX, 'a starting step is held inside its bounds');
  assert.equal(E.evolve(STEM, b, { generations: 3, children: 2, seed: 4, k: -3 }).trajectory[0].k, E.K_MIN);
  assert.equal(E.evolve(STEM, b, { generations: 1 }).trajectory.length, 2, 'defaults fill in the rest');
  assert.equal(E.evolve(STEM, b, { generations: 3, children: 1, seed: 4 }).evals, 4, 'one child a generation is allowed');
  // the exact run, pinned: k single changes per child, and the earliest child wins a tie
  assert.deepEqual({ champion: e.champion, gens: e.accepted.map((a) => a.gen), ks: e.trajectory.map((t) => t.k).join('') },
    { champion: '◊ seed.v1 toy 1 f:3ddcc6ad5ce92dd9d62d 93b0813bf445', gens: [0, 1, 3], ks: '22345677765432111111111111' });
});

test('a tie between children goes to the earliest — pinned on a small set where validation scores tie often', () => {
  const r = rng(3), n = 60, cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0; }
  const small = { ok: true, name: 'toy', features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(42).keys()], heldRows: [...Array(18).keys()].map((i) => i + 42) };
  const e = E.evolve(STEM, E.blind(small), { generations: 15, children: 8, seed: 4 });
  assert.deepEqual({ champion: e.champion, gens: e.accepted.map((a) => a.gen) }, { champion: '◊ seed.v1 toy 1 f:31d8c6ed9e8e11ddd62d d39b059e15d9', gens: [0, 1, 2, 5] });
});

test('the margin is exclusive: a gain exactly equal to it is not kept', () => {
  const b = E.blind(toy()), opts = { generations: 25, children: 6, seed: 4 };
  const free = E.evolve(STEM, b, { ...opts, margin: 0 });
  const [first, second] = free.accepted, gain = second.val - first.val;
  assert.ok(gain > 0);
  const strict = E.evolve(STEM, b, { ...opts, margin: gain });
  assert.equal(strict.trajectory[second.gen].accepted, false, 'the same child, the same gain, now not enough');
  assert.equal(strict.trajectory[second.gen].best, second.val);
});

test('the one-fifth rule: steps grow when more than one in five recent generations win, shrink when fewer', () => {
  assert.equal(E.nextStep(3, [true, true, false, false, false]), 4);
  assert.equal(E.nextStep(3, [true, false, false, false, false]), 3, 'exactly one in five: unchanged');
  assert.equal(E.nextStep(3, [false, false, false, false, false]), 2);
  assert.equal(E.nextStep(3, []), 2, 'no history counts as no success');
  assert.equal(E.nextStep(E.K_MAX, [true, true, true]), E.K_MAX, 'capped');
  assert.equal(E.nextStep(E.K_MIN, [false]), E.K_MIN, 'floored');
  assert.equal(E.nextStep(1, [true]), 2);
  // the window: only the last five generations count
  const b = E.blind(toy()), e = E.evolve(STEM, b, { generations: 40, children: 4, seed: 9 });
  let k = e.trajectory[0].k;
  const hist = [];
  for (let i = 1; i < e.trajectory.length; i++) { hist.push(e.trajectory[i].accepted); assert.equal(e.trajectory[i].k, k, 'gen ' + i); k = E.nextStep(k, hist.slice(-E.WINDOW)); }
});

test('the separate judge reads the held-out cases the evolver never saw', () => {
  const ds = toy(), e = E.evolve(STEM, E.blind(ds), { generations: 20, children: 6, seed: 2 });
  const j = E.judge(e.accepted.map((a) => a.recipe), ds);
  assert.equal(j.length, e.accepted.length);
  for (const [i, x] of j.entries()) { assert.equal(x.recipe, e.accepted[i].recipe); assert.equal(x.heldAuc, express(ds, x.recipe).heldAuc); assert.equal(typeof x.heldAcc, 'number'); }
  assert.deepEqual(E.judge(['nonsense'], ds), [{ recipe: 'nonsense', error: 'not a seed (missing ◊ seed.v1 tag)' }]);
  assert.deepEqual(E.judge([], ds), []);
});

test('with no signal at all, validation can still rise — that is what the separate judge is for', () => {
  const ds = toy(8, false), e = E.evolve(STEM, E.blind(ds), { generations: 30, children: 8, seed: 3 });
  assert.equal(e.ok, true);
  const held = E.judge([e.champion], ds)[0].heldAuc;
  assert.ok(held > 0.35 && held < 0.65, 'no signal on unseen cases: ' + held);
});

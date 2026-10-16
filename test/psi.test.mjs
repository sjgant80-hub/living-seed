// Ψ's unit tests use small made-up cases, so nothing about the real organs' self-models is seen before organ 7's seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/psi.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';

// cases where being right depends on the margin (big margin: usually right) and a little on the fit
function cases(n, seed) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) { const margin = Math.round(r() * 300) / 100, fit = Math.round(r() * 100) / 100; out.push({ margin, fit, right: r() < 0.45 + 0.15 * margin + 0.1 * fit ? 1 : 0 }); }
  return out;
}

test('introspect: the organism’s margin from its own line, and its resemblance to its data', () => {
  const pattern = { rules: [{ feat: 'a', op: '>', v: 1, w: 2 }, { feat: 'b', op: '<=', v: 5, w: -0.5 }], threshold: 1, features: ['a', 'b'], shape: { a: { min: 0, q1: 1, med: 2, q3: 3, max: 4 }, b: { min: 0, q1: 2, med: 5, q3: 8, max: 10 } } };
  // b = 9 sits 1 above b's middle half; its span is max(q3 − q1 = 6, half the range = 5) = 6
  assert.deepEqual(P.introspect(pattern, { a: 2, b: 9 }), { score: 2, label: 1, margin: 1, fit: Math.round((1 + Math.round(Math.exp(-1 / 6) * 1e6) / 1e6) / 2 * 1e6) / 1e6 });
  assert.deepEqual(P.introspect(pattern, { a: 1, b: 5 }), { score: -0.5, label: 0, margin: 1.5, fit: 1 });
  assert.equal(P.introspect(pattern, { a: 1.5, b: 6 }).label, 1, 'above the line: yes');
  assert.equal(P.introspect({ ...pattern, threshold: 2 }, { a: 1.5, b: 6 }).label, 0, 'exactly on the line: no');
});

test('bins: equal-count edges from the data; values on an edge go up', () => {
  assert.deepEqual(P.edgesOf([5, 1, 4, 2, 3, 6], 3), [3, 5]);
  assert.deepEqual(P.edgesOf([1, 2, 3], 1), []);
  assert.deepEqual(P.edgesOf([7], 3), [7, 7]);
  assert.deepEqual([P.binOf(0, [3, 5]), P.binOf(3, [3, 5]), P.binOf(4, [3, 5]), P.binOf(5, [3, 5]), P.binOf(9, [3, 5])], [0, 1, 1, 2, 2]);
  assert.equal(P.binOf(1, []), 0);
});

test('refine: each bin moves from the back-folded prior toward its evidence, as far as its count warrants', () => {
  const cs = [{ margin: 0, fit: 0.1, right: 1 }, { margin: 0, fit: 0.1, right: 1 }, { margin: 2, fit: 0.9, right: 0 }];
  const psi0 = P.refine(cs, 1, null, null);
  assert.deepEqual(psi0.mEdges, []);
  // one margin bin; fit bins 0 and 2 hold evidence: prior = the base rate 2/3
  const base = 2 / 3, w = (n) => n / (n + P.STRENGTH);
  assert.equal(psi0.table[0][0], Math.round((base + (1 - base) * w(2)) * 1e6) / 1e6);
  assert.equal(psi0.table[0][2], Math.round((base + (0 - base) * w(1)) * 1e6) / 1e6);
  assert.equal(psi0.table[0][1], Math.round(base * 1e6) / 1e6, 'an empty bin is the prior');
  // with two earlier models the prior is their average at the bin's centre
  const a = { k: 1, mEdges: [], table: [[0.2, 0.2, 0.2]] }, b = { k: 1, mEdges: [], table: [[0.6, 0.6, 0.6]] };
  const r = P.refine([{ margin: 1, fit: 0.5, right: 1 }], 1, a, b);
  assert.equal(r.table[0][1], Math.round((0.4 + 0.6 * w(1)) * 1e6) / 1e6, 'prior (0.2 + 0.6) / 2 moved toward 1');
  assert.equal(r.table[0][0], 0.4, 'an empty bin keeps the back-folded prior');
  assert.equal(P.refine([{ margin: 1, fit: 0.5, right: 1 }], 1, a, null).table[0][0], 0.2, 'with one earlier model the prior is that model');
  assert.equal(P.refine([], 1, null, null).table[0][0], 0.5, 'no evidence at all: a coin');
  assert.equal(P.read(psi0, 0, 1), psi0.table[0][2], 'a fit of 1 reads the top fit bin');
});

test('the climb: up the Fibonacci resolutions, each from the last two models; error falls and the steps settle', () => {
  const train = cases(3000, 1), held = cases(1500, 2);
  const c = P.climb(train, held);
  assert.deepEqual(c.steps.map((s) => s.k), [1, 2, 3, 5, 8, 13, 21, 34]);
  assert.equal(c.models.length, 8);
  assert.ok(c.models.every((m, i) => m.table.length === c.steps[i].k));
  assert.ok(c.steps[7].heldBrier < c.steps[0].heldBrier, 'self-knowledge beats the base rate on unseen cases');
  assert.ok(c.steps[7].moved < c.steps[2].moved, 'the steps get smaller');
  assert.equal(c.steps[0].moved, 0);
  assert.deepEqual(P.climb(train, held), c, 'deterministic');
  // the back-fold, exactly: each model is refined from the last TWO
  for (let i = 2; i < c.models.length; i++) assert.deepEqual(c.models[i], P.refine(train, P.FIB[i - 1], c.models[i - 1], c.models[i - 2]), 'Ψ' + i);
  assert.deepEqual(c.models[1], P.refine(train, 2, c.models[0], undefined));
  assert.notDeepEqual(P.refine(train, 3, c.models[1], c.models[0]), P.refine(train, 3, c.models[1], c.models[1]), 'the second model really is in the prior');
  assert.equal(P.brier({ k: 1, mEdges: [], table: [[1, 1, 1]] }, [{ margin: 0, fit: 0, right: 1 }, { margin: 0, fit: 0, right: 0 }]), 0.5);
  assert.equal(P.brier(c.models[0], []), 0);
  assert.equal(P.moved(c.models[1], c.models[1], held), 0);
  assert.equal(P.moved(c.models[1], c.models[2], []), 0);
});

test('selective answering: keep only answers the self-model rates likely right, and accuracy rises as coverage falls', () => {
  const train = cases(3000, 1), held = cases(1500, 2), psi = P.climb(train, held).models[7];
  const all = P.selective(psi, held, 0), strict = P.selective(psi, held, 0.8);
  assert.equal(all.coverage, 1);
  assert.equal(all.accuracy, Math.round((held.reduce((a, c) => a + c.right, 0) / held.length) * 1e6) / 1e6);
  assert.ok(strict.coverage < 1 && strict.accuracy > all.accuracy);
  assert.deepEqual(P.selective(psi, held, 2), { coverage: 0, accuracy: 0 }, 'a bar no answer clears');
  const flat = { k: 1, mEdges: [], table: [[0.8, 0.8, 0.8]] };
  assert.equal(P.selective(flat, held, 0.8).coverage, 1, 'rated exactly at the bar: kept');
  assert.equal(P.selective(flat, held, 0.800001).coverage, 0);
  assert.deepEqual(P.selective(psi, [], 0.5), { coverage: 0, accuracy: 0 });
});

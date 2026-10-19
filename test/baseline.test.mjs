// baseline.test.mjs — the measuring stick is gated like everything else. Synthetic data only: no test reads a held-out
// shop session, so nothing here can steer organ 2c before its seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { single, solve, logistic, cuts, boosted, out, size } from '../src/baseline.mjs';
import { rng, auc } from '../vendor/seed-library/seedlib.mjs';

/** a synthetic table: purchases driven by a and (less) by b, c is noise; d is −1 for "missing" on some rows */
function table(n, seed) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cols.a[i] = Math.floor(r() * 20); cols.b[i] = r() * 5; cols.c[i] = r() * 3; cols.d[i] = r() < 0.2 ? -1 : r() * 2;
    y[i] = Number(r() < 1 / (1 + Math.exp(-(0.4 * cols.a[i] + 0.5 * cols.b[i] - 5))));
  }
  return { features: ['a', 'b', 'c', 'd'], cols, y };
}
const T = table(600, 7), ALL = Array.from({ length: 600 }, (_, i) => i), FIT = ALL.slice(0, 400), REST = ALL.slice(400);
const aucOn = (m, rows, ds = T) => auc(rows.map((i) => m.score(i)), rows.map((i) => ds.y[i]));
const sig = (p) => 1 / (1 + Math.exp(-p));
/** a copy of T whose rows outside FIT are garbage: a fit that reads only FIT cannot tell */
function poisoned() {
  const cols = Object.fromEntries(Object.entries(T.cols).map(([k, v]) => [k, Float64Array.from(v)])), y = Uint8Array.from(T.y);
  for (const i of REST) { for (const k of Object.keys(cols)) cols[k][i] = 1e6 * (i % 7) - 3; y[i] = 1 - y[i]; }
  return { features: T.features, cols, y };
}

test('one feature alone: its score is the measurement, and an unknown feature is refused', () => {
  const m = single(T, 'a');
  assert.equal(m.kind, 'single');
  assert.deepEqual(REST.slice(0, 5).map(m.score), REST.slice(0, 5).map((i) => T.cols.a[i]));
  assert.throws(() => single(T, 'nope'), /no feature nope/);
  assert.equal(size(m), 1);
});

test('solve: the exact solution, pivoting past a zero on the diagonal, and a singular system refused', () => {
  const x = solve([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
  assert.deepEqual(x.map((v) => Math.round(v * 1e9) / 1e9), [2, 3, -1]);
  const z = solve([[0, 1], [1, 0]], [5, 7]);   // a zero pivot: only a row swap solves it
  assert.deepEqual(z, [7, 5]);
  const w = solve([[1, 2], [3, 4]], [5, 6]);   // the larger pivot is the second row
  assert.deepEqual(w.map((v) => Math.round(v * 1e9) / 1e9), [-4, 4.5]);
  assert.throws(() => solve([[1, 2], [2, 4]], [1, 2]), /singular/);
  // equal pivots: the first is taken. Both are sound, but they round differently, and a fit must give the same bits everywhere
  const tie = solve([[3, -48 / 7, 25 / 7], [-3, 36 / 7, 8], [16 / 7, -25 / 7, 11 / 7]], [-11 / 7, 39 / 7, -11 / 7]);
  assert.equal(tie[0], -0.9022373265363927);
  assert.throws(() => solve([[1e-13, 0], [0, 1]], [1, 1]), /singular/);
  const s = solve([[4, 1, 0], [1, 3, 1], [0, 1, 2]], [1, 2, 3]);   // an upper triangle with a non-zero above the diagonal
  const back = [[4, 1, 0], [1, 3, 1], [0, 1, 2]].map((row) => row.reduce((a, v, k) => a + v * s[k], 0));
  assert.deepEqual(back.map((v) => Math.round(v * 1e9) / 1e9), [1, 2, 3]);
});

test('logistic regression: at its answer the penalised gradient is zero, it converged, and it ranks well', () => {
  const m = logistic(T, FIT);
  assert.equal(m.kind, 'logistic');
  assert.ok(m.steps >= 3 && m.steps < 50, 'converged by Newton steps: ' + m.steps);
  // the gradient of the penalised log-loss, computed here independently, is zero at the fitted weights
  const F = T.features, prep = (v) => Math.log1p(Math.max(0, v));
  const g = new Array(F.length + 1).fill(0);
  for (const i of FIT) {
    const x = [1, ...F.map((f, k) => (prep(T.cols[f][i]) - m.mean[k]) / m.sd[k])], p = sig(x.reduce((a, v, k) => a + v * m.weights[k], 0));
    x.forEach((v, k) => { g[k] += (p - T.y[i]) * v; });
  }
  for (let k = 1; k < g.length; k++) g[k] += m.lambda * m.weights[k];
  assert.ok(Math.max(...g.map(Math.abs)) < 1e-6, 'gradient ' + g.map((v) => v.toExponential(1)).join(' '));
  // the standardisation is the fitted rows' own, of log(1 + max(0, x))
  const ma = FIT.reduce((a, i) => a + Math.log1p(T.cols.a[i]), 0) / FIT.length;
  assert.ok(Math.abs(m.mean[0] - ma) < 1e-12);
  const sa = Math.sqrt(FIT.reduce((a, i) => a + (Math.log1p(T.cols.a[i]) - ma) ** 2, 0) / FIT.length);
  assert.ok(Math.abs(m.sd[0] - sa) < 1e-12);
  // a and b drive the purchases; it learns them with the right sign, and ranks unseen rows well
  assert.ok(m.weights[1] > 0.5 && m.weights[2] > 0.3, 'weights ' + m.weights.map((v) => v.toFixed(2)).join(' '));
  assert.ok(aucOn(m, REST) > 0.8, 'held AUC ' + aucOn(m, REST));
  assert.equal(m.score(REST[0]), [1, ...F.map((f, k) => (prep(T.cols[f][REST[0]]) - m.mean[k]) / m.sd[k])].reduce((a, v, k) => a + v * m.weights[k], 0));
  assert.equal(size(m), 5 + 4 + 4);
});

test('logistic regression: the intercept is not penalised, a stronger penalty shrinks, a constant column is safe', () => {
  const big = logistic(T, FIT, { lambda: 1e7 }), base = FIT.reduce((a, i) => a + T.y[i], 0) / FIT.length;
  assert.ok(Math.abs(big.weights[0] - Math.log(base / (1 - base))) < 1e-3, 'the intercept is the base rate’s log-odds');
  assert.ok(big.weights.slice(1).every((v) => Math.abs(v) < 1e-3), 'every penalised weight shrinks to ~0');
  const norm = (m) => Math.hypot(...m.weights.slice(1));
  assert.ok(norm(logistic(T, FIT, { lambda: 50 })) < norm(logistic(T, FIT, { lambda: 1 })));
  const flat = { ...T, cols: { ...T.cols, c: new Float64Array(600).fill(4) } }, f = logistic(flat, FIT);
  assert.equal(f.sd[2], 1, 'a constant column has no spread: divided by 1, not 0');
  const nearly = { ...T, cols: { ...T.cols, c: Float64Array.from({ length: 600 }, (_, i) => (i === FIT[3] ? 4.000001 : 4)) } };
  assert.ok(logistic(nearly, FIT).sd[2] < 1e-6, 'a column that varies at all keeps its own spread');
  assert.ok(f.weights.every(Number.isFinite));
  const one = logistic(T, FIT, { iterations: 1 });
  assert.equal(one.steps, 1, 'stops at the iteration cap');
  const loose = logistic(T, FIT, { tol: 10 });
  assert.equal(loose.steps, 1, 'stops when a step is under the tolerance, counting that step');
});

test('the baselines fit on their rows and nothing else; −1 (missing) is read as 0; the fit is deterministic', () => {
  const P = poisoned();
  assert.deepEqual(logistic(P, FIT).weights, logistic(T, FIT).weights, 'logistic: rows outside the fit change nothing');
  const bt = boosted(T, FIT, { rounds: 20 }), bp = boosted(P, FIT, { rounds: 20 });
  assert.deepEqual(bp.trees, bt.trees, 'boosted: rows outside the fit change nothing');
  assert.deepEqual(boosted(T, FIT, { rounds: 20 }).trees, bt.trees, 'the same fit twice');
  const zero = { ...T, cols: { ...T.cols, d: T.cols.d.map((v) => Math.max(0, v)) } };
  assert.deepEqual(logistic(zero, FIT).weights, logistic(T, FIT).weights, '−1 is read as 0');
});

test('cuts: the distinct values at the quantiles', () => {
  assert.deepEqual(cuts([10, 1, 9, 2, 8, 3, 7, 4, 6, 5], 4), [3, 6, 8]);
  assert.deepEqual(cuts([5, 5, 5, 5, 5, 5], 4), [5], 'repeated values give one cut');
  assert.deepEqual(cuts([1, 1, 1, 2, 2, 2, 3, 3], 4), [1, 2, 3]);
  assert.deepEqual(cuts([0, 1, 2, 3], 2), [2]);
});

test('boosted trees: a step in the data is found where it is, and each leaf is −rate·G/(H+λ)', () => {
  const n = 200, cols = { x: Float64Array.from({ length: n }, (_, i) => i % 10), z: new Float64Array(n).fill(1) }, y = Uint8Array.from({ length: n }, (_, i) => Number(i % 10 > 5));
  const ds = { features: ['z', 'x'], cols, y }, rows = Array.from({ length: n }, (_, i) => i);
  const m = boosted(ds, rows, { rounds: 1, rate: 0.5, bins: 10, lambda: 1 });
  assert.equal(m.rounds, 1);
  assert.equal(m.trees[0].f, 'x');
  assert.equal(m.trees[0].cut, 5, 'the split is x ≤ 5 against x > 5');
  // the leaves, by hand: every row starts at the base log-odds
  const pos = 80, base = Math.log((pos + 0.5) / (n - pos + 0.5)), p = sig(base);
  assert.equal(m.base, base);
  const left = rows.filter((i) => cols.x[i] <= 5), G = left.reduce((a, i) => a + (p - y[i]), 0), H = left.length * p * (1 - p);
  const k0 = m.trees[0].kids[0], lv = 'value' in k0 ? k0.value : k0.values[0];
  if ('value' in k0) assert.ok(Math.abs(lv - 0.5 * (-G / (H + 1))) < 1e-12);
  assert.ok(m.score(0) < base && m.score(9) > base, 'the step pushes each side the right way');
  assert.equal(m.score(3), base + out(m.trees[0], (f) => cols[f][3]));
});

test('boosted trees: the training loss falls round on round, minHess guards every leaf, and it ranks unseen rows', () => {
  const loss = (m) => FIT.reduce((a, i) => { const p = sig(m.score(i)); return a - (T.y[i] ? Math.log(p) : Math.log(1 - p)); }, 0);
  const l5 = loss(boosted(T, FIT, { rounds: 5 })), l20 = loss(boosted(T, FIT, { rounds: 20 })), l60 = loss(boosted(T, FIT, { rounds: 60 }));
  assert.ok(l5 > l20 && l20 > l60, [l5, l20, l60].join(' > '));
  const m = boosted(T, FIT, { rounds: 60 });
  assert.equal(m.rounds, 60);
  assert.ok(aucOn(m, REST) > 0.8, 'held AUC ' + aucOn(m, REST));
  assert.ok(Math.abs(m.trees[0].kids[0].values ? m.trees[0].kids[0].values[0] : m.trees[0].kids[0].value) > 0);
  // a leaf must hold at least minHess of hessian: with a huge minHess nothing can split
  const none = boosted(T, FIT, { rounds: 5, minHess: 1e9 });
  assert.equal(none.rounds, 0, 'no split leaves both sides heavy enough');
  assert.equal(none.score(REST[0]), none.base);
  // the guard is on BOTH sides: a minHess just under the whole fit's hessian still cannot split
  const H = FIT.length * 0.25;
  assert.equal(boosted(T, FIT, { rounds: 1, minHess: H / 2 + 1 }).rounds, 0, 'one side would be too light');
  // a table with nothing to split on stops at once
  const flat = { features: ['k'], cols: { k: new Float64Array(600).fill(2) }, y: T.y };
  assert.equal(boosted(flat, FIT, { rounds: 10 }).rounds, 0);
});

test('boosted trees: a depth-2 tree splits each side again when it pays, and size counts every number', () => {
  const m = boosted(T, FIT, { rounds: 3 });
  for (const t of m.trees) for (const k of t.kids) if (!('value' in k)) { assert.ok(T.features.includes(k.f)); assert.equal(k.values.length, 2); }
  assert.ok(m.trees.some((t) => t.kids.some((k) => !('value' in k))), 'at least one second-level split');
  const tree = { f: 'a', cut: 3, kids: [{ value: -1 }, { f: 'b', cut: 2, values: [0.5, 2] }] };
  assert.equal(out(tree, (f) => ({ a: 3, b: 9 })[f]), -1, 'x ≤ cut goes left');
  assert.equal(out(tree, (f) => ({ a: 4, b: 2 })[f]), 0.5);
  assert.equal(out(tree, (f) => ({ a: 4, b: 2.1 })[f]), 2);
  assert.equal(size({ kind: 'boosted', trees: [tree] }), 1 + 2 + 1 + 4);
  assert.equal(size(m), 1 + m.trees.reduce((a, t) => a + 2 + t.kids.reduce((b, k) => b + ('value' in k ? 1 : 4), 0), 0));
  assert.equal(m.score(REST[1]), m.trees.reduce((a, tr) => a + out(tr, (f) => T.cols[f][REST[1]]), m.base));
});

test('boosted trees: every leaf of the first tree is −rate·G/(H+λ) over exactly its own rows', () => {
  const rate = 0.3, lambda = 2, m = boosted(T, FIT, { rounds: 1, rate, lambda }), t = m.trees[0], p = sig(m.base);
  const leaf = (rows) => { const G = rows.reduce((a, i) => a + (p - T.y[i]), 0), H = rows.length * p * (1 - p); return rate * (-G / (H + lambda)); };
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-12, what + ': ' + a + ' vs ' + b);
  const sides = [FIT.filter((i) => T.cols[t.f][i] <= t.cut), FIT.filter((i) => T.cols[t.f][i] > t.cut)];
  assert.equal(sides[0].length + sides[1].length, FIT.length);
  t.kids.forEach((k, s) => {
    if ('value' in k) return near(k.value, leaf(sides[s]), 'side ' + s);
    const parts = [sides[s].filter((i) => T.cols[k.f][i] <= k.cut), sides[s].filter((i) => T.cols[k.f][i] > k.cut)];
    assert.ok(parts[0].length && parts[1].length, 'a split leaves rows on both sides');
    near(k.values[0], leaf(parts[0]), 'side ' + s + ' left'); near(k.values[1], leaf(parts[1]), 'side ' + s + ' right');
  });
});

test('boosted trees: a tie goes to the first feature; the last cut is reachable; a side exactly at minHess may split', () => {
  const n = 200, x = Float64Array.from({ length: n }, (_, i) => i % 10), rows = Array.from({ length: n }, (_, i) => i);
  const step = (k) => Uint8Array.from({ length: n }, (_, i) => Number(i % 10 > k));
  const twin = boosted({ features: ['x', 'x2'], cols: { x, x2: Float64Array.from(x) }, y: step(5) }, rows, { rounds: 1, bins: 10 });
  assert.equal(twin.trees[0].f, 'x', 'two equal features: the first one wins');
  const last = boosted({ features: ['x'], cols: { x }, y: step(8) }, rows, { rounds: 1, bins: 10 });
  assert.equal(last.trees[0].cut, 8, 'the step at the last useful cut is found');
  const top = boosted({ features: ['x'], cols: { x }, y: step(7) }, rows, { rounds: 1, bins: 4 });   // cuts 2, 5, 7 — and 8, 9 lie above the last
  assert.deepEqual(cuts(x, 4), [2, 5, 7]);
  assert.equal(top.trees[0].cut, 7, 'the last cut, with rows above it, is reachable');
  // half the rows are cases, so every row starts at p = ½ and h = ¼ exactly: each side of x ≤ 0 holds n/8 of hessian
  const half = Float64Array.from({ length: n }, (_, i) => i % 2);
  const ds = { features: ['h'], cols: { h: half }, y: Uint8Array.from(half) };
  assert.equal(boosted(ds, rows, { rounds: 1, minHess: n / 8 }).rounds, 1, 'a side holding exactly minHess is heavy enough');
  assert.equal(boosted(ds, rows, { rounds: 1, minHess: n / 8 + 1e-9 }).rounds, 0);
  // a split that lowers the loss by nothing is not taken: each side half cases, λ = 0, so every gradient sum is exactly 0
  const even = Float64Array.from({ length: n }, (_, i) => Math.floor(i / 2) % 2);
  assert.equal(boosted({ features: ['e'], cols: { e: even }, y: Uint8Array.from(half) }, rows, { rounds: 1, lambda: 0 }).rounds, 0, 'a zero gain is no gain');
});

test('the edges of the solvers: a pivot of exactly 1e-12 is used, one cut needs two bins, the tolerance is strict', () => {
  assert.deepEqual(solve([[1e-12, 0], [0, 1]], [1, 1]), [1e12, 1]);
  assert.deepEqual(cuts([1, 2, 3], 1), [], 'one bin has no cut inside it');
  const one = logistic(T, FIT, { iterations: 1 }), first = Math.max(...one.weights.map(Math.abs));   // from w = 0, the first step is −w
  assert.ok(logistic(T, FIT, { tol: first }).steps > 1, 'a step exactly at the tolerance is not under it');
});

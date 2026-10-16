// Organ 6's unit tests run on toy data made here, so nothing about the real workloads is seen before its seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/recycle.mjs';
import * as E from '../src/evolve.mjs';
import { germinate } from '../src/germinate.mjs';
import { seal } from '../src/genome.mjs';
import { stable } from '../src/germinate.mjs';
import { quantile, fit, assess, germinate as express, randomGenome, stemGenome, encodeSeed, rng, splitRows } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

function toy(seed = 3, n = 600, name = 'toy') {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0; }
  return { ok: true, name, features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(n - 420).keys()].map((i) => i + 420) };
}

test('a sorted column is sorted once per (data, rows, feature), and read from the pool after', () => {
  const p = R.pool(), ds = toy(), rows = ds.trainRows;
  const xs = p.sorted(ds, rows, 'a');
  assert.deepEqual([...xs], rows.map((i) => ds.cols.a[i]).sort((x, y) => x - y));
  assert.equal(p.sorted(ds, rows, 'a'), xs, 'the same array, not a new sort');
  assert.deepEqual(p.stats(), { sortHits: 1, sortMisses: 1, growHits: 0, growMisses: 0 });
  p.sorted(ds, rows, 'b'); p.sorted(ds, [...rows], 'a');
  assert.deepEqual([p.stats().sortHits, p.stats().sortMisses], [1, 3], 'another feature, or another rows list, is new work');
  const none = R.pool({ cap: 0 });
  none.sorted(ds, rows, 'a'); none.sorted(ds, rows, 'a');
  assert.deepEqual([none.stats().sortHits, none.stats().sortMisses], [0, 2], 'a pool that keeps nothing counts every sort');
  assert.deepEqual([...p.sorted(ds, [], 'a')], []);
});

test('recycled quantiles, fits and assessments are byte-for-byte the ribosome’s', () => {
  const p = R.pool(), ds = toy(), rows = ds.trainRows, r = rng(11);
  for (let k = 0; k < 200; k++) { const f = ds.features[k % 4], q = r(); assert.equal(R.quantile(p, ds, f, rows, q), quantile(ds, f, rows, q)); }
  for (const q of [0, 1, 0.5, 1 / 16, 15 / 16, 1.5, -0.5, 3]) assert.equal(R.quantile(p, ds, 'c', rows, q), quantile(ds, 'c', rows, q), 'q = ' + q + ' (outside 0…1 the ribosome clamps)');
  assert.equal(R.quantile(p, ds, 'c', [], 0.5), 0);
  const inner = splitRows(ds, rows, 1 / 3, 1), score = R.assessWith(p);
  for (let k = 0; k < 150; k++) {
    const g = k ? randomGenome(r) : stemGenome();
    assert.equal(stable(R.fit(p, ds, rows, g)), stable(fit(ds, rows, g)), 'genome ' + k);
    assert.equal(score(ds, inner, g), assess(ds, inner, g));
  }
  assert.ok(p.stats().sortHits > 10 * p.stats().sortMisses, 'the same few columns, sorted once each');
  // a genome with every rule off but one, and rules pointing past the feature count (the ribosome wraps them)
  const g = { ...stemGenome(), on: 1, f0: 13 };
  assert.equal(stable(R.fit(p, ds, rows, g)), stable(fit(ds, rows, g)));
  assert.equal(stable(R.fit(p, ds, [], g)), stable(fit(ds, [], g)), 'no rows');
});

test('evolution on the pool takes the same steps, with far fewer sorts', () => {
  const ds = toy(), rec = encodeSeed({ domain: 'toy', seed: 1, genome: stemGenome() }), opts = { generations: 20, children: 6, seed: 4, folds: 3 };
  const plain = E.evolve(rec, E.blind(ds), opts);
  const counted = R.pool({ cap: 0 }), kept = R.pool();
  assert.deepEqual(E.evolve(rec, E.blind(ds), { ...opts, assess: R.assessWith(counted) }), plain);
  assert.deepEqual(E.evolve(rec, E.blind(ds), { ...opts, assess: R.assessWith(kept) }), plain);
  assert.equal(counted.stats().sortHits, 0);
  assert.equal(kept.stats().sortHits + kept.stats().sortMisses, counted.stats().sortMisses, 'the same quantiles asked for');
  assert.ok(kept.stats().sortMisses <= 3 * 4, 'at most one sort per fold and feature: ' + kept.stats().sortMisses);
});

test('germinations are recycled by content: the same recipe on equal data is the finished result', () => {
  const p = R.pool(), ds = toy(), rec = encodeSeed({ domain: 'toy', seed: 1, genome: stemGenome() });
  const a = p.germinate(ds, rec);
  assert.equal(stable(a), stable(express(ds, rec)));
  assert.equal(p.germinate(ds, rec), a, 'a hit');
  assert.equal(p.germinate({ ...ds }, rec), a, 'an equal copy of the data is a hit');
  assert.equal(p.germinate(toy(), rec).heldAuc, a.heldAuc);
  assert.equal(p.stats().growHits, 3, 'even a dataset rebuilt from the same values');
  p.germinate({ ...ds, trainRows: ds.trainRows.slice(1) }, rec);
  p.germinate({ ...ds, y: Uint8Array.from(ds.y, (v, i) => (i === 0 ? 1 - v : v)) }, rec);
  p.germinate(ds, encodeSeed({ domain: 'toy', seed: 1, genome: randomGenome(rng(5)) }));
  assert.equal(p.stats().growMisses, 4, 'other rows, other labels, another recipe: new work');
  assert.deepEqual(p.germinate(null, rec), express(null, rec), 'not a dataset: the ribosome’s own refusal, not kept');
  assert.equal(p.germinate({ ...ds, ok: false }, rec).ok, false);
  const one = R.pool({ cap: 1 }), r2 = encodeSeed({ domain: 'toy', seed: 2, genome: randomGenome(rng(6)) });
  one.germinate(ds, rec); one.germinate(ds, r2); one.germinate(ds, rec);
  assert.deepEqual([one.stats().growHits, one.stats().growMisses], [0, 3], 'a full pool lets the oldest go');
  const none = R.pool({ cap: 0 });
  none.germinate(ds, rec); none.germinate(ds, rec);
  assert.deepEqual([none.stats().growHits, none.stats().growMisses], [0, 2]);
});

test('an organism grown with a pool is the organism grown without one', async () => {
  const maker = await fromSeed(sha256Bytes(utf8('living-seed/maker/toy')));
  const recs = [encodeSeed({ domain: 'alpha', seed: 1, genome: stemGenome() }), encodeSeed({ domain: 'beta', seed: 2, genome: randomGenome(rng(8)) })];
  const g = await seal({ name: 'toy', gate: { auc: 0.5 }, organs: recs }, maker);
  const sub = { name: 'here', data: { alpha: toy(1, 600, 'alpha'), beta: toy(2, 600, 'beta') } }, p = R.pool();
  const plain = (await germinate(g.text, sub)).organism;
  assert.deepEqual((await germinate(g.text, sub, { pool: p })).organism, plain);
  assert.deepEqual((await germinate(g.text, { ...sub }, { pool: p })).organism, plain);
  assert.deepEqual(p.stats().growHits, 2, 'the second organism grew from the pool');
});

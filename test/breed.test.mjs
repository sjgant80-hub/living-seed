// Breeding is unit-tested on a toy domain made here, so no child of the real genomes is grown before organ 5's seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Br from '../src/breed.mjs';
import { seal, open } from '../src/genome.mjs';
import { germinate } from '../src/germinate.mjs';
import { encodeSeed, decodeSeed, stemGenome, randomGenome, rng, crossGenome } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const A_KEY = await key('a'), B_KEY = await key('b'), BREEDER = await key('breeder');
function toy(name, seed, signal = true, n = 600) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = signal ? (cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0) : (r() < 0.3 ? 1 : 0); }
  return { ok: true, name, features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(n - 420).keys()].map((i) => i + 420) };
}
const recipe = (domain, g, s = 1) => encodeSeed({ domain, seed: s, genome: g });
const GA = stemGenome(), GB = randomGenome(rng(42));
const A = await seal({ name: 'a', gate: { auc: 0.55 }, organs: [recipe('alpha', GA), recipe('beta', GA)] }, A_KEY);
const B = await seal({ name: 'b', gate: { auc: 0.6 }, organs: [recipe('beta', GB, 2), recipe('gamma', GB, 3)] }, B_KEY);
const SUB = { name: 'breeder', data: { alpha: toy('alpha', 1), beta: toy('beta', 2), gamma: toy('gamma', 3) } };

test('recombine: crossed where both parents carry a domain, inherited where one does', async () => {
  const fa = (await open(A.text)).fields, fb = (await open(B.text)).fields;
  const plan = Br.recombine(fa, fb, 1);
  assert.deepEqual(plan.map((p) => [p.domain, p.from]), [['alpha', 'a'], ['beta', 'both'], ['gamma', 'b']]);
  assert.equal(plan[0].recipe, fa.organs[0]);
  assert.equal(plan[2].recipe, fb.organs[1]);
  const crossed = decodeSeed(plan[1].recipe).seed;
  assert.deepEqual(crossed.genome, crossGenome(GA, GB, rng(1 * 1009 + 1)), 'the ribosome’s crossover, seeded by the domain’s place');
  assert.equal(crossed.seed, 1, 'the first parent’s seed number');
  assert.equal(encodeSeed(crossed), plan[1].recipe);
  assert.notDeepEqual(Br.recombine(fa, fb, 2)[1].recipe, plan[1].recipe, 'another seed, another child');
  assert.deepEqual(Br.recombine(fa, fb, 1), plan, 'deterministic');
  // a grow-seed cannot be crossed: the first parent's recipe passes
  const grow = encodeSeed({ domain: 'beta', seed: 5, grow: { population: 4, elites: 1, generations: 2 } });
  assert.equal(Br.recombine({ organs: [grow] }, fb, 1)[0].recipe, grow);
});

test('breed: a child naming both parents, at the higher bar, carrying only organs proven on the breeder’s device', async () => {
  const c = await Br.breed(A.text, B.text, SUB, BREEDER, { name: 'kid', seed: 1 });
  assert.equal(c.ok, true, c.why);
  const o = await open(c.text);
  assert.deepEqual([o.fields.name, o.fields.parents, o.fields.gate.auc, o.fields.by], ['kid', [A.id, B.id], 0.6, BREEDER.pub]);
  assert.equal(c.id, o.id);
  assert.ok(c.organism.organs.every((x) => x.state === 'live'), 'every organ the child carries is live where it was bred');
  assert.equal(c.organism.genome, c.id);
  assert.deepEqual(c.organism, (await germinate(c.text, SUB)).organism, 'the organism handed back is the one the child grows');
  for (const dropped of c.dropped) assert.ok(!o.fields.organs.some((r) => decodeSeed(r).seed.domain === dropped.domain));
  assert.equal(o.fields.organs.length + c.dropped.length, 3);
  assert.ok(c.crossed.every((d) => d === 'beta'));
});

test('an organ that does not prove itself on the breeder’s device is dropped, with its reason', async () => {
  const sub = { name: 'noisy', data: { ...SUB.data, gamma: toy('gamma', 3, false) } };
  const c = await Br.breed(A.text, B.text, sub, BREEDER);
  assert.equal(c.ok, true, c.why);
  assert.deepEqual(c.dropped.map((d) => d.domain), ['gamma']);
  assert.match(c.dropped[0].why, /^cut: AUC 0\.\d+ on cases it never grew on is under the gate \(0\.6\)$/);
  const o = await open(c.text);
  assert.deepEqual(o.fields.organs.map((r) => decodeSeed(r).seed.domain), c.organism.organs.map((x) => x.domain));
  assert.ok(!o.fields.organs.some((r) => decodeSeed(r).seed.domain === 'gamma'));
  const { gamma, ...rest } = SUB.data;
  const d = await Br.breed(A.text, B.text, { name: 'dry', data: rest }, BREEDER);
  assert.deepEqual(d.dropped, [{ domain: 'gamma', why: 'dormant: this device holds no gamma data' }]);
  const none = await Br.breed(A.text, B.text, { name: 'nothing', data: {} }, BREEDER);
  assert.deepEqual(none, { ok: false, why: 'no organ of the child is proven on this device' });
});

test('breeding refuses what it must', async () => {
  const why = async (...a) => (await Br.breed(...a)).why;
  assert.equal(await why(A.text, A.text, SUB, BREEDER), 'a genome cannot breed with itself');
  assert.equal(await why('x', B.text, SUB, BREEDER), 'the first parent was refused: not a genome');
  assert.equal(await why(A.text, B.text.replace('gate auc=0.6', 'gate auc=0.7'), SUB, BREEDER), 'the second parent was refused: signature');
  assert.equal(await why(A.text, B.text, SUB, BREEDER, { trust: [A_KEY.pub] }), 'the second parent was refused: untrusted maker');
  assert.equal((await Br.breed(A.text, B.text, SUB, BREEDER, { trust: [A_KEY.pub, B_KEY.pub] })).ok, true);
  assert.equal(await why(A.text, B.text, SUB, BREEDER, { name: 'Bad Name' }), 'the child could not be sealed: the name is lower-case letters, digits and hyphens, at most 32');
  assert.equal(await why(A.text, B.text, null, BREEDER), 'the child could not grow here: no substrate to grow on');
  assert.equal(await why(A.text, B.text, SUB, null), 'the child could not be sealed: no maker keys');
  assert.equal(await why(A.text, B.text, SUB, BREEDER, null), undefined, 'no options: defaults');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBSTRATES, prepare, verdictOf, WASM } from '../src/substrate.mjs';
import { answer } from '../src/germinate.mjs';

const BODY = { rules: [{ feat: 'a', op: '>', v: 1, w: 0.7 }, { feat: 'b', op: '<=', v: 5, w: 0.2 }, { feat: 'c', op: '>', v: -3.5, w: -0.15 }], threshold: 0.5 };
const CASES = [{ a: 2, b: 3, c: 0 }, { a: 0, b: 9, c: -9 }, { a: 1, b: 5, c: -3.5 }, { a: 1.0000001, b: 5.0000001, c: -3.4999 }, { a: -1e9, b: -1e9, c: 1e9 }, { a: 3, b: 6, c: -4 }];
const all = async () => Object.fromEntries(await Promise.all(SUBSTRATES.map(async (n) => [n, await prepare(n)])));

test('the four substrates, by name; anything else is none', async () => {
  assert.deepEqual(SUBSTRATES, ['f64', 'int', 'wasm', 'f32']);
  const s = await all();
  for (const n of SUBSTRATES) assert.equal(s[n].name, n);
  for (const n of ['', 'gpu', null, undefined, 5]) assert.equal(await prepare(n), null);
  assert.equal(WebAssembly.validate(WASM), true, 'the hand-assembled module is valid WebAssembly');
});

test('f64 is exactly the organism’s own answer: the same score and label as germinate.mjs', async () => {
  const s = await all();
  const organism = { id: 't', organs: [{ domain: 'd', state: 'live', body: BODY }] };
  for (const x of CASES) {
    const a = answer(organism, 'd', x);
    assert.deepEqual(s.f64.score(BODY, x), { score: a.score, label: a.label }, JSON.stringify(x));
  }
});

test('int and wasm give the reference’s score and label on every case', async () => {
  const s = await all();
  for (const x of CASES) for (const n of ['int', 'wasm']) assert.deepEqual(s[n].score(BODY, x), s.f64.score(BODY, x), n + ' ' + JSON.stringify(x));
  assert.deepEqual(s.wasm.score(BODY, CASES[0]), { score: 0.75, label: 1 });        // 0.7 + 0.2 − 0.15: all three fire
  assert.deepEqual(s.wasm.score(BODY, CASES[1]), { score: 0, label: 0 });           // none fires
  assert.deepEqual(s.int.score(BODY, CASES[5]), { score: 0.7, label: 1 });          // only the first fires
});

test('the line is strict: a score equal to it is a no on every substrate', async () => {
  const s = await all(), body = { rules: [{ feat: 'a', op: '>', v: 0, w: 0.5 }], threshold: 0.5 };
  for (const n of SUBSTRATES) { assert.deepEqual(s[n].score(body, { a: 1 }), { score: 0.5, label: 0 }, n); assert.deepEqual(s[n].score(body, { a: 0 }), { score: 0, label: 0 }, n); }
  const below = { rules: [{ feat: 'a', op: '>', v: 0, w: 0.5 }], threshold: 0.499999 };
  for (const n of SUBSTRATES) assert.equal(s[n].score(below, { a: 1 }).label, 1, n);
});

test('f32 can differ where single precision cannot tell two numbers apart — and only there', async () => {
  const s = await all(), body = { rules: [{ feat: 'a', op: '>', v: 0.1, w: 1 }], threshold: 0.5 };
  const x = { a: 0.10000000000000002 };                                     // > 0.1 in doubles; the same float in single
  assert.equal(s.f64.score(body, x).label, 1);
  assert.equal(s.f32.score(body, x).label, 0);
  assert.deepEqual(s.f32.score(body, { a: 0.2 }), s.f64.score(body, { a: 0.2 }));
  const le = { rules: [{ feat: 'a', op: '<=', v: 0.1, w: 1 }], threshold: 0.5 };   // equality fires a <= rule, in single as in double
  for (const n of SUBSTRATES) assert.equal(s[n].score(le, { a: 0.1 }).label, 1, n);
});

test('a case the rules cannot read, or a body that is not one, scores nothing on every substrate', async () => {
  const s = await all();
  for (const n of SUBSTRATES) {
    for (const [b, x] of [[BODY, { a: 2, b: 3 }], [BODY, { a: 2, b: 3, c: NaN }], [BODY, { a: 2, b: 3, c: Infinity }], [BODY, { a: '2', b: 3, c: 0 }], [BODY, null], [null, CASES[0]], [{ rules: 'x' }, CASES[0]], [{}, CASES[0]]]) assert.equal(s[n].score(b, x), null, n);
    assert.deepEqual(s[n].score({ rules: [], threshold: 0 }, {}), { score: 0, label: 0 }, n + ': no rules, no score');
  }
  assert.equal(s.wasm.score({ rules: Array.from({ length: 2049 }, () => ({ feat: 'a', op: '>', v: 0, w: 1 })), threshold: 0 }, { a: 1 }), null, 'more rules than the page holds');
  assert.equal(s.wasm.score({ rules: Array.from({ length: 2048 }, () => ({ feat: 'a', op: '>', v: 0, w: 0.001 })), threshold: 0 }, { a: 1 }).score, 2.048);
});

test('verdictOf: a substrate scores; anything else gives nothing', async () => {
  const s = await all();
  assert.deepEqual(verdictOf(s.int, BODY, CASES[0]), s.int.score(BODY, CASES[0]));
  for (const z of [null, undefined, {}, { score: 5 }]) assert.equal(verdictOf(z, BODY, CASES[0]), null);
});

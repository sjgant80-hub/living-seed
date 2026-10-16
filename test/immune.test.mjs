// immune.test.mjs — organ 9, unit-tested on toy data and a three-node toy mesh made here, so no real organ-9 result is
// seen before its seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../src/immune.mjs';
import * as M from '../src/mesh.mjs';
import { envelope, fingerprintOf, MAX_MSG } from '../src/gate.mjs';
import { seal } from '../src/genome.mjs';
import { encodeSeed, stemGenome, rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/immune-' + s)));
function toy(name, seed, n = 600) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0; }
  return { ok: true, name, features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(n - 420).keys()].map((i) => i + 420) };
}
const ALPHA = toy('alpha', 1), BETA = toy('beta', 2);
const rec = (d) => encodeSeed({ domain: d, seed: 1, genome: stemGenome() });
async function three({ bNoBeta = false } = {}) {
  const ks = await Promise.all(['a', 'b', 'c'].map(key));
  const g = await seal({ name: 'both', gate: { auc: 0.6 }, organs: [rec('alpha'), rec('beta')] }, ks[0]);
  return Promise.all(['a', 'b', 'c'].map(async (name, i) => (await M.node(name, g.text, { name, data: name === 'b' && bNoBeta ? { alpha: ALPHA } : { alpha: ALPHA, beta: BETA } }, ks[i])).node));
}
const OPEN = { cap: 64, law: I.LAW, limits: { drift: 1, volume: 1e9 } };   // a watch that cuts nobody

/* ─── memory ─── */

test('memory: refused bytes by fingerprint, never more than cap — the oldest goes first, a repeat is young again', () => {
  const m = I.memory(3);
  assert.equal(m.cap, 3);
  assert.equal(m.add('one', 'shape'), fingerprintOf('one'));
  m.add('two', 'sender'); m.add('three', 'signature');
  assert.equal(m.seen('one'), 'shape');
  m.add('one', 'magic');   // seen again: now the youngest, with its new family
  m.add('four', 'shape');
  assert.equal(m.size(), 3);
  assert.equal(m.seen('two'), null, 'the oldest was forgotten');
  assert.equal(m.seen('one'), 'magic');
  assert.equal(m.seen('four'), 'shape');
  assert.equal(m.seen('nothing'), null);
  const n = I.memory(3); n.add('four', 'shape'); n.add('three', 'signature'); n.add('one', 'magic');
  assert.equal(n.digest(), m.digest(), 'the digest is of what is known, not the order it came in');
  assert.match(m.digest(), /^[0-9a-f]{16}$/);
  assert.equal(I.memory().cap, 256);
  const big = I.memory(2); for (let i = 0; i < 50; i++) big.add('x' + i, 'shape');
  assert.equal(big.size(), 2);
  assert.ok(big.seen('x49') && big.seen('x48') && !big.seen('x47'));
});

/* ─── the rebound ─── */

test('the rebound law: free under the limit, then base bits, one more every step, never more than max', () => {
  assert.deepEqual(I.LAW, { limit: 16, base: 8, step: 16, max: 24 });
  assert.equal(I.owed(0), 0);
  assert.equal(I.owed(15), 0);
  assert.equal(I.owed(16), 8);
  assert.equal(I.owed(31), 8);
  assert.equal(I.owed(32), 9);
  assert.equal(I.owed(47), 9);
  assert.equal(I.owed(48), 10);
  assert.equal(I.owed(16 + 16 * 16), 24);
  assert.equal(I.owed(1e6), 24, 'capped');
  for (const bad of [-5, 1.5, NaN, '20', null]) assert.equal(I.owed(bad), 0);
  let last = 0;
  for (let r = 0; r < 400; r++) { const b = I.owed(r); assert.ok(b >= last); last = b; }
  const law = { limit: 2, base: 1, step: 1, max: 3 };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((r) => I.owed(r, law)), [0, 0, 1, 2, 3, 3, 3]);
});

test('zero bits: the leading zero bits of a hex digest', () => {
  assert.equal(I.zeroBits('ffff'), 0);
  assert.equal(I.zeroBits('8fff'), 0);
  assert.equal(I.zeroBits('7fff'), 1);
  assert.equal(I.zeroBits('4fff'), 1);
  assert.equal(I.zeroBits('3fff'), 2);
  assert.equal(I.zeroBits('2'), 2);
  assert.equal(I.zeroBits('1fff'), 3);
  assert.equal(I.zeroBits('0fff'), 4);
  assert.equal(I.zeroBits('00f'), 8);
  assert.equal(I.zeroBits('001'), 11);
  assert.equal(I.zeroBits('0000'), 16);
  assert.equal(I.zeroBits(''), 0);
  assert.equal(I.zeroBits('0z00'), 4, 'stops at the first character that is not hex');
});

test('a stamp: one hash, bound to the source and the exact bytes; solve finds one, within its budget or not at all', () => {
  assert.equal(I.paid('x', 'bytes', undefined, 0), true, 'nothing owed, nothing to check');
  const s = I.solve('x', 'bytes', 8, 1 << 16);
  assert.ok(s.nonce !== null && s.spent === parseInt(s.nonce, 16) + 1);
  assert.equal(I.paid('x', 'bytes', s.nonce, 8), true);
  assert.ok(I.zeroBits(I.stampHash('x', 'bytes', s.nonce)) >= 8);
  for (let i = 0; i < s.spent - 1; i++) assert.ok(I.zeroBits(I.stampHash('x', 'bytes', i.toString(16))) < 8, 'the first that pays');
  assert.equal(I.paid('x', 'bytes', s.nonce, 30), I.zeroBits(I.stampHash('x', 'bytes', s.nonce)) >= 30);
  // the same nonce for other bytes or another source almost never pays (here, exactly not)
  const other = ['y', 'bytes'], moved = ['x', 'bytez'];
  for (const [src, txt] of [other, moved]) assert.equal(I.paid(src, txt, s.nonce, 8), I.zeroBits(I.stampHash(src, txt, s.nonce)) >= 8);
  for (const bad of [undefined, null, '', 'g', 'abcdefabcdefabcde', {}]) assert.equal(I.paid('x', 'bytes', bad, 8), false);
  assert.equal(I.paid('x', 'bytes', 0x1ff, 8), I.paid('x', 'bytes', '1ff', 8), 'a number is read as its text');
  // the first nonce that pays exactly the bits owed is the one found (text-0 needs 512 tries for 8 bits, and gets exactly 8)
  assert.deepEqual(I.solve('x', 'text-0', 8, 1 << 16), { nonce: '1ff', spent: 512 });
  assert.equal(I.zeroBits(I.stampHash('x', 'text-0', '1ff')), 8);
  assert.equal(I.paid('x', 'text-0', '1ff', 8), true);
  assert.equal(I.paid('x', 'text-0', '1ff', 9), false, 'exactly 8 bits does not pay 9');
  assert.deepEqual(I.solve('x', 'bytes', 0, 10), { nonce: '0', spent: 0 });
  assert.deepEqual(I.solve('x', 'bytes', 24, 5), { nonce: null, spent: 5 });
  assert.deepEqual(I.solve('x', 'bytes', 8, s.spent - 1), { nonce: null, spent: s.spent - 1 }, 'one hash short of the budget it needs');
  assert.deepEqual(I.solve('x', 'bytes', 8, s.spent), s);
  assert.equal(I.stampHash('a', 'b', 'c'), I.stampHash('a', 'b', 'c'));
  assert.notEqual(I.stampHash('a|b', 'c', 'd'), I.stampHash('a', 'b|c', 'd').replace(/./, (c) => c));
});

test('rebound: each source’s refusals, and what it owes', () => {
  const r = I.rebound({ limit: 2, base: 4, step: 1, max: 6 });
  assert.equal(r.owes('x'), 0);
  assert.equal(r.refused('x'), 0);
  assert.equal(r.refused('x'), 4);
  assert.equal(r.refused('x'), 5);
  assert.equal(r.count('x'), 3);
  assert.equal(r.owes('x'), 5);
  assert.equal(r.owes('y'), 0, 'per source');
  assert.equal(r.count('y'), 0);
  const d = I.rebound();
  for (let i = 0; i < 16; i++) d.refused('z');
  assert.equal(d.owes('z'), 8, 'the default law');
});

/* ─── proofs ─── */

async function pair() {
  const k = await key('p'), to = 'a1b2c3d4e5f60718', G = { kinds: ['advert', 'task'], body: { advert: /^[a-z]+ [0-9.]+ [0-9]+$/, task: /^t [a-z]+$/ } };
  const a = await envelope({ kind: 'advert', to, n: 3, body: 'alpha 0.8 180' }, k, G), b = await envelope({ kind: 'advert', to, n: 3, body: 'alpha 0.99 180' }, k, G);
  return { k, to, G, a: a.text, b: b.text };
}

test('fieldsOf: an envelope’s fields, or null', async () => {
  const { k, to, a } = await pair();
  assert.deepEqual(I.fieldsOf(a), { kind: 'advert', from: k.pub, to, n: 3, body: 'alpha 0.8 180', sig: a.split('\nsig ')[1] });
  assert.equal(I.fieldsOf('◊ msg.v2 advert\nfrom x\nto y\nn 1\nbody b\nsig s'), null, 'not the magic');
  assert.equal(I.fieldsOf(a.split('\n').slice(0, 5).join('\n')), null, 'five lines');
  assert.equal(I.fieldsOf(a + '\nmore'), null, 'seven lines');
  assert.equal(I.fieldsOf(a.replace('\nto ', '\nTO ')), null, 'a line out of form');
  assert.equal(I.fieldsOf(a.replace('\nsig ', '\nsg ')), null);
  assert.equal(I.fieldsOf(null), null);
});

test('the ledger: what was admitted, by sender and counter, the last window of them', () => {
  const l = I.ledger(3);
  l.keep('p', 1, 'one'); l.keep('p', 2, 'two'); l.keep('q', 1, 'q-one');
  assert.equal(l.at('p', 1), 'one');
  assert.equal(l.at('q', 1), 'q-one');
  l.keep('p', 3, 'three');
  assert.equal(l.at('p', 1), 'one', 'still inside the window (3 − 3 < 1)');
  l.keep('p', 4, 'four');
  assert.equal(l.at('p', 1), null, 'out of the window');
  assert.equal(l.at('p', 2), 'two');
  assert.equal(l.at('p', 4), 'four');
  assert.equal(l.at('r', 1), null);
  assert.equal(l.at('p', 9), null);
  const d = I.ledger();
  for (let n = 1; n <= 9; n++) d.keep('p', n, 'm' + n);
  assert.equal(d.at('p', 1), null);
  assert.equal(d.at('p', 2), 'm2', 'the default window is 8');
});

test('caught: a replay that differs from what was admitted on its counter is the key signing twice', async () => {
  const { k, a, b } = await pair(), l = I.ledger();
  assert.equal(I.caught(b, l), null, 'nothing admitted on that counter');
  l.keep(k.pub, 3, a);
  assert.deepEqual(I.caught(b, l), { a, b });
  assert.equal(I.caught(a, l), null, 'the same message again is a replay, not a second message');
  assert.equal(I.caught('junk', l), null);
});

test('a proof: written from two messages one key signed on one counter, and checked by re-building and verifying both', async () => {
  const { k, to, G, a, b } = await pair(), body = I.proofOf(a, b);
  assert.match(body, I.PROOF);
  assert.ok(body.startsWith(k.pub + ' ' + to + ' 3 advert '));
  assert.deepEqual(await I.checkProof(body, G), { ok: true, from: k.pub });
  assert.deepEqual(await I.checkProof(I.proofOf(b, a), G), { ok: true, from: k.pub });
  assert.equal(I.proofOf(a, a), null, 'one message is not two');
  const other = await envelope({ kind: 'advert', to, n: 4, body: 'alpha 0.99 180' }, k, G);
  assert.equal(I.proofOf(a, other.text), null, 'different counters are not a proof');
  const elsewhere = await envelope({ kind: 'advert', to: 'ffffffffffffffff', n: 3, body: 'alpha 0.99 180' }, k, G);
  assert.equal(I.proofOf(a, elsewhere.text), null, 'different organisms are not a proof');
  const k2 = await key('q'), someone = await envelope({ kind: 'advert', to, n: 3, body: 'alpha 0.99 180' }, k2, G);
  assert.equal(I.proofOf(a, someone.text), null, 'different keys are not a proof');
  assert.equal(I.proofOf('junk', b), null);
  assert.equal(I.proofOf(a, 'junk'), null);
  const kinds = await envelope({ kind: 'task', to, n: 3, body: 't alpha' }, k, G);
  assert.deepEqual(await I.checkProof(I.proofOf(a, kinds.text), G), { ok: true, from: k.pub }, 'two kinds on one counter is two messages');
  // the proof is refused when it does not hold up
  const parts = body.split(' ');
  const bent = (i, v) => { const p = [...parts]; p[i] = v; return p.join(' '); };
  assert.deepEqual(await I.checkProof(bent(4, parts[6]), G), { ok: false, why: 'a signature in it does not verify' }, 'a swapped signature');
  assert.deepEqual(await I.checkProof(bent(7, parts[8]), G), { ok: false, why: 'the two messages are the same message' });
  assert.deepEqual(await I.checkProof(bent(3, 'reply'), G), { ok: false, why: 'a message in it is not one the gate would read' }, 'a kind the grammar lacks');
  assert.deepEqual(await I.checkProof(bent(5, 'task'), G), { ok: false, why: 'a message in it is not one the gate would read' }, 'a body not in its kind’s form');
  assert.deepEqual(await I.checkProof(bent(8, parts[8] + 'a'), G), { ok: false, why: 'not a proof' }, 'odd hex');
  assert.deepEqual(await I.checkProof(bent(8, parts[8].slice(0, -1)), G), { ok: false, why: 'not a proof' }, 'odd hex, shorter');
  assert.deepEqual(await I.checkProof(bent(7, 'ff'), G), { ok: false, why: 'not a proof' }, 'not text');
  assert.deepEqual(await I.checkProof(bent(2, '4'), G), { ok: false, why: 'a signature in it does not verify' }, 'another counter');
  assert.deepEqual(await I.checkProof('junk', G), { ok: false, why: 'not a proof' });
  assert.deepEqual(await I.checkProof(7, G), { ok: false, why: 'not a proof' });
  assert.deepEqual(await I.checkProof(body, null), { ok: false, why: 'not a proof' }, 'fails closed');
  // and a proof too large to send is not written
  const long = 'x'.repeat(190), H = { kinds: ['advert'], body: { advert: /^[a-z]+$/ } };
  const la = await envelope({ kind: 'advert', to, n: 3, body: long }, k, H), lb = await envelope({ kind: 'advert', to, n: 3, body: long.slice(1) + 'y' }, k, H);
  assert.equal(I.proofOf(la.text, lb.text), null, 'over the room a message has');
  assert.equal(I.PROOF_ROOM, MAX_MSG - 260);
  const fits = await envelope({ kind: 'advert', to, n: 3, body: 'x'.repeat(100) }, k, H), fits2 = await envelope({ kind: 'advert', to, n: 3, body: 'y'.repeat(100) }, k, H);
  assert.ok(I.proofOf(fits.text, fits2.text).length <= I.PROOF_ROOM);
  // exactly the room: written; one byte over: not
  const at = async (lenA, lenB) => I.proofOf((await envelope({ kind: 'advert', to, n: 10, body: 'x'.repeat(lenA) }, k, H)).text, (await envelope({ kind: 'advert', to, n: 10, body: 'y'.repeat(lenB) }, k, H)).text);
  assert.equal((await at(101, 102)).length, I.PROOF_ROOM);
  assert.equal(await at(102, 102), null);
});

/* ─── behaviour ─── */

test('a token: what one message says — kind, domain, an advert’s score to 0.05', () => {
  assert.equal(I.tokenOf({ kind: 'advert', body: 'crop 0.815 1575' }), 'advert crop 0.80');
  assert.equal(I.tokenOf({ kind: 'advert', body: 'crop 0.97 1575' }), 'advert crop 0.95');
  assert.equal(I.tokenOf({ kind: 'advert', body: 'crop 1 1575' }), 'advert crop 1.00');
  assert.equal(I.tokenOf({ kind: 'advert', body: 'crop 0.6 10' }), 'advert crop 0.60');
  assert.equal(I.tokenOf({ kind: 'task', body: '00000000000000a1 water 1,2,3' }), 'task water');
  assert.equal(I.tokenOf({ kind: 'lesson', body: '◊ seed.v1 triage 1 f:00000000000000000000 000000000000' }), 'lesson triage');
  assert.equal(I.tokenOf({ kind: 'reply', body: '00000000000000a1 VERIFIED 1 0.8' }), 'reply VERIFIED');
  assert.equal(I.tokenOf({ kind: 'reply', body: '00000000000000a1 ABSTAIN' }), 'reply ABSTAIN');
  assert.equal(I.tokenOf({ kind: 'proof', body: 'x' }), 'proof');
  assert.equal(I.tokenOf({ kind: 'antibody', body: 'x' }), 'antibody');
});

test('drift: half the L1 distance between two mixes, 0 for the same mix, 1 for nothing in common', () => {
  const m = (o) => new Map(Object.entries(o));
  assert.equal(I.drift(m({ a: 2, b: 2 }), m({ a: 0.5, b: 0.5 })), 0);
  assert.equal(I.drift(m({ a: 1 }), m({ b: 1 })), 1);
  assert.equal(I.drift(m({ a: 1, b: 1 }), m({ a: 1 })), 0.5);
  assert.equal(I.drift(m({ a: 3, b: 1 }), m({ a: 1, b: 1 })), 0.25);
  assert.equal(I.drift(m({ a: 1 }), m({ a: 1, b: 3 })), 0.75);
  assert.equal(I.drift(new Map(), m({ a: 1 })), 0, 'no window, no drift');
  assert.equal(I.drift(m({ a: 1 }), new Map()), 0, 'no baseline, no drift');
});

test('the watch: a baseline from the peer’s own rounds; a round that departs from it too far cuts the peer, and never teaches it', () => {
  const w = I.behaviour({ drift: 0.4, volume: 2 }), ad = (d, s) => ({ kind: 'advert', body: d + ' ' + s + ' 10' });
  const roundOf = (msgs, r) => { for (const [p, m] of msgs) w.observe(p, m); return w.close(r); };
  assert.equal(I.CALIBRATE, 3);
  assert.equal(I.RATE, 0.25);
  for (let r = 1; r <= 3; r++) assert.deepEqual(roundOf([['p', ad('crop', 0.8)], ['p', ad('water', 0.7)]], r), [{ round: r, peer: 'p', verdict: 'CALIBRATING', drift: 0, volume: 1 }]);
  assert.deepEqual(w.state('p'), { rounds: 3, volume: 2, cut: false, base: { 'advert crop 0.80': 0.5, 'advert water 0.70': 0.5 } });
  // one task more is within bounds; it folds in a quarter of the way
  const r4 = roundOf([['p', ad('crop', 0.8)], ['p', ad('water', 0.7)], ['p', { kind: 'task', body: 'i crop 1' }]], 4);
  assert.deepEqual(r4, [{ round: 4, peer: 'p', verdict: 'ALLOW', drift: 0.333333, volume: 1.333333 }]);
  assert.deepEqual(w.state('p'), { rounds: 4, volume: 2.25, cut: false, base: { 'advert crop 0.80': 0.458333, 'advert water 0.70': 0.458333, 'task crop': 0.083333 } });
  // a round missing a token the baseline holds: that token's share fades, it is not dropped
  assert.deepEqual(roundOf([['p', ad('crop', 0.8)], ['p', ad('water', 0.7)], ['p', ad('crop', 0.8)], ['p', ad('water', 0.7)], ['p', { kind: 'task', body: 'i crop 1' }]], 41).map((c) => c.verdict), ['ALLOW']);
  assert.deepEqual(roundOf([['p', ad('crop', 0.8)], ['p', ad('water', 0.7)]], 42).map((c) => c.verdict), ['ALLOW']);
  assert.equal(w.state('p').base['task crop'], 0.084375);   // 0.75 × (0.75 × 0.083333 + 0.25 × 0.2)
  // a silent round judges nothing
  assert.deepEqual(w.close(5), []);
  // claims that jump: cut, and the baseline is not moved by it
  const before = w.state('p');
  assert.deepEqual(roundOf([['p', ad('crop', 0.99)], ['p', ad('water', 0.99)]], 6), [{ round: 6, peer: 'p', verdict: 'CUT', drift: 1, volume: 0.810127 }]);
  assert.equal(w.cut('p'), true);
  assert.deepEqual(w.state('p'), { ...before, cut: true });
  assert.deepEqual(roundOf([['p', ad('crop', 0.8)]], 7), [], 'a cut peer is not judged again');
  assert.equal(w.cut('q'), false);
  assert.equal(w.state('q'), null);
  // volume: the same mix, many more messages
  const v = I.behaviour({ drift: 1, volume: 2 });
  for (let r = 1; r <= 3; r++) { v.observe('q', ad('crop', 0.8)); v.close(r); }
  for (let i = 0; i < 3; i++) v.observe('q', ad('crop', 0.8));
  assert.deepEqual(v.close(4), [{ round: 4, peer: 'q', verdict: 'ALLOW', drift: 0, volume: 2 }], '(3 + 1) / (1 + 1) is exactly the limit: allowed');
  assert.equal(v.state('q').volume, 1.5);
  for (let i = 0; i < 5; i++) v.observe('q', ad('crop', 0.8));
  assert.deepEqual(v.close(5), [{ round: 5, peer: 'q', verdict: 'CUT', drift: 0, volume: 2.4 }], '(5 + 1) / (1.5 + 1) is over it');
  // a drift exactly on the limit is allowed
  const e = I.behaviour({ drift: 0.5, volume: 9 });
  for (let r = 1; r <= 3; r++) { e.observe('q', ad('crop', 0.8)); e.close(r); }
  e.observe('q', ad('crop', 0.8)); e.observe('q', ad('water', 0.7));
  assert.deepEqual(e.close(4).map((c) => [c.verdict, c.drift]), [['ALLOW', 0.5]]);
  e.observe('q', ad('soil', 0.7)); e.observe('q', ad('sand', 0.7)); e.observe('q', ad('crop', 0.8));
  assert.equal(e.close(5)[0].verdict, 'CUT');
  // two peers are judged in a fixed order
  const two = I.behaviour({ drift: 1, volume: 9 });
  two.observe('zed', ad('crop', 0.8)); two.observe('amy', ad('crop', 0.8));
  assert.deepEqual(two.close(1).map((c) => c.peer), ['amy', 'zed']);
});

test('limits from honest rounds alone: the largest drift and volume they reached, with margin; calibrating rounds do not count', () => {
  const closes = [
    { verdict: 'CALIBRATING', drift: 0.9, volume: 9 },
    { verdict: 'ALLOW', drift: 0.2, volume: 1.5 },
    { verdict: 'ALLOW', drift: 0.4, volume: 1.2 },
  ];
  assert.deepEqual(I.limitsFrom(closes), { drift: 0.5, volume: 1.875, rounds: 2 });
  assert.deepEqual(I.limitsFrom(closes, 2), { drift: 0.8, volume: 3, rounds: 2 });
  assert.deepEqual(I.limitsFrom([{ verdict: 'ALLOW', drift: 0.9, volume: 0.5 }]), { drift: 1, volume: 1, rounds: 1 }, 'drift can be no more than 1; volume no less');
  assert.deepEqual(I.limitsFrom([]), { drift: 0, volume: 1, rounds: 0 });
});

/* ─── behaviour, by channel (9b) ─── */

const adv = (d, s) => ({ kind: 'advert', body: d + ' ' + s + ' 10' }), job = (d) => ({ kind: 'task', body: 'i ' + d + ' 1' });
const feed = (w, peer, msgs, r) => { for (const m of msgs) w.observe(peer, m); return w.close(r); };

test('channels: claims and conduct each against their own baseline — jumpy tasks cannot drown a change in claims', () => {
  assert.deepEqual(I.CHANNELS, ['claims', 'conduct']);
  assert.equal(I.channelOf({ kind: 'advert' }), 'claims');
  for (const kind of ['task', 'reply', 'lesson', 'proof']) assert.equal(I.channelOf({ kind }), 'conduct');
  const busy = [adv('crop', 0.8), adv('water', 0.7), job('crop'), job('crop'), job('crop'), job('crop')];
  const jumped = [adv('crop', 0.99), adv('water', 0.99), job('crop'), job('crop'), job('crop'), job('crop')];
  const w = I.channels({ claims: 0.4, conduct: 1, volume: 9 }), one = I.behaviour({ drift: 0.4, volume: 9 });
  for (let r = 1; r <= 3; r++) {
    assert.deepEqual(feed(w, 'p', busy, r), [{ round: r, peer: 'p', verdict: 'CALIBRATING', claims: null, conduct: null, volume: null }]);
    feed(one, 'p', busy, r);
  }
  assert.deepEqual(w.state('p'), { rounds: 3, volume: 6, cut: false, claims: { rounds: 3, base: { 'advert crop 0.80': 0.5, 'advert water 0.70': 0.5 } }, conduct: { rounds: 3, base: { 'task crop': 1 } } });
  assert.deepEqual(feed(one, 'p', jumped, 4).map((c) => [c.verdict, c.drift]), [['ALLOW', 0.333334]], 'one mix: the claims are a third of it (shares kept to six places), under the limit');
  assert.deepEqual(feed(w, 'p', jumped, 4), [{ round: 4, peer: 'p', verdict: 'CUT', claims: 1, conduct: 0, volume: 1 }], 'by channel: the claims changed completely');
  assert.equal(w.cut('p'), true);
  assert.deepEqual(w.state('p').claims.base, { 'advert crop 0.80': 0.5, 'advert water 0.70': 0.5 }, 'a cut round does not teach the baseline');
  assert.deepEqual(feed(w, 'p', busy, 5), [], 'a cut peer is not judged again');
  assert.equal(w.cut('q'), false);
  assert.equal(w.state('q'), null);
});

test('channels: a channel is judged only once it has its own baseline, and only in a round that carries it', () => {
  const w = I.channels({ claims: 0.4, conduct: 1, volume: 9 });
  for (let r = 1; r <= 3; r++) feed(w, 'p', [adv('crop', 0.8), adv('water', 0.7)], r);
  assert.deepEqual(feed(w, 'p', [adv('crop', 0.8), adv('water', 0.7), job('crop')], 4), [{ round: 4, peer: 'p', verdict: 'ALLOW', claims: 0, conduct: null, volume: 1.333333 }], 'conduct is new: not judged yet');
  assert.equal(w.state('p').conduct.rounds, 1);
  assert.equal(w.state('p').volume, 2.25);
  assert.deepEqual(feed(w, 'p', [job('crop')], 5), [{ round: 5, peer: 'p', verdict: 'ALLOW', claims: null, conduct: null, volume: 0.615385 }], 'no claims this round; volume is judged');
  assert.deepEqual(w.close(6), [], 'a silent round judges nothing');
  for (let r = 7; r <= 8; r++) feed(w, 'p', [adv('crop', 0.8), adv('water', 0.7), job('crop')], r);
  assert.equal(w.state('p').conduct.rounds, 4);
  assert.deepEqual(feed(w, 'p', [adv('crop', 0.8), adv('water', 0.7)], 9).map((c) => [c.claims, c.conduct]), [[0, null]], 'conduct calibrated, but absent this round');
  assert.deepEqual(feed(w, 'p', [adv('crop', 0.8), adv('water', 0.7), job('water'), job('water')], 10).map((c) => [c.verdict, c.conduct]), [['ALLOW', 1]], 'conduct changed completely, and its limit is 1: allowed');
  // claims exactly on the limit are allowed; over it, cut
  const e = I.channels({ claims: 0.5, conduct: 1, volume: 9 });
  for (let r = 1; r <= 3; r++) feed(e, 'q', [adv('crop', 0.8)], r);
  assert.deepEqual(feed(e, 'q', [adv('crop', 0.8), adv('water', 0.7)], 4).map((c) => [c.verdict, c.claims]), [['ALLOW', 0.5]]);
  assert.deepEqual(feed(e, 'q', [adv('soil', 0.7), adv('sand', 0.7), adv('crop', 0.8)], 5).map((c) => [c.verdict, c.claims]), [['CUT', 0.666667]]);
  // conduct over its own limit cuts too
  const c = I.channels({ claims: 1, conduct: 0.5, volume: 9 });
  for (let r = 1; r <= 3; r++) feed(c, 'q', [adv('crop', 0.8), job('crop')], r);
  assert.deepEqual(feed(c, 'q', [adv('crop', 0.8), job('water')], 4).map((x) => [x.verdict, x.conduct]), [['CUT', 1]]);
  // volume: exactly on the limit allowed, over it cut
  const v = I.channels({ claims: 1, conduct: 1, volume: 2 });
  for (let r = 1; r <= 3; r++) feed(v, 'q', [adv('crop', 0.8)], r);
  assert.deepEqual(feed(v, 'q', [adv('crop', 0.8), adv('crop', 0.8), adv('crop', 0.8)], 4).map((x) => [x.verdict, x.volume]), [['ALLOW', 2]]);
  assert.deepEqual(feed(v, 'q', Array(5).fill(adv('crop', 0.8)), 5).map((x) => [x.verdict, x.volume]), [['CUT', 2.4]]);
  // peers in a fixed order
  const two = I.channels({ claims: 1, conduct: 1, volume: 9 });
  two.observe('zed', adv('crop', 0.8)); two.observe('amy', adv('crop', 0.8));
  assert.deepEqual(two.close(1).map((x) => x.peer), ['amy', 'zed']);
});

test('channel limits from honest rounds alone: per channel, the largest judged drift, with margin', () => {
  const closes = [
    { verdict: 'CALIBRATING', claims: null, conduct: null, volume: null },
    { verdict: 'ALLOW', claims: 0.2, conduct: null, volume: 1.5 },
    { verdict: 'ALLOW', claims: 0.4, conduct: 0.9, volume: 1.2 },
    { verdict: 'ALLOW', claims: undefined, conduct: '0.95', volume: null },
  ];
  assert.deepEqual(I.channelLimitsFrom(closes), { claims: 0.5, conduct: 1, volume: 1.875, rounds: 3 });
  assert.deepEqual(I.channelLimitsFrom(closes, 2), { claims: 0.8, conduct: 1, volume: 3, rounds: 3 });
  assert.deepEqual(I.channelLimitsFrom([{ verdict: 'ALLOW', claims: 0.1, conduct: 0.6, volume: 0.5 }]), { claims: 0.125, conduct: 0.75, volume: 1, rounds: 1 });
  assert.deepEqual(I.channelLimitsFrom([]), { claims: 0, conduct: 0, volume: 1, rounds: 0 });
});

/* ─── in the mesh ─── */

test('in the mesh: with organ 9 on, honest traffic goes exactly as it does without it', async () => {
  const run = async (opts) => {
    const nodes = await three({ bNoBeta: true }), m = M.mesh(nodes, opts), out = [];
    const work = M.tasks({ alpha: ALPHA, beta: BETA }, ['a', 'b', 'c'], 24, 5);
    for (let r = 1; r <= 4; r++) {
      await m.gossip(r);
      for (const t of work.slice((r - 1) * 6, r * 6)) out.push(await m.task(m.byName.get(t.at), t.domain, t.x, t.truth, r, t.id));
      m.fade(r);
      out.push(m.watch(r).filter((c) => c.verdict === 'CUT'));
    }
    return { out, maps: nodes.map(M.mapOf), sent: m.stats.sent, admitted: m.stats.admitted };
  };
  const off = await run({ learn: 'evidence' }), on = await run({ learn: 'evidence', immune: OPEN });
  assert.deepEqual(on, off);
  assert.equal(on.sent, on.admitted);
  assert.ok(on.out.some((r) => r.routed), 'tasks were routed');
  const nodes = await three(), m = M.mesh(nodes, { immune: OPEN });
  assert.ok(m.grammar.kinds.includes('proof') && !M.MESH.kinds.includes('proof'));
  assert.deepEqual(M.mesh(nodes).watch(1), [], 'organ 8’s mesh has no watch');
  assert.deepEqual(Object.keys(m.stats), ['sent', 'admitted', 'refused', 'onSight', 'lost', 'owed', 'proofs', 'badProofs', 'unshared', 'revoked']);
});

test('in the mesh: too large is refused before anything is hashed; the same bytes twice are refused on sight', async () => {
  const [A, B] = await three(), m = M.mesh([A, B], { immune: OPEN });
  assert.equal((await m.receive(B, 'x'.repeat(MAX_MSG + 1), 'x', undefined, 1)).stage, 'size');
  assert.equal((await m.receive(B, 'x'.repeat(MAX_MSG + 1), 'x', undefined, 1)).stage, 'size', 'never remembered: it costs nothing to refuse');
  assert.equal((await m.receive(B, 7, 'x', undefined, 1)).stage, 'size');
  assert.equal((await m.receive(B, 'é'.repeat(MAX_MSG / 2), 'x', undefined, 1)).stage, 'magic', 'bytes, not characters: exactly the limit is looked at');
  assert.equal((await m.receive(B, 'é'.repeat(MAX_MSG / 2 + 1), 'x', undefined, 1)).stage, 'size');
  assert.equal((await m.receive(B, 'junk', 'x', undefined, 1)).stage, 'magic');
  assert.equal((await m.receive(B, 'junk', 'x', undefined, 1)).stage, 'immune');
  assert.equal(m.stats.onSight, 1);
  assert.equal(m.stats.refused, 6);
  assert.equal(B.sentinel.memory.size(), 2);
  assert.equal(B.sentinel.rebound.count('x'), 7, 'every refusal stretches the rebound');
  assert.equal(A.sentinel.rebound.count('x'), 0, 'per node');
});

test('in the mesh: delivered bytes — an admitted advert is a line in the map; nothing else is', async () => {
  const [A, B] = await three(), m = M.mesh([A, B], { immune: OPEN });
  const task = await envelope({ kind: 'task', to: B.org.id, n: 1, body: '0000000000000001 alpha 1,2,3,4' }, A.keys, m.grammar);
  assert.equal((await m.deliver(B, task.text, 'a', undefined, 1)).admit, true);
  assert.equal(B.map.size, 0, 'a task is not an advert');
  const ad = await envelope({ kind: 'advert', to: B.org.id, n: 2, body: 'alpha 0.75 180' }, A.keys, m.grammar);
  assert.equal((await m.deliver(B, ad.text, 'a', undefined, 1)).admit, true);
  assert.deepEqual([...B.map], [['a|alpha', { node: 'a', domain: 'alpha', auc: 0.75, held: 180, v: 2 }]]);
  assert.equal((await m.deliver(B, ad.text, 'a', undefined, 1)).admit, false, 'a replay tells it nothing');
  assert.equal(B.map.get('a|alpha').v, 2);
});

test('in the mesh: the rebound — past the limit a source pays before it is looked at; one hash refuses it if it does not', async () => {
  const [A, B] = await three(), law = { limit: 3, base: 6, step: 2, max: 10 }, m = M.mesh([A, B], { immune: { ...OPEN, law } });
  await m.gossip(1);
  const r = rng(3), forged = async (i) => (await envelope({ kind: 'advert', to: B.org.id, n: 1 + i, body: 'alpha 0.9' + i + ' 180' }, A.keys, m.grammar)).text.replace(/sig [0-9a-f]+$/, 'sig ' + Array.from({ length: 128 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''));
  const stages = [];
  for (let i = 0; i < 3; i++) stages.push((await m.deliver(B, await forged(i), 'x', undefined, 2)).stage);
  assert.deepEqual(stages, ['signature', 'signature', 'signature'], 'under the limit: looked at, and refused');
  const owing = await m.deliver(B, await forged(3), 'x', undefined, 2);
  assert.deepEqual([owing.stage, owing.bits], ['rebound', 6]);
  assert.equal(m.stats.owed, 1);
  const text = await forged(4), s = I.solve('x', text, B.sentinel.rebound.owes('x'), 1 << 16);
  assert.equal(B.sentinel.rebound.owes('x'), 6);
  assert.equal((await m.deliver(B, text, 'x', s.nonce, 2)).stage, 'signature', 'paid: looked at — and the gate still refuses it');
  assert.equal(B.sentinel.rebound.owes('x'), 7, 'and it owes more');
  const again = I.zeroBits(I.stampHash('x', text, s.nonce)) >= 7 ? 'immune' : 'rebound';
  assert.equal((await m.deliver(B, text, 'x', s.nonce, 2)).stage, again, 'a stamp pays only the bits it has');
  assert.equal((await m.deliver(B, await forged(5), 'y', undefined, 2)).stage, 'signature', 'another source starts free');
  // an honest sender on its own link is never asked for anything
  await m.gossip(2);
  assert.equal(B.sentinel.rebound.count('a'), 0);
  assert.equal(m.stats.sent, m.stats.admitted);
});

test('in the mesh: a key signing twice on one counter is caught, revoked, and the proof makes every other node immune', async () => {
  const [A, B, C] = await three(), m = M.mesh([A, B, C], { immune: OPEN });
  await m.gossip(1);
  // a thief copies A's key and A's counters, and gets in first
  const thief = { keys: A.keys, outN: new Map(A.outN) }, steal = async (to, body) => {
    const n = (thief.outN.get(to.pub) || 0) + 1; thief.outN.set(to.pub, n);
    return m.deliver(to, (await envelope({ kind: 'advert', to: to.org.id, n, body }, thief.keys, m.grammar)).text, 'thief', undefined, 2);
  };
  assert.equal((await steal(B, 'alpha 0.99 180')).admit, true, 'the gate cannot tell: it is A’s key');
  assert.equal(B.map.get('a|alpha').auc, 0.99, 'and B believes it — for now');
  await m.gossip(2);   // the real A gossips on the same counter
  assert.deepEqual(B.sentinel.revoked.get(A.pub), { why: 'proof', round: 2 });
  assert.deepEqual(C.sentinel.revoked.get(A.pub), { why: 'proof from b', round: 2 }, 'C never saw the clash: it checked the proof itself');
  assert.equal(m.stats.proofs, 1);
  assert.equal(m.stats.revoked, 2);
  assert.ok(![...B.map.keys(), ...C.map.keys()].some((k) => k.startsWith('a|')), 'what the key advertised is forgotten');
  assert.ok(B.map.has('c|alpha') && C.map.has('b|alpha'), 'the others are untouched');
  assert.equal((await steal(C, 'alpha 0.99 180')).stage, 'sender', 'the stolen key is refused before its signature is checked');
  assert.ok(m.log.some((e) => e.type === 'revoke' && e.from === 'c' && e.to === 'a' && e.why === 'proof from b'));
  assert.equal(B.sentinel.revoked.has(C.pub) || C.sentinel.revoked.has(B.pub), false);
  assert.equal(A.sentinel.revoked.size, 0);
});

test('in the mesh: no node can be smeared — a proof is checked, never taken on its word', async () => {
  const [A, B, C] = await three(), m = M.mesh([A, B, C], { immune: OPEN }), G = m.grammar;
  await m.gossip(1);
  const two = async (k, to) => [(await envelope({ kind: 'advert', to, n: 7, body: 'alpha 0.9 180' }, k, G)).text, (await envelope({ kind: 'advert', to, n: 7, body: 'alpha 0.8 180' }, k, G)).text];
  const nobody = await key('nobody'), real = I.proofOf(...await two(nobody, B.org.id));
  // a proof against honest B, made with someone else's signatures
  assert.equal((await m.send(C, A, 'proof', real.replace(/^[0-9a-f]{64}/, B.pub), 2)).ok, true, 'it is admitted: C is trusted to send it');
  assert.equal(m.stats.badProofs, 1);
  assert.equal(A.sentinel.revoked.size, 0, 'and B is not revoked');
  assert.ok(m.log.some((e) => e.type === 'bad-proof' && e.from === 'c' && e.to === 'a' && e.why === 'a signature in it does not verify'));
  // a true proof against a key this mesh does not hold revokes nobody
  assert.equal((await m.send(C, A, 'proof', real, 2)).ok, true);
  assert.equal(m.stats.proofs, 1);
  assert.equal(A.sentinel.revoked.size, 0);
  // a true proof against A's own key, sent to A: A cannot revoke itself (its owner must re-key)
  const againstA = I.proofOf(...await two(A.keys, B.org.id));
  assert.equal((await m.send(B, A, 'proof', againstA, 2)).ok, true);
  assert.equal(m.stats.proofs, 2);
  assert.equal(A.sentinel.revoked.size, 0);
  // the same proof, sent to C: C checks it and revokes A
  assert.equal((await m.send(B, C, 'proof', againstA, 2)).ok, true);
  assert.deepEqual(C.sentinel.revoked.get(A.pub), { why: 'proof from b', round: 2 });
  assert.equal(m.stats.revoked, 1);
  // the same proof again: A is already revoked at C, and stays revoked as it was
  assert.equal((await m.send(B, C, 'proof', againstA, 3)).ok, true);
  assert.equal(m.stats.revoked, 1);
  assert.deepEqual(C.sentinel.revoked.get(A.pub), { why: 'proof from b', round: 2 });
  assert.equal(m.log.filter((e) => e.type === 'revoke').length, 1);
});

test('in the mesh: a proof too large to send is kept where it was found; an exact replay is only a replay', async () => {
  const [A, B, C] = await three(), m = M.mesh([A, B, C], { immune: OPEN });
  await m.gossip(1);
  const n = A.outN.get(B.pub) + 1, many = (v) => Array(16).fill(v).join(',');
  const x = await envelope({ kind: 'task', to: B.org.id, n, body: '0000000000000001 alpha ' + many('1234567.123456') }, A.keys, m.grammar);
  const y = await envelope({ kind: 'task', to: B.org.id, n, body: '0000000000000002 alpha ' + many('7654321.123456') }, A.keys, m.grammar);
  assert.equal((await m.deliver(B, x.text, 'thief', undefined, 2)).admit, true);
  assert.equal((await m.deliver(B, y.text, 'a', undefined, 2)).stage, 'counter');
  assert.equal(I.proofOf(x.text, y.text), null);
  assert.equal(m.stats.unshared, 1);
  assert.equal(B.sentinel.revoked.has(A.pub), true);
  assert.equal(C.sentinel.revoked.has(A.pub), false, 'C was not told — it finds out for itself if it meets the clash');
  const first = C.sentinel.ledger.at(B.pub, 1);
  assert.equal((await m.deliver(C, first, 'b', undefined, 2)).stage, 'counter');
  assert.equal(C.sentinel.revoked.has(B.pub), false, 'the very message admitted, again: a replay, not a second message');
  const other = await envelope({ kind: 'advert', to: C.org.id, n: 1, body: 'alpha 0.5 180' }, B.keys, m.grammar);
  assert.equal((await m.deliver(C, other.text, 'b', undefined, 2)).stage, 'counter');
  assert.deepEqual(C.sentinel.revoked.get(B.pub), { why: 'proof', round: 2 }, 'another message on counter 1: the key signed twice');
  assert.deepEqual(A.sentinel.revoked.get(B.pub), { why: 'proof from c', round: 2 });
});

test('in the mesh: a peer whose behaviour departs from its own baseline is cut off by the node that saw it — and only there', async () => {
  const [A, B, C] = await three(), m = M.mesh([A, B, C], { immune: { ...OPEN, limits: { drift: 0.4, volume: 3 } } });
  for (let r = 1; r <= 4; r++) { await m.gossip(r); assert.deepEqual(m.watch(r).filter((c) => c.verdict === 'CUT'), []); }
  const real = M.adverts(A).map((x) => I.tokenOf({ kind: 'advert', body: x.domain + ' ' + x.auc + ' 1' }));
  A.claims = { alpha: 0.99, beta: 0.99 };
  assert.ok(real.every((t) => !t.endsWith('0.95')), 'the claims are new to its baseline');
  await m.gossip(5);
  const w = m.watch(5);
  assert.deepEqual(w.filter((c) => c.verdict === 'CUT').map((c) => [c.node, c.peer, c.drift]), [['b', 'a', 1], ['c', 'a', 1]]);
  assert.ok(w.filter((c) => c.peer !== 'a').every((c) => c.verdict === 'ALLOW'));
  assert.deepEqual(B.sentinel.revoked.get(A.pub), { why: 'behaviour', round: 5 });
  assert.equal(m.stats.proofs, 0, 'behaviour is never spread');
  assert.ok(!B.map.has('a|alpha'));
  await m.gossip(6);
  assert.ok(!B.map.has('a|alpha'), 'and not heard again');
  assert.ok(A.map.has('b|alpha'), 'A still hears B: the cut is B’s, not A’s');
});

test('in the mesh: with channels on, a peer whose claims change is cut, by claims, by the nodes that saw it', async () => {
  const [A, B, C] = await three(), m = M.mesh([A, B, C], { immune: { ...OPEN, channels: true, limits: { claims: 0.4, conduct: 1, volume: 3 } } });
  for (let r = 1; r <= 4; r++) { await m.gossip(r); assert.deepEqual(m.watch(r).filter((c) => c.verdict === 'CUT'), []); }
  A.claims = { alpha: 0.99, beta: 0.99 };
  await m.gossip(5);
  const w = m.watch(5);
  assert.deepEqual(w.filter((c) => c.verdict === 'CUT').map((c) => [c.node, c.peer, c.claims, c.conduct]), [['b', 'a', 1, null], ['c', 'a', 1, null]]);
  assert.deepEqual(C.sentinel.revoked.get(A.pub), { why: 'behaviour', round: 5 });
  assert.ok(B.sentinel.watch.state(A.pub).claims, 'the channel watch, not the single mix');
});

// The mesh is unit-tested on a three-node toy mesh made here, so no real organ-8 result is seen before its seal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/mesh.mjs';
import { envelope, admit } from '../src/gate.mjs';
import { seal, open } from '../src/genome.mjs';
import { encodeSeed, stemGenome, rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/mesh-' + s)));
function toy(name, seed, signal = true, n = 600) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = signal ? (cols.a[i] + 0.5 * cols.b[i] + 30 * r() > 95 ? 1 : 0) : (r() < 0.3 ? 1 : 0); }
  return { ok: true, name, features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(n - 420).keys()].map((i) => i + 420) };
}
const ALPHA = toy('alpha', 1), BETA = toy('beta', 2);
const rec = (d) => encodeSeed({ domain: d, seed: 1, genome: stemGenome() });
async function three({ noisyC = false } = {}) {
  const [ka, kb, kc] = await Promise.all(['a', 'b', 'c'].map(key));
  const both = await seal({ name: 'both', gate: { auc: 0.6 }, organs: [rec('alpha'), rec('beta')] }, ka);
  const onlyAlpha = await seal({ name: 'alpha-only', gate: { auc: 0.6 }, organs: [rec('alpha')] }, kc);
  const A = (await M.node('a', both.text, { name: 'a', data: { alpha: ALPHA, beta: BETA } }, ka)).node;
  const B = (await M.node('b', both.text, { name: 'b', data: { alpha: ALPHA } }, kb)).node;              // no beta data: beta dormant
  const C = (await M.node('c', onlyAlpha.text, { name: 'c', data: { alpha: ALPHA, beta: noisyC ? toy('beta', 2, false) : BETA } }, kc)).node;   // holds beta data, no beta organ
  return { A, B, C };
}

test('a node is an organism on its own data; it advertises only what it has live', async () => {
  const { A, B, C } = await three();
  assert.deepEqual(M.adverts(A).map((x) => x.domain), ['alpha', 'beta']);
  assert.deepEqual(M.adverts(B).map((x) => x.domain), ['alpha'], 'beta is dormant on b');
  assert.deepEqual(M.adverts(C).map((x) => x.domain), ['alpha']);
  assert.ok(M.adverts(A).every((x) => x.auc >= 0.6 && x.held === 180));
  const bad = await M.node('x', 'nonsense', { name: 'x', data: {} }, await key('x'));
  assert.deepEqual(bad, { ok: false, why: 'the genome was refused: not a genome' });
});

test('gossip: every node learns what every node it can reach has live; the maps converge', async () => {
  const { A, B, C } = await three(), m = M.mesh([A, B, C]);
  await m.gossip(1);
  assert.deepEqual(M.mapOf(A), M.mapOf(B));
  assert.deepEqual(M.mapOf(B), M.mapOf(C));
  assert.equal(M.mapOf(A).length, 4, 'a: alpha, beta · b: alpha · c: alpha');
  assert.equal(m.stats.admitted, m.stats.sent, 'every advert passed the gate');
  assert.equal(m.stats.sent, 2 * 2 + 2 + 2, 'each node told each other node each organ');
  // a partition: c cannot reach a or b — c's map misses a's beta change, and heals when the cut lifts
  const cut = { on: true };
  const p = M.mesh([A, B, C], { cut: (x, y) => cut.on && (x === 'c' || y === 'c') && x !== y });
  await p.gossip(2);
  assert.equal(p.stats.lost, 2 + 1 + 1 + 1, 'every advert across the cut is lost: a→c (2), b→c, c→a, c→b');
  cut.on = false;
  await p.gossip(3);
  assert.deepEqual(M.mapOf(C), M.mapOf(A), 'healed');
});

test('a task the node can answer is answered at home; one it cannot is routed, signed both ways, and the link learns', async () => {
  const { A, B, C } = await three(), m = M.mesh([A, B, C]);
  await m.gossip(1);
  const home = BETA.heldRows[0], x = Object.fromEntries(BETA.features.map((f) => [f, BETA.cols[f][home]]));
  const atA = await m.task(A, 'beta', x, BETA.y[home], 2, 'a'.repeat(16));
  assert.deepEqual([atA.by, atA.routed, atA.verdict], ['a', false, 'VERIFIED']);
  const before = m.stats.sent, atB = await m.task(B, 'beta', x, BETA.y[home], 2, '1'.repeat(16));
  assert.deepEqual([atB.by, atB.routed, atB.verdict, atB.label], ['a', true, 'VERIFIED', atA.label], 'routed to the only node with beta live, the same answer');
  assert.equal(m.stats.sent - before, 2, 'a task and its reply');
  assert.equal(B.links.get('a'), atB.right ? M.ETA : 0);
  assert.equal(B.abstains.get('beta'), 1);
  // repeated right answers strengthen the link to a ceiling; fading drops it to the floor
  let rights = 0;
  for (let k = 0; k < 12; k++) { const i = BETA.heldRows[k + 1], xk = Object.fromEntries(BETA.features.map((f) => [f, BETA.cols[f][i]])); const r = await m.task(B, 'beta', xk, BETA.y[i], 3, (k + 2).toString(16).padStart(16, '0')); if (r.right) rights++; }
  assert.ok(rights >= 8 && B.links.get('a') <= 1);
  for (let k = 0; k < 120; k++) m.fade(10 + k);
  assert.equal(B.links.has('a'), false, 'a link that stops being used fades and is dropped');
  assert.ok(m.log.some((e) => e.type === 'prune' && e.from === 'b' && e.to === 'a'));
  // a dead node: the task is lost, nothing is answered, the link weakens
  A.alive = false;
  const lost = await m.task(B, 'beta', x, BETA.y[home], 200, 'f'.repeat(16));
  assert.deepEqual([lost.verdict, lost.by, lost.routed], ['ABSTAIN', null, true]);
  assert.ok(m.stats.lost >= 1);
  // nobody advertising: no route
  const lonely = M.mesh([B]);
  assert.deepEqual(await lonely.task(B, 'beta', x, 0, 1, '2'.repeat(16)), { by: null, verdict: 'ABSTAIN', right: false, routed: false });
});

test('routing picks by advert plus learned link; the link arithmetic is exact; a local answer is scored too', async () => {
  const { A, B, C } = await three(), m = M.mesh([A, B, C]);
  await m.gossip(1);
  assert.equal(m.bestFor(B, 'beta').ad.node, 'a', 'the only beta advertiser');
  assert.equal(m.bestFor(B, 'gamma'), undefined, 'nobody advertises gamma: no route');
  assert.equal(m.bestFor(B, 'alpha').ad.node, 'a', 'a and c tie on alpha: the first advertised');
  B.links.set('c', 0.5);
  assert.deepEqual([m.bestFor(B, 'alpha').ad.node, m.bestFor(B, 'alpha').score], ['c', Math.round((m.bestFor(B, 'alpha').ad.auc + 0.5) * 1e6) / 1e6], 'a learned link outweighs a tie');
  // exact link steps: +ETA when right (to 1 at most), −ETA/2 when wrong or unanswered (to 0 at least)
  const row = (k) => { const i = BETA.heldRows[k]; return [Object.fromEntries(BETA.features.map((f) => [f, BETA.cols[f][i]])), BETA.y[i]]; };
  const [x0, y0] = row(3), said = (await m.task(A, 'beta', x0, y0, 2, '9'.repeat(16))).label;   // what a will answer
  B.links.set('a', 0.6);
  assert.equal((await m.task(B, 'beta', x0, said, 2, '3'.repeat(16))).right, true);
  assert.equal(B.links.get('a'), 0.6 + M.ETA, 'right: strengthened from where it was');
  B.links.set('a', 0.6);
  assert.equal((await m.task(B, 'beta', x0, 1 - said, 2, '8'.repeat(16))).right, false);
  assert.equal(B.links.get('a'), 0.6 - M.ETA / 2, 'wrong: weakened from where it was');
  B.links.set('a', 0.95);
  await m.task(B, 'beta', x0, said, 2, 'b'.repeat(16));
  assert.equal(B.links.get('a'), 1, 'capped at 1');
  B.links.set('a', 0.04);
  await m.task(B, 'beta', x0, 1 - said, 2, 'c'.repeat(16));
  assert.equal(B.links.get('a'), 0, 'floored at 0');
  const far = Object.fromEntries(BETA.features.map((f) => [f, 1e6]));
  B.links.set('a', 0.6);
  const lost = await m.task(B, 'beta', far, 1, 3, '4'.repeat(16));
  assert.deepEqual([lost.verdict, lost.routed], ['ABSTAIN', true], 'a answered ABSTAIN: the case is far from its data');
  assert.equal(B.links.get('a'), 0.5);
  A.alive = false; B.links.set('a', 0.6);
  await m.task(B, 'beta', x0, y0, 4, '5'.repeat(16));
  assert.equal(B.links.get('a'), 0.5, 'unreachable: weakened, not reset');
  assert.deepEqual(M.mapOf(B).filter((e) => e[0] === 'a'), [], 'and what it advertised is forgotten');
  assert.equal(m.bestFor(B, 'beta'), undefined);
  A.alive = true; await m.gossip(4);
  assert.equal(m.bestFor(B, 'beta').ad.node, 'a', 'back, it advertises again');
  B.links.set('a', 0.9);
  for (let k = 10; k < 30; k++) { const [x, y] = row(k); const r = await m.task(B, 'beta', x, y, 5, (k + 100).toString(16).padStart(16, '0')); if (r.right) { assert.ok(B.links.get('a') <= 1); } }
  assert.ok(B.links.get('a') <= 1 && B.links.get('a') >= 0);
  // a local answer carries whether it was right, in the result and the log
  const [xl, yl] = row(40), loc = await m.task(A, 'beta', xl, yl, 6, '6'.repeat(16));
  assert.equal(loc.right, loc.label === yl);
  assert.equal(m.log.filter((e) => e.type === 'answer' && e.from === 'a' && e.round === 6).pop().ok, loc.right);
  const wrongTruth = 1 - loc.label, loc2 = await m.task(A, 'beta', xl, wrongTruth, 7, '7'.repeat(16));
  assert.equal(loc2.right, false);
});

test('fading: exactly on the floor a link stays; below it, it is dropped', async () => {
  const { A, B, C } = await three(), m = M.mesh([A, B, C]);
  B.links.set('a', M.PRUNE / M.DECAY);
  m.fade(1);
  assert.equal(B.links.get('a'), M.PRUNE, 'faded onto the floor: kept');
  m.fade(2);
  assert.equal(B.links.has('a'), false);
});

test('gap-sensing: a node that keeps abstaining on a domain it holds data for grows the specialist', async () => {
  const { A, B, C } = await three(), m = M.mesh([A, B, C]);
  await m.gossip(1);
  const parent = (await open(C.genome)).id;
  C.abstains.set('beta', M.GAP - 1);
  assert.deepEqual(await m.grow(1), [], 'one abstention short of a gap: nothing grows');
  C.alive = false; C.abstains.set('beta', M.GAP);
  assert.deepEqual(await m.grow(1), [], 'a dead node grows nothing');
  C.alive = true; C.abstains.set('beta', 0);
  for (let k = 0; k < M.GAP; k++) { const i = BETA.heldRows[k], xk = Object.fromEntries(BETA.features.map((f) => [f, BETA.cols[f][i]])); await m.task(C, 'beta', xk, BETA.y[i], 2, (k + 1).toString(16).padStart(16, '0')); }
  assert.equal(C.abstains.get('beta'), M.GAP);
  const grown = await m.grow(3);
  assert.deepEqual(grown.map((g) => [g.node, g.domain, g.from]), [['c', 'beta', 'a']]);
  const child = await open(C.genome);
  assert.deepEqual(child.fields.parents, [parent], 'a child of its own genome');
  assert.equal(child.fields.by, C.pub, 'sealed by itself');
  assert.ok(C.body.patterns.beta, 'the specialist is live');
  assert.equal(C.grown[0].heldAuc, grown[0].heldAuc);
  assert.deepEqual(await m.grow(4), [], 'grown once');
  // a node that already has the organ live never asks for it — even with someone else now advertising it
  await m.gossip(4);
  assert.equal(m.bestFor(A, 'beta').ad.node, 'c');
  A.abstains.set('beta', 2 * M.GAP);
  assert.deepEqual(await m.grow(4), []);
  // b holds no beta data: it never grows one, however often it abstains
  for (let k = 0; k < 6; k++) B.abstains.set('beta', 10);
  assert.deepEqual((await m.grow(5)).filter((g) => g.node === 'b'), []);
  // the specialist answers at home now
  const i = BETA.heldRows[50], xk = Object.fromEntries(BETA.features.map((f) => [f, BETA.cols[f][i]]));
  assert.equal((await m.task(C, 'beta', xk, BETA.y[i], 6, 'e'.repeat(16))).routed, false);
});

test('a lesson that does not clear on the node’s own data is refused, and the node does not grow', async () => {
  const { A, B, C } = await three({ noisyC: true }), m = M.mesh([A, B, C]);
  await m.gossip(1);
  C.abstains.set('beta', M.GAP);
  const g = await m.grow(2);
  assert.equal(g.length, 1);
  assert.match(g[0].refused, /^AUC 0\.\d+ on this device’s unseen cases is under the gate \(0\.6\)$/);
  assert.equal(C.body.patterns.beta, undefined);
  assert.deepEqual(await m.grow(3), [], 'it does not ask again');
});

test('antibodies: bytes one node refuses are refused on sight by the others', async () => {
  const { A, B, C } = await three(), m = M.mesh([A, B, C]);
  await m.gossip(1);
  const replay = m.log.length && (await envelope({ kind: 'advert', to: B.org.id, n: 1, body: 'alpha 0.9 180' }, A.keys, M.MESH)).text;   // a's first advert to b, again
  const first = await m.receive(B, replay);
  assert.deepEqual([first.admit, first.stage], [false, 'counter']);
  assert.equal(await m.warn(B, replay, first.stage, 2), 2);
  for (const n of [A, C]) { const r = await m.receive(n, replay); assert.deepEqual([r.admit, r.stage], [false, 'immune']); }
  assert.equal(m.stats.onSight, 2);
  const again = await m.receive(B, replay);
  assert.equal(again.stage, 'immune', 'and by the node that refused it first');
  // a stranger's message is refused at the gate
  const stranger = await key('stranger');
  const s = await envelope({ kind: 'task', to: A.org.id, n: 1, body: 'f'.repeat(16) + ' alpha 1,2,3,4' }, stranger, M.MESH);
  assert.equal((await m.receive(A, s.text)).stage, 'sender');
});

test('the mesh grammar: every kind’s body exactly', async () => {
  const k = await key('g'), to = 'a'.repeat(16);
  const ok = async (kind, body) => (await envelope({ kind, to, n: 1, body }, k, M.MESH)).ok;
  assert.equal(await ok('advert', 'shopper 0.815265 4725'), true);
  assert.equal(await ok('advert', 'shopper 1 1'), true);
  for (const b of ['Shopper 0.8 1', 'shopper 0.8 0', 'shopper 1.2 5', 'shopper 0.8', 'shopper 0.1234567 5']) assert.equal(await ok('advert', b), false, b);
  assert.equal(await ok('task', 'a'.repeat(16) + ' water 7.1,0.5,-3,12'), true);
  for (const b of ['a'.repeat(16) + ' water', 'a'.repeat(16) + ' water 1,,2', 'a'.repeat(15) + ' water 1', 'a'.repeat(16) + ' water ' + Array(17).fill(1).join(','), 'a'.repeat(16) + ' water 1e-7']) assert.equal(await ok('task', b), false, b);
  assert.equal(await ok('reply', 'a'.repeat(16) + ' VERIFIED 1 2.25'), true);
  assert.equal(await ok('reply', 'a'.repeat(16) + ' ABSTAIN'), true);
  for (const b of ['a'.repeat(16) + ' VERIFIED 2 1', 'a'.repeat(16) + ' VERIFIED 1', 'a'.repeat(16) + ' MAYBE']) assert.equal(await ok('reply', b), false, b);
  assert.equal(await ok('genome', 'x'), false);
  assert.equal((await envelope({ kind: 'genome', to, n: 1, body: 'x' }, k, M.MESH)).why, 'a message is not a kind this grammar knows');
  // the default grammar does not know the mesh's kinds
  const t = (await envelope({ kind: 'task', to, n: 1, body: 'a'.repeat(16) + ' water 1' }, k, M.MESH)).text;
  assert.equal((await admit(t, { me: to, senders: { [k.pub]: ['task'] }, last: () => 0 })).stage, 'magic');
  assert.equal((await admit(t, { me: to, senders: { [k.pub]: ['task'] }, last: () => 0, grammar: M.MESH })).admit, true);
});

test('tasks: a seeded draw of unseen cases, each arriving at a node', () => {
  const t = M.tasks({ alpha: ALPHA, beta: BETA }, ['a', 'b', 'c'], 20, 7);
  assert.equal(t.length, 20);
  assert.deepEqual(M.tasks({ alpha: ALPHA, beta: BETA }, ['a', 'b', 'c'], 20, 7), t);
  for (const x of t) { const ds = x.domain === 'alpha' ? ALPHA : BETA; assert.ok(ds.heldRows.includes(x.row)); assert.equal(x.truth, ds.y[x.row]); assert.ok(['a', 'b', 'c'].includes(x.at)); assert.match(x.id, /^[0-9a-f]{16}$/); assert.deepEqual(Object.keys(x.x), ds.features); }
  assert.ok(new Set(t.map((x) => x.domain)).size === 2 && new Set(t.map((x) => x.at)).size === 3);
});

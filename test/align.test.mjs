// align.test.mjs — organ 10, unit-tested on toy data made here (no real organ-10 result is seen before its seal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/align.mjs';
import { seal } from '../src/genome.mjs';
import { germinate } from '../src/germinate.mjs';
import { embody, ask } from '../src/body.mjs';
import { encodeSeed, stemGenome, rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

/** a toy world: y = a + b/2 + noise over a bar; from row `from` on, the bar is `later` (the world moved) */
function world(seed, { bar = 95, later = bar, from = Infinity, n = 1200 } = {}) {
  const r = rng(seed), cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n) }, y = new Uint8Array(n);
  for (let i = 0; i < n; i++) { for (const f of ['a', 'b', 'c', 'd']) cols[f][i] = Math.round(r() * 1000) / 10; y[i] = cols.a[i] + 0.5 * cols.b[i] + 30 * r() > (i >= from ? later : bar) ? 1 : 0; }
  return { ok: true, name: 'alpha', features: ['a', 'b', 'c', 'd'], n, cols, y, trainRows: [...Array(420).keys()], heldRows: [...Array(180).keys()].map((i) => i + 420) };
}
const STREAM = [...Array(600).keys()].map((i) => ({ domain: 'alpha', row: 600 + i }));
let G;
const genome = async () => G || (G = (await seal({ name: 'toy', gate: { auc: 0.6 }, organs: [encodeSeed({ domain: 'alpha', seed: 1, genome: stemGenome() })] }, await fromSeed(sha256Bytes(utf8('living-seed/maker/align-toy'))))).text);
const live = async (ds, stream = STREAM, opts = {}) => A.life(await genome(), { name: 'toy', data: { alpha: ds } }, stream, opts);

test('the audit’s slack: Hoeffding’s one-sided bound, and 1 (no evidence) when it cannot be read', () => {
  assert.deepEqual(A.AUDIT, { window: 200, every: 50, delta: 0.0005, regrow: 300 });
  assert.equal(A.slack(200, 0.0005), 0.137849);   // √(ln 2000 / 400)
  assert.equal(A.slack(50, 0.05), 0.173082);      // √(ln 20 / 100)
  for (const [n, d] of [[0, 0.1], [-1, 0.1], [10, 0], [10, 1], [10, -0.5], [10, 1.5]]) assert.equal(A.slack(n, d), 1);
  assert.ok(A.slack(1000, 0.0005) < A.slack(200, 0.0005), 'more evidence, less slack');
});

test('the chain: each act linked to the one before; a changed byte, a dropped act, a swapped pair or a forged link is found', () => {
  const c = A.chain();
  assert.equal(c.head(), '0'.repeat(16));
  const a = c.add({ kind: 'claim', domain: 'x', accuracy: 0.8 }), b = c.add({ kind: 'abstain', domain: 'x', at: 0 }), d = c.add({ kind: 'abstain', domain: 'x', at: 1 });
  assert.deepEqual([a.n, b.n, d.n], [1, 2, 3]);
  assert.equal(a.prev, '0'.repeat(16));
  assert.equal(b.prev, a.hash);
  assert.equal(c.head(), d.hash);
  assert.ok(Object.isFrozen(a));
  assert.deepEqual(A.verifyChain(c.entries), { ok: true, n: 3 });
  assert.deepEqual(A.verifyChain([]), { ok: true, n: 0 });
  const e = c.entries;
  assert.deepEqual(A.verifyChain([e[0], { ...e[1], act: { ...e[1].act, at: 9 } }, e[2]]), { ok: false, at: 2, why: 'the act was changed after it was written' });
  assert.deepEqual(A.verifyChain([e[0], e[2]]), { ok: false, at: 2, why: 'an act is missing or out of place' });
  assert.deepEqual(A.verifyChain([e[1], e[0], e[2]]), { ok: false, at: 1, why: 'an act is missing or out of place' });
  assert.deepEqual(A.verifyChain([e[0], { ...e[1], prev: 'f'.repeat(16) }, e[2]]), { ok: false, at: 2, why: 'the link to the act before is broken' });
  // a forger who rewrites the whole tail consistently still breaks the link from the act he did not rewrite
  const f = A.chain(); f.add(e[0].act); f.add({ ...e[1].act, at: 9 }); f.add(e[2].act);
  assert.deepEqual(A.verifyChain(f.entries), { ok: true, n: 3 }, 'a consistent rewrite verifies as a chain — which is why the life is REPLAYED, not just its links checked');
  assert.notEqual(f.head(), c.head());
  assert.deepEqual(A.verifyChain(null), { ok: false, at: 0, why: 'not a ledger' });
  assert.deepEqual(A.verifyChain([7]), { ok: false, at: 1, why: 'an act is missing or out of place' });
});

test('licences: an act whose licence does not hold is refused, with the reason', async () => {
  const ds = world(1), g = await germinate(await genome(), { name: 'toy', data: { alpha: ds } }), body = embody(g.organism, { name: 'toy', data: { alpha: ds } }).body;
  const x = { a: 90, b: 60, c: 1, d: 1 }, ans = ask(body, x, { domain: 'alpha' });
  assert.equal(ans.verdict, 'VERIFIED');
  const st = { live: { alpha: { organism: g.organism.id, claim: 0.8 } }, down: new Set() };
  const L = (act, s = st) => A.licensed(act, s);
  assert.deepEqual(L({ kind: 'answer', domain: 'alpha', receipt: ans.receipt }), { ok: true });
  assert.deepEqual(L({ kind: 'answer', domain: 'alpha', receipt: { ...ans.receipt, label: 1 - ans.label } }), { ok: false, why: 'the answer carries no receipt that checks' });
  assert.deepEqual(L({ kind: 'answer', domain: 'alpha' }), { ok: false, why: 'the answer carries no receipt that checks' });
  assert.deepEqual(L({ kind: 'answer', domain: 'alpha', receipt: ans.receipt }, { live: { alpha: { organism: 'someone-else', claim: 0.8 } }, down: new Set() }), { ok: false, why: 'the receipt is not from the organ that is live' });
  assert.deepEqual(L({ kind: 'answer', domain: 'beta', receipt: ans.receipt }, { live: { alpha: st.live.alpha, beta: st.live.alpha }, down: new Set() }), { ok: false, why: 'the receipt is not from the organ that is live' }, 'a receipt for another domain');
  assert.deepEqual(L({ kind: 'answer', domain: 'beta', receipt: ans.receipt }), { ok: false, why: 'it has no live beta organ' });
  assert.deepEqual(L({ kind: 'answer', domain: 'alpha', receipt: ans.receipt }, { ...st, down: new Set(['alpha']) }), { ok: false, why: 'its alpha organ is stood down' });
  assert.deepEqual(L({ kind: 'claim', domain: 'alpha', accuracy: 0.8 }), { ok: true });
  assert.deepEqual(L({ kind: 'claim', domain: 'alpha', accuracy: 0.80001 }), { ok: false, why: 'the claim is more than the organ measured (0.8)' });
  assert.deepEqual(L({ kind: 'claim', domain: 'alpha', accuracy: 'high' }), { ok: false, why: 'the claim is more than the organ measured (0.8)' });
  assert.deepEqual(L({ kind: 'claim', domain: 'beta', accuracy: 0.5 }), { ok: false, why: 'it may not claim a beta organ it does not have live' });
  assert.deepEqual(L({ kind: 'claim', domain: 'alpha', accuracy: 0.5 }, { ...st, down: new Set(['alpha']) }), { ok: false, why: 'it may not claim a alpha organ it does not have live' });
  const s200 = A.slack(200, 0.0005);   // 0.137849: short means under 0.8 − 0.137849 = 0.662151
  assert.deepEqual(L({ kind: 'stand-down', domain: 'alpha', audit: { n: 200, right: 132, delta: 0.0005 } }), { ok: true }, '0.66 is short');
  assert.deepEqual(L({ kind: 'stand-down', domain: 'alpha', audit: { n: 200, right: 133, delta: 0.0005 } }), { ok: false, why: 'the audit does not show it falling short' }, '0.665 is within chance');
  assert.ok(132 / 200 < 0.8 - s200 && 133 / 200 > 0.8 - s200);
  assert.deepEqual(L({ kind: 'stand-down', domain: 'alpha' }), { ok: false, why: 'the audit does not show it falling short' });
  // exactly on the bound is within chance: 1 of 2 right against a claim of 0.75 with a slack of exactly 0.25
  const dq = Math.exp(-0.25);
  assert.equal(A.slack(2, dq), 0.25);
  assert.equal(0.75 - A.slack(2, dq), 0.5);
  assert.deepEqual(L({ kind: 'stand-down', domain: 'alpha', audit: { n: 2, right: 1, delta: dq } }, { live: { alpha: { organism: g.organism.id, claim: 0.75 } }, down: new Set() }), { ok: false, why: 'the audit does not show it falling short' });
  assert.deepEqual(L({ kind: 'stand-down', domain: 'alpha', audit: { n: 2, right: 0, delta: dq } }, { live: { alpha: { organism: g.organism.id, claim: 0.75 } }, down: new Set() }), { ok: true });
  assert.deepEqual(L({ kind: 'stand-down', domain: 'alpha', audit: { n: 200, right: 0, delta: 0.0005 } }, { ...st, down: new Set(['alpha']) }), { ok: false, why: 'there is no live alpha organ to stand down' });
  assert.deepEqual(L({ kind: 'stand-down', domain: 'beta', audit: { n: 200, right: 0, delta: 0.0005 } }), { ok: false, why: 'there is no live beta organ to stand down' });
  const down = { ...st, down: new Set(['alpha']) };
  assert.deepEqual(L({ kind: 'return', domain: 'alpha', heldAuc: 0.6, gate: 0.6 }, down), { ok: true }, 'exactly on the gate');
  assert.deepEqual(L({ kind: 'return', domain: 'alpha', heldAuc: 0.599999, gate: 0.6 }, down), { ok: false, why: 'the regrown organ did not clear the gate' });
  assert.deepEqual(L({ kind: 'return', domain: 'alpha', heldAuc: 0.9, gate: 0.6 }), { ok: false, why: 'the alpha organ is not stood down' });
  assert.deepEqual(L({ kind: 'abstain', domain: 'alpha' }), { ok: true }, 'not answering is always allowed');
  assert.deepEqual(L({ kind: 'abstain', domain: 'beta' }, down), { ok: true });
  assert.deepEqual(L({ kind: 'delete', domain: 'alpha' }), { ok: false, why: 'not an act the organism has' });
  assert.deepEqual(L(null), { ok: false, why: 'the act could not be read' });
  assert.deepEqual(L({ kind: 'answer', domain: 'alpha', receipt: ans.receipt }, null), { ok: false, why: 'the act could not be read' });
});

test('the tracker: the last window of outcomes', () => {
  const t = A.tracker(3);
  assert.equal(t.n(), 0);
  t.push(true); t.push(false); t.push(true);
  assert.deepEqual([t.n(), t.right()], [3, 2]);
  t.push(false);
  assert.deepEqual([t.n(), t.right()], [3, 1], 'the oldest (right) fell out');
  t.push(1); t.push(0);
  assert.deepEqual([t.n(), t.right()], [3, 1]);
  t.clear();
  assert.deepEqual([t.n(), t.right()], [0, 0]);
});

test('a claim is what the organ measured: the accuracy of its own answers on its held-out cases', async () => {
  const ds = world(1), sub = { name: 'toy', data: { alpha: ds } }, g = await germinate(await genome(), sub), body = embody(g.organism, sub).body;
  let n = 0, right = 0;
  for (const i of ds.heldRows) { const a = ask(body, { a: ds.cols.a[i], b: ds.cols.b[i], c: ds.cols.c[i], d: ds.cols.d[i] }, { domain: 'alpha' }); if (a.verdict === 'VERIFIED') { n++; if (a.label === ds.y[i]) right++; } }
  assert.ok(n > 0);
  assert.equal(A.measuredClaim(body, ds, 'alpha'), Math.round((right / n) * 1e6) / 1e6);
  assert.equal(A.measuredClaim(body, { ...ds, heldRows: [] }, 'alpha'), 0, 'no answers, no claim');
  assert.equal(A.measuredClaim(body, ds, 'beta'), 0, 'no organ, no answers');
});

test('a life with no drift: it answers, never stands down, and its ledger replays byte for byte', async () => {
  const ds = world(1), a = await live(ds), b = await live(ds);
  assert.equal(a.ok, true);
  assert.deepEqual(a.events, []);
  assert.equal(a.acts['stand-down'], 0);
  assert.equal(a.acts.claim, 1);
  assert.equal(a.acts.answer + a.acts.abstain, STREAM.length, 'one act per case');
  assert.equal(a.answered, a.acts.answer);
  assert.equal(a.right + a.wrong, a.answered);
  assert.ok(a.right > a.wrong);
  assert.deepEqual(A.verifyChain(a.ledger), { ok: true, n: a.ledger.length });
  assert.equal(a.head, a.ledger[a.ledger.length - 1].hash);
  assert.equal(b.head, a.head, 'the same genome, data and cases: the same life');
  assert.deepEqual(a.final, { live: { alpha: a.ledger[0].act.accuracy }, down: [] });
  assert.deepEqual(a.ledger[0].act, { kind: 'claim', domain: 'alpha', accuracy: a.ledger[0].act.accuracy, organism: a.ledger[0].act.organism });
  assert.ok(a.ledger.filter((e) => e.act.kind === 'answer').every((e) => e.act.receipt && e.act.receipt.domain === 'alpha'));
  const bad = await A.life('not a genome', { name: 'toy', data: { alpha: ds } }, STREAM);
  assert.equal(bad.ok, false);
});

test('a life where the world moved: the audit stands the organ down, it regrows on what it was told, and returns', async () => {
  const ds = world(1, { later: 60, from: 600 }), audited = await live(ds), blind = await live(ds, STREAM, { audit: false }), kept = await live(ds, STREAM, { regrow: false });
  const down = audited.events.find((e) => e.kind === 'stand-down'), back = audited.events.find((e) => e.kind === 'return');
  assert.ok(down, 'it stood down');
  assert.ok(down.accuracy < down.claim - A.slack(200, 0.0005), 'because it fell short by more than chance');
  assert.equal(blind.answered, STREAM.length, 'the toy organ answers every case, so its first full window closes at case 199');
  assert.equal(down.at, 199, 'the first audit — a full window, the moment it closes');
  assert.ok(back && back.at === down.at + A.AUDIT.regrow - 1, 'and came back the moment it had ' + A.AUDIT.regrow + ' labelled cases to regrow from');
  assert.ok(back.heldAuc >= 0.6, 'having cleared the gate on its newest cases');
  assert.equal(audited.acts['stand-down'], audited.events.filter((e) => e.kind === 'stand-down').length);
  assert.equal(audited.acts.return, audited.events.filter((e) => e.kind === 'return').length);
  assert.equal(audited.acts.claim, 1 + audited.acts.return, 'a fresh claim with every return');
  assert.deepEqual(A.verifyChain(audited.ledger), { ok: true, n: audited.ledger.length });
  assert.ok(audited.ledger.every((e) => e.act.kind !== 'answer' || audited.ledger.some((c) => c.act.kind === 'claim' && c.act.organism === e.act.receipt.organism && c.n < e.n)), 'every answer is from an organ that claimed first');
  assert.deepEqual(blind.events, [], 'with no audit it never notices');
  assert.ok(audited.wrong < blind.wrong, 'and gets more wrong');
  assert.equal(kept.events.filter((e) => e.kind === 'return').length, 0, 'with no regrowth, it stays down');
  assert.deepEqual(kept.final.down, ['alpha']);
  assert.ok(kept.wrong <= audited.wrong + 50 && kept.answered < audited.answered);
});

test('a life where the world reversed: it stands down, and the recipe cannot learn the new world, so it stays down', async () => {
  const ds = world(1), flip = STREAM.map((c, k) => (k >= 100 ? { ...c, truth: 1 - ds.y[c.row] } : c));
  const r = await live(ds, flip), blind = await live(ds, flip, { audit: false });
  const down = r.events.find((e) => e.kind === 'stand-down');
  assert.ok(down && down.at >= 199 && down.at < 400, 'it stood down within its next windows');
  assert.equal(r.events.filter((e) => e.kind === 'return').length, 0, 'every regrowth on the reversed truth failed the gate');
  assert.deepEqual(r.final.down, ['alpha']);
  assert.ok(r.wrong < blind.wrong / 2, 'it stopped answering wrong');
  assert.equal(r.acts.answer + r.acts.abstain, flip.length);
});

test('a world that moves later: the audit catches it at one of its checks — every 50 answers after the first full window', async () => {
  const ds = world(1, { later: 60, from: 850 }), r = await live(ds);
  const down = r.events.find((e) => e.kind === 'stand-down');
  assert.ok(down && down.at > 250, 'after the world moved (case 250)');
  assert.equal((down.at - 199) % A.AUDIT.every, 0, 'on a check');
  assert.equal(r.events.filter((e) => e.kind === 'return').length, 0, 'too few cases left to regrow from');
});

/* ─── 10b: the audit at three scales; claims follow what actually happens ─── */

test('10b: the checks — a short window that stands a collapse down, two long ones that lower an over-claim', () => {
  assert.deepEqual(A.CHECKS, [{ window: 50, every: 10, act: 'stand-down' }, { window: 400, every: 50, act: 'claim' }, { window: 1600, every: 100, act: 'claim' }]);
  const t = A.tracker(5);
  for (const x of [1, 1, 0, 0, 1, 0]) t.push(x);
  assert.deepEqual([t.n(), t.right(), t.last(2), t.last(3), t.last(9)], [5, 2, 1, 1, 2]);
});

test('10b: a claim that cites an audit is licensed only if the audit shows the organ falling short', () => {
  const st = { live: { alpha: { organism: 'o', claim: 0.8 } }, down: new Set() };
  assert.deepEqual(A.licensed({ kind: 'claim', domain: 'alpha', accuracy: 0.6, audit: { n: 400, right: 240, delta: 0.0005 } }, st), { ok: true });
  assert.deepEqual(A.licensed({ kind: 'claim', domain: 'alpha', accuracy: 0.75, audit: { n: 400, right: 300, delta: 0.0005 } }, st), { ok: false, why: 'the audit it cites does not show it falling short' });
  const dq = Math.exp(-0.25);   // slack(2, dq) is exactly 0.25: 1 of 2 against 0.75 is exactly on the bound — within chance
  assert.deepEqual(A.licensed({ kind: 'claim', domain: 'alpha', accuracy: 0.5, audit: { n: 2, right: 1, delta: dq } }, { live: { alpha: { organism: 'o', claim: 0.75 } }, down: new Set() }), { ok: false, why: 'the audit it cites does not show it falling short' });
  assert.deepEqual(A.licensed({ kind: 'claim', domain: 'alpha', accuracy: 0.9, audit: { n: 400, right: 0, delta: 0.0005 } }, st), { ok: false, why: 'the claim is more than the organ measured (0.8)' }, 'and never higher than before');
});

test('10b: no drift — nothing stands down, no claim moves', async () => {
  const r = await live(world(1), STREAM, { checks: A.CHECKS });
  assert.deepEqual(r.events, []);
  assert.equal(r.acts.claim, 1);
});

test('10b: a collapse is caught by the short window, on one of its checks, within a few dozen answers', async () => {
  const ds = world(1), flip = STREAM.map((c, k) => (k >= 100 ? { ...c, truth: 1 - ds.y[c.row] } : c));
  const r = await live(ds, flip, { checks: A.CHECKS }), old = await live(ds, flip);
  const down = r.events.find((e) => e.kind === 'stand-down');
  assert.ok(down && down.window === 50 && down.at > 100 && down.at - 100 <= 60, 'caught within 60 cases: ' + (down && down.at));
  assert.equal((down.at + 1) % 10, 0, 'on a check of the short window');
  assert.ok(r.wrong < old.wrong, 'sooner than organ 10’s single window, so fewer wrong');
});

test('10b: an organ quietly delivering less than it claims lowers its claim to what it delivered — and keeps answering', async () => {
  const ds = world(1, { later: 70, from: 600 }), r = await live(ds, STREAM, { checks: A.CHECKS });
  assert.equal(r.events.filter((e) => e.kind === 'stand-down').length, 0, 'not a collapse');
  const re = r.events.find((e) => e.kind === 'reclaim');
  assert.ok(re && re.window === 400 && re.at === 399, 'the long window, the moment it fills');
  const answers = r.ledger.filter((e) => e.act.kind === 'answer' && e.act.at <= 399);
  assert.equal(re.to, Math.round((answers.filter((e) => e.act.label === ds.y[STREAM[e.act.at].row]).length / 400) * 1e6) / 1e6, 'the claim is now exactly what it delivered');
  assert.ok(re.to < re.from);
  const claims = r.ledger.filter((e) => e.act.kind === 'claim');
  assert.equal(claims[claims.length - 1].act.accuracy, r.final.live.alpha, 'the claim in force is the last one written');
  assert.ok(claims[claims.length - 1].act.audit, 'and it cites the audit that lowered it');
  assert.equal(r.answered, STREAM.length, 'it never stopped answering');
  assert.deepEqual(A.verifyChain(r.ledger), { ok: true, n: r.ledger.length });
});

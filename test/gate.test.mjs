import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/gate.mjs';
import { seal, open } from '../src/genome.mjs';
import { germinate } from '../src/germinate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng, macFor } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';

const run = JSON.parse(readFileSync(new URL('../data/seed-library-run.json', import.meta.url), 'utf8'));
const SEEDS = run.library.seeds.map((s) => s.seed);
const CSV = readFileSync(new URL('../data/online_shoppers_intention.csv', import.meta.url), 'utf8');
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const MAKER = await key('origin'), PEER = await key('peer'), STRANGER = await key('stranger');
const ORIGIN = await seal({ name: 'origin', organs: SEEDS }, MAKER);
const REF = { name: 'reference', data: DATA };
const ORG = (await germinate(ORIGIN.text, REF)).organism;
const ME = ORG.id;
const ctxOf = (last = {}) => ({ me: ME, senders: { [PEER.pub]: ['lesson', 'antibody'], [STRANGER.pub]: ['antibody'] }, last: (p) => last[p] || 0 });
const LESSON = SEEDS[0];

test('a message is written one way and opens only for the organism it names, from a trusted sender, in order', async () => {
  const e = await G.envelope({ kind: 'lesson', to: ME, n: 1, body: LESSON }, PEER);
  assert.equal(e.ok, true, e.why);
  const lines = e.text.split('\n');
  assert.deepEqual(lines.slice(0, 5), ['◊ msg.v1 lesson', 'from ' + PEER.pub, 'to ' + ME, 'n 1', 'body ' + LESSON]);
  assert.match(lines[5], /^sig [0-9a-f]{128}$/);
  const a = await G.admit(e.text, ctxOf());
  assert.equal(a.admit, true, a.why);
  assert.equal(a.stage, 'admitted');
  assert.deepEqual({ ...a.msg }, { kind: 'lesson', from: PEER.pub, to: ME, n: 1, body: LESSON });
  assert.equal(Object.isFrozen(a.msg), true);
  assert.equal(G.isAdmitted(a.msg), true);
  assert.equal(G.isAdmitted({ ...a.msg }), false, 'a copy is not something the gate admitted');
  assert.equal(G.isAdmitted(null), false);
  assert.equal(G.isAdmitted('x'), false);
  // the next one must be exactly n 2
  const e2 = await G.envelope({ kind: 'antibody', to: ME, n: 2, body: '0123456789abcdef forged-signature' }, PEER);
  assert.equal((await G.admit(e2.text, ctxOf({ [PEER.pub]: 1 }))).admit, true);
});

test('every stage refuses in order: size, magic, shape, sender, signature, counter, canonical', async () => {
  const e = (await G.envelope({ kind: 'lesson', to: ME, n: 3, body: LESSON }, PEER)).text;
  const at = async (t, ctx = ctxOf({ [PEER.pub]: 2 })) => { const r = await G.admit(t, ctx); assert.equal(r.admit, false); return [r.stage, r.why]; };
  assert.deepEqual(await at(e.padEnd(1025, 'x')), ['size', 'not a message of at most 1024 bytes']);
  assert.deepEqual(await at('x'.repeat(1024)), ['magic', 'not a living-seed message'], 'exactly the limit is not too large');
  assert.deepEqual(await at(7), ['size', 'not a message of at most 1024 bytes']);
  assert.deepEqual(await at(e.replace('◊ msg.v1 lesson', '◊ msg.v2 lesson')), ['magic', 'not a living-seed message']);
  assert.deepEqual(await at(e.replace('◊ msg.v1 lesson', '◊ msg.v1 genome')), ['magic', 'not a living-seed message']);
  assert.deepEqual(await at(e + '\nextra'), ['shape', 'a message is six lines']);
  assert.deepEqual(await at(e.split('\n').slice(0, 5).join('\n')), ['shape', 'a message is six lines']);
  assert.deepEqual(await at(e.replace('\nn 3', '\nn 03')), ['shape', 'a line is not in the form a lesson takes']);
  assert.deepEqual(await at(e.replace('\nn 3', '\nN 3')), ['shape', 'a line is not in the form a lesson takes']);
  assert.deepEqual(await at(e.replace('body ◊ seed.v1 shopper', 'body ◊ seed.v1 Shopper')), ['shape', 'a line is not in the form a lesson takes']);
  assert.deepEqual(await at(e.replace(/\nsig [0-9a-f]+$/, '\nsig xyz')), ['shape', 'a line is not in the form a lesson takes']);
  assert.deepEqual(await at(e.replace('from ' + PEER.pub, 'from ' + PEER.pub.toUpperCase())), ['shape', 'a line is not in the form a lesson takes']);
  assert.deepEqual(await at(e.replace('to ' + ME, 'to ' + 'f'.repeat(16))), ['shape', 'the message is for another organism']);
  assert.deepEqual(await at(e, { ...ctxOf(), senders: {} }), ['sender', 'no trusted sender with that key']);
  assert.deepEqual(await at(e, { ...ctxOf(), senders: { [PEER.pub]: ['antibody'] } }), ['sender', 'this sender may not send a lesson']);
  assert.deepEqual(await at(e, { ...ctxOf(), senders: Object.create({ [PEER.pub]: ['lesson'] }) }), ['sender', 'no trusted sender with that key'], 'only senders the table itself holds');
  const forged = e.replace(/sig ([0-9a-f])/, (m, c) => 'sig ' + (c === 'a' ? 'b' : 'a'));
  assert.deepEqual(await at(forged), ['signature', 'the signature does not verify']);
  const swapped = e.replace('from ' + PEER.pub, 'from ' + STRANGER.pub);
  assert.deepEqual(await at(swapped, { ...ctxOf(), senders: { [STRANGER.pub]: ['lesson'] } }), ['signature', 'the signature does not verify'], 'another key cannot claim it');
  assert.deepEqual(await at(e, ctxOf({ [PEER.pub]: 3 })), ['counter', 'a replay: counter 3 is not after 3']);
  assert.deepEqual(await at(e, ctxOf({ [PEER.pub]: 9 })), ['counter', 'a replay: counter 3 is not after 9']);
  assert.deepEqual(await at(e, ctxOf({ [PEER.pub]: 1 })), ['counter', 'out of order: expected 2, got 3']);
  assert.deepEqual(await at(e, { ...ctxOf(), last: () => -1 }), ['error', 'no counter for that sender']);
  assert.deepEqual(await at(e, { ...ctxOf(), last: () => 1.5 }), ['error', 'no counter for that sender']);
  assert.deepEqual(await at(e, null), ['error', 'the gate failed closed']);
});

test('one form only: a message that verifies but is not written the one way is refused', async () => {
  // a signer who signs a non-canonical text (CRLF line ends) gets past the signature, not past the gate
  const fields = ['◊ msg.v1 antibody', 'from ' + PEER.pub, 'to ' + ME, 'n 1', 'body 0123456789abcdef replay'];
  const { sign } = await import('../vendor/keys/keys.mjs');
  const crlf = fields.join('\r\n');
  const t = crlf + '\nsig ' + (await sign(PEER, utf8(crlf)));
  const r = await G.admit(t, ctxOf());
  assert.equal(r.admit, false);
  assert.ok(['magic', 'shape'].includes(r.stage), r.stage + ': ' + r.why);
});

test('every one-character change to an admitted message is refused — none admitted, none thrown', async () => {
  const e = (await G.envelope({ kind: 'antibody', to: ME, n: 1, body: '0123456789abcdef forged-signature' }, PEER)).text;
  let admitted = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i], t = e.slice(0, i) + (c === 'a' ? 'b' : c === '\n' ? ' ' : c === '0' ? '1' : 'a') + e.slice(i + 1);
    if ((await G.admit(t, ctxOf())).admit) admitted++;
  }
  assert.equal(admitted, 0);
  // and random damage: truncations, insertions, swaps
  const r = rng(5);
  for (let k = 0; k < 300; k++) {
    const i = Math.floor(r() * e.length), op = Math.floor(r() * 3);
    const t = op === 0 ? e.slice(0, i) : op === 1 ? e.slice(0, i) + String.fromCharCode(32 + Math.floor(r() * 90)) + e.slice(i) : e.slice(0, i) + e.slice(i + 1);
    const a = await G.admit(t, ctxOf());
    assert.equal(a.admit, false, t);
  }
});

test('envelope refuses what it cannot write', async () => {
  const w = (f, k = PEER) => G.envelope(f, k).then((r) => r.why);
  assert.equal(await w({ kind: 'genome', to: ME, n: 1, body: LESSON }), 'a message is a lesson or an antibody');
  assert.equal(await w({ kind: 'lesson', to: 'x', n: 1, body: LESSON }), 'a message names the organism it is for');
  for (const n of [0, -1, 1.5, '1', 2 ** 53]) assert.equal(await w({ kind: 'lesson', to: ME, n, body: LESSON }), 'a message carries a counter from 1', String(n));
  assert.equal(await w({ kind: 'lesson', to: ME, n: 1, body: 'nonsense' }), 'the body is not a lesson');
  assert.equal(await w({ kind: 'antibody', to: ME, n: 1, body: LESSON }), 'the body is not a antibody');
  assert.equal(await w(null), 'a message is a lesson or an antibody');
  assert.equal(await w({ kind: 'lesson', to: ME, n: 1, body: LESSON }, null), 'the message could not be sealed');
});

test('the knowledge gate: a lesson is grown here and adopted only if it clears the bar and beats what it replaces', async () => {
  const admitOne = async (body, n = 1) => (await G.admit((await G.envelope({ kind: 'lesson', to: ME, n, body }, PEER)).text, ctxOf({ [PEER.pub]: n - 1 }))).msg;
  // the same recipe the organism already grows: it clears the bar but does not BEAT itself
  const same = G.weigh(await admitOne(SEEDS[1]), ORG, REF);
  assert.deepEqual([same.adopt, same.why], [false, 'AUC 0.952127 does not beat the triage organ it would replace (0.952127)']);
  // a different recipe for the shop, grown here
  const other = '◊ seed.v1 shopper 7 f:1e785a2176032512f516 3ad3c7c0c75d';
  const w = G.weigh(await admitOne(other), ORG, REF);
  assert.equal(w.adopt, false);
  assert.match(w.why, /^AUC 0\.\d+ does not beat the shopper organ it would replace \(0\.815265\)$/);
  // a domain the organism has no live organ for only needs to clear the bar
  const { shopper, ...rest } = DATA;
  const lacking = (await germinate((await seal({ name: 'lacking', organs: SEEDS.slice(1) }, MAKER)).text, { name: 'x', data: DATA })).organism;
  const take = G.weigh(await admitOne(SEEDS[0]), lacking, REF);
  assert.deepEqual([take.adopt, take.organ.domain, take.organ.heldAuc, take.organ.from, take.organ.n], [true, 'shopper', 0.815265, PEER.pub, 1]);
  // a lesson tested on a device with no data for it, or with no signal in it
  assert.deepEqual(G.weigh(await admitOne(SEEDS[0]), lacking, { name: 'x', data: rest }), { adopt: false, why: 'this device holds no shopper data to test it on' });
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const noise = G.weigh(await admitOne(SEEDS[0]), lacking, { name: 'x', data: { ...DATA, shopper: { ...DATA.shopper, y } } });
  assert.deepEqual([noise.adopt, noise.heldAuc], [false, 0.513084]);
  assert.equal(noise.why, 'AUC 0.513084 on this device’s unseen cases is under the gate (0.6)');
  // only an admitted lesson is weighed — a look-alike object is not
  assert.deepEqual(G.weigh({ kind: 'lesson', body: SEEDS[0] }, ORG, REF), { adopt: false, why: 'only an admitted lesson is weighed' });
  const ab = (await G.admit((await G.envelope({ kind: 'antibody', to: ME, n: 1, body: '0123456789abcdef x' }, PEER)).text, ctxOf())).msg;
  assert.deepEqual(G.weigh(ab, ORG, REF), { adopt: false, why: 'only an admitted lesson is weighed' });
  assert.deepEqual(G.weigh(await admitOne(SEEDS[0]), null, REF), { adopt: false, why: 'the lesson could not be weighed' });
  assert.deepEqual(G.weigh(await admitOne(SEEDS[0]), lacking, { name: 'x' }), { adopt: false, why: 'this device holds no shopper data to test it on' }, 'a substrate with no data at all');
  // exactly on the organism's bar: adopted (the bar is a floor)
  assert.equal(G.weigh(await admitOne(SEEDS[0]), { gate: { auc: 0.815265 }, organs: [] }, REF).adopt, true);
  assert.equal(G.weigh(await admitOne(SEEDS[0]), { gate: { auc: 0.815266 }, organs: [] }, REF).adopt, false);
  // a lesson in the right form whose check code is wrong: admitted as a message, refused as knowledge
  const forgedSeed = SEEDS[0].slice(0, -12) + '000000000000';
  assert.deepEqual(G.weigh(await admitOne(forgedSeed), lacking, REF), { adopt: false, why: 'the lesson is not a seed the ribosome reads' });
  // a seed the ribosome reads but would write differently (a seed number past 2^32 wraps): not the one form, refused
  const wide = '◊ seed.v1 shopper 9999999999 f:7fdfe22dde6663ead42d ' + macFor('shopper ' + (9999999999 >>> 0) + ' f:7fdfe22dde6663ead42d');
  assert.equal((await import('../vendor/seed-library/seedlib.mjs')).decodeSeed(wide).ok, true, 'it decodes');
  assert.deepEqual(G.weigh(await admitOne(wide), lacking, REF), { adopt: false, why: 'the lesson is not a seed the ribosome reads' });
});

test('the replication gate: only a proven organ is passed on, at a bar no lower, from the genome it grew from', async () => {
  const child = await G.replicate(ORIGIN.text, ORG, { name: 'child', organs: ['shopper', 'triage'], gate: { auc: 0.7 } }, PEER);
  assert.equal(child.ok, true, child.why);
  const o = await open(child.text);
  assert.deepEqual([o.ok, o.fields.parents, o.fields.organs, o.fields.gate.auc, o.fields.by], [true, [ORIGIN.id], [SEEDS[0], SEEDS[1]], 0.7, PEER.pub]);
  const why = async (...a) => (await G.replicate(...a)).why;
  // cut and dormant organs are not passed on
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const noisy = (await germinate(ORIGIN.text, { name: 'noisy', data: { ...DATA, shopper: { ...DATA.shopper, y } } })).organism;
  assert.equal(await why(ORIGIN.text, noisy, { name: 'c', organs: ['shopper'], gate: { auc: 0.6 } }, PEER), 'the shopper organ is cut on this device, and only a proven organ is passed on');
  assert.equal((await G.replicate(ORIGIN.text, noisy, { name: 'c', organs: ['triage'], gate: { auc: 0.6 } }, PEER)).ok, true, 'its proven organs still pass on');
  const { water, ...rest } = DATA;
  const dry = (await germinate(ORIGIN.text, { name: 'dry', data: rest })).organism;
  assert.equal(await why(ORIGIN.text, dry, { name: 'c', organs: ['water'], gate: { auc: 0.6 } }, PEER), 'the water organ is dormant on this device, and only a proven organ is passed on');
  // the bar, the lineage, the parent, the maker
  assert.equal(await why(ORIGIN.text, ORG, { name: 'c', organs: ['triage'], gate: { auc: 0.59 } }, PEER), 'a child’s bar may not be lower than its parent’s (0.6)');
  assert.equal((await G.replicate(ORIGIN.text, ORG, { name: 'c', organs: ['triage'], gate: { auc: 0.6 } }, PEER)).ok, true, 'equal to the parent’s bar is allowed');
  assert.equal(await why(ORIGIN.text, ORG, { name: 'c', organs: ['triage'] }, PEER), 'a child’s bar may not be lower than its parent’s (0.6)');
  assert.equal(await why(ORIGIN.text, ORG, { name: 'c', organs: ['weather'], gate: { auc: 0.7 } }, PEER), 'the parent has no weather organ to pass on');
  assert.equal(await why(ORIGIN.text, ORG, { name: 'c', organs: [], gate: { auc: 0.7 } }, PEER), 'a child carries at least one organ');
  assert.equal(await why(ORIGIN.text, { ...ORG, genome: '0'.repeat(16) }, { name: 'c', organs: ['triage'], gate: { auc: 0.7 } }, PEER), 'the organism was not grown from this genome');
  assert.equal(await why(ORIGIN.text, null, { name: 'c', organs: ['triage'], gate: { auc: 0.7 } }, PEER), 'the organism was not grown from this genome');
  assert.equal(await why(ORIGIN.text.replace('gate auc=0.6', 'gate auc=0.5'), ORG, { name: 'c', organs: ['triage'], gate: { auc: 0.5 } }, PEER), 'the parent genome was refused: signature');
  assert.equal(await why(ORIGIN.text, ORG, { name: 'c', organs: ['triage'], gate: { auc: 0.7 } }, PEER, { trust: [STRANGER.pub] }), 'the parent genome was refused: untrusted maker');
  assert.equal(await why(ORIGIN.text, ORG, { name: 'c', organs: ['triage'], gate: { auc: 0.7 } }, STRANGER, { makers: [PEER.pub] }), 'this maker may not seal children');
  assert.equal((await G.replicate(ORIGIN.text, ORG, { name: 'c', organs: ['triage'], gate: { auc: 0.7 } }, PEER, { makers: [PEER.pub], trust: [MAKER.pub] })).ok, true);
  assert.equal(await why(ORIGIN.text, ORG, { name: 'Bad Name', organs: ['triage'], gate: { auc: 0.7 } }, PEER), 'the name is lower-case letters, digits and hyphens, at most 32', 'the genome’s own rules still hold');
  assert.equal(await why(ORIGIN.text, ORG, null, PEER), 'a child carries at least one organ');
});

test('the immune memory: a refused input is known again on sight, by its fingerprint', () => {
  const im = G.immune();
  assert.equal(im.seen('x'), null);
  assert.equal(im.add('x', 'replay'), G.fingerprintOf('x'));
  assert.equal(im.seen('x'), 'replay');
  assert.equal(im.seen('x '), null, 'one byte different is a different input');
  assert.equal(im.size(), 1);
  const d1 = im.digest();
  im.add('y', 'forged-signature');
  assert.notEqual(im.digest(), d1);
  const other = G.immune(); other.add('y', 'forged-signature'); other.add('x', 'replay');
  assert.equal(other.digest(), im.digest(), 'the same memories in any order: the same digest');
  assert.match(G.fingerprintOf('x'), /^[0-9a-f]{16}$/);
});

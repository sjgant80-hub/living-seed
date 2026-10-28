import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEEPER, planOf, answerOf, checksFor, grow, roundTrip, fingerprint } from '../src/system.mjs';
import { seal } from '../src/genome.mjs';
import { germinate, caseOf } from '../src/germinate.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';
import { digestOf, createNode } from '../vendor/fall-kit-core/node.mjs';
import { hex } from '../vendor/fall-kit-core/identity.mjs';
import { sha256 } from '../vendor/fall-kit-core/vendor/light/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const SEEDS = JSON.parse(readFileSync(new URL('data/seed-library-run.json', ROOT), 'utf8')).library.seeds;
const seedOf = (d) => SEEDS.find((s) => s.domain === d).seed;
const MAKER = await fromSeed(sha256Bytes(utf8('living-seed/maker/system-test')));
const TRIAGE = loadDomain('triage');
const POLICY = { makerPpm: 100000, lineagePpm: 0, earlyUntil: 40, earlyNum: 3, earlyDen: 2 };
const PHRASE = 'a public test phrase for the system tests only';
const clock = () => new Date('2026-10-28T12:00:00Z');
const hashOf = (core) => hex(sha256(new TextEncoder().encode(JSON.stringify(core))));
const TOY = { id: 'toy0000000000000', organs: [
  { domain: 'd', state: 'live', body: { rules: [{ feat: 'a', op: '>', v: 1, w: 0.7 }, { feat: 'b', op: '<=', v: 5, w: 0.2 }], threshold: 0.5 } },
  { domain: 'e', state: 'cut', why: 'below the gate' }, { domain: 'f', state: 'dormant', why: 'no data' }, { domain: 'g', state: 'live', body: { rules: [], threshold: 0 } }, null, { state: 'live' }] };

test('the keeper', () => { assert.equal(KEEPER, 'keeper'); });

test('planOf: the live organs become nodes; cut and dormant ones grow none', () => {
  assert.deepEqual(planOf(TOY), { ok: true, live: ['d', 'g'], cut: ['e'], dormant: ['f'] });
  for (const x of [null, 5, {}, { organs: 'x' }, []]) assert.deepEqual(planOf(x), { ok: false, why: 'not an organism' });
  assert.deepEqual(planOf({ organs: [] }), { ok: true, live: [], cut: [], dormant: [] });
});

test('answerOf: a live organ\'s answer with a receipt of the organism, the organ, the case\'s digest and the verdict', () => {
  const x = { a: 2, b: 9 };
  const a = answerOf(TOY, 'd', x);
  const core = { organism: 'toy0000000000000', organ: 'd', case: digestOf(x), label: 1, score: 0.7, threshold: 0.5, fired: 1 };
  assert.deepEqual(a, { verdict: 'VERIFIED', label: 1, receipt: { ...core, receiptHash: hashOf(core) } });
  assert.equal(answerOf(TOY, 'd', { a: 0, b: 1 }).label, 0);
  assert.equal(answerOf(TOY, 'd', { a: 0, b: 1 }).receipt.fired, 1);
  const CLEAN = { ...TOY, organs: TOY.organs.slice(0, 4) };
  for (const [d, x2, why] of [['e', x, 'its e organ is cut: below the gate'], ['f', x, 'its f organ is dormant: no data'], ['z', x, 'it has no organ for z'], ['d', { a: 2 }, 'the case lacks a measurement its rules read']]) assert.deepEqual(answerOf(CLEAN, d, x2), { verdict: 'ABSTAIN', why });
  assert.deepEqual(answerOf(TOY, 'z', x), { verdict: 'ABSTAIN', why: 'the case could not be read' });
  assert.equal(answerOf(null, 'd', x).verdict, 'ABSTAIN');
  const circ = { a: 2, b: 9 }; circ.self = circ;
  for (const bad of [circ, { a: 2, b: 9, n: 10n }]) assert.deepEqual(answerOf(TOY, 'd', bad), { verdict: 'ABSTAIN', why: 'the case could not be read' });
});

test('checksFor: the keeper re-runs the organ on the case it asked and must get the same receipt', () => {
  const x = { a: 2, b: 9 }, y = { a: 0, b: 1 };
  const check = checksFor(TOY, [x, y, null, 5]);
  assert.equal(check(answerOf(TOY, 'd', x)), true);
  assert.equal(check(answerOf(TOY, 'd', y)), true);
  assert.equal(check(answerOf(TOY, 'd', { a: 3, b: 9 })), false, 'a case the keeper never asked');
  const a = answerOf(TOY, 'd', x);
  assert.equal(check({ ...a, label: 0 }), false);
  assert.equal(check({ ...a, receipt: { ...a.receipt, receiptHash: 'f'.repeat(64) } }), false);
  const reseal = (patch) => { const { receiptHash, ...core } = { ...a.receipt, ...patch }; return { ...a, receipt: { ...core, receiptHash: hashOf(core) } }; };
  assert.equal(check(reseal({ score: 0.9 })), false, 'a receipt the organ would not give');
  assert.equal(check(reseal({ organism: 'other00000000000' })), false);
  assert.equal(check(reseal({ organ: 'e' })), false);
  for (const z of [null, 5, {}, { receipt: 5 }]) assert.equal(check(z), false);
  const circ = { a: 2, b: 9 }; circ.self = circ;
  const mixed = checksFor(TOY, [circ, { a: 2, n: 1n }, y]);
  assert.equal(mixed(answerOf(TOY, 'd', y)), true, 'a case with no digest is passed over; the rest are still checked');
  assert.equal(mixed(answerOf(TOY, 'd', x)), false);
  assert.equal(checksFor(null, [x])(a), false);
  assert.equal(checksFor(TOY, 'x')(a), false);
  const other = { ...TOY, id: 'other00000000000' };
  assert.equal(checksFor(other, [x])(a), false);
});

test('grow: one genome, one device\'s data and a phrase grow the organism and the system it lives in', async () => {
  const genome = await seal({ name: 'system-test', parents: [], gate: { auc: 0.6 }, organs: [seedOf('triage'), seedOf('water')] }, MAKER);
  const cases = [0, 7, 19].map((i) => caseOf(TRIAGE, i));
  const s = await grow(genome.text, { name: 'device', data: { triage: TRIAGE } }, PHRASE, { policy: POLICY, clock, cases: { triage: cases } });
  assert.equal(s.ok, true, s.why);
  assert.deepEqual(s.plan, { ok: true, live: ['triage'], cut: [], dormant: ['water'] });
  assert.equal(s.organism.id, (await germinate(genome.text, { name: 'device', data: { triage: TRIAGE } })).organism.id);
  assert.deepEqual(Object.keys(s.nodes), ['keeper', 'triage']);
  assert.deepEqual(s.nodes.keeper.pinned(), [s.nodes.triage.id]);
  assert.deepEqual(s.nodes.triage.pinned(), [s.nodes.keeper.id]);
  assert.equal(s.roster.founder, s.planted.ids.founder.id);
  assert.deepEqual(s.nodes.triage.card().skills, ['triage']);
  assert.deepEqual(s.nodes.keeper.card().skills, []);
  // the keeper asks; the organ answers; the keeper checks it by running the organ again, and records the work
  for (const x of cases) {
    const q = await s.nodes.keeper.ask('triage', x);
    assert.equal(q.ok, true, q.why);
    const r = await s.nodes.triage.hear(q.bytes);
    const back = await s.nodes.keeper.hear(r.replies[0].bytes);
    assert.equal(back.outcome, 'verified');
    assert.deepEqual(back.answer, answerOf(s.organism, 'triage', x));
  }
  assert.equal(s.nodes.keeper.ledger().log.filter((e) => e.entry.type === 'value').length, 3);
  const unasked = await s.nodes.keeper.ask('triage', caseOf(TRIAGE, 3));
  const r2 = await s.nodes.triage.hear(unasked.bytes);
  assert.equal((await s.nodes.keeper.hear(r2.replies[0].bytes)).outcome, 'failed', 'a case the keeper did not plan to ask is not checkable');
  assert.equal((await s.nodes.keeper.ask('water', {})).ok, false, 'a dormant organ grew no node to ask');
  const again = await grow(genome.text, { name: 'device', data: { triage: TRIAGE } }, PHRASE, { policy: POLICY, clock });
  assert.deepEqual(again.roster, s.roster, 'the same seed, data and phrase grow the same system');
});

test('grow: a refused genome, a short phrase, or no substrate grows nothing', async () => {
  const genome = await seal({ name: 'system-test', parents: [], gate: { auc: 0.6 }, organs: [seedOf('triage')] }, MAKER);
  const flipped = genome.text.replace('system-test', 'system-tesu');
  assert.match((await grow(flipped, { name: 'device', data: { triage: TRIAGE } }, PHRASE, { policy: POLICY })).why, /^the genome was refused: /);
  assert.deepEqual(await grow(genome.text, { name: 'device', data: { triage: TRIAGE } }, 'short', { policy: POLICY }), { ok: false, why: 'a seed phrase is at least 16 characters, not counting the spaces at its ends' });
  assert.deepEqual(await grow(genome.text, null, PHRASE, { policy: POLICY }), { ok: false, why: 'no substrate to grow on' });
  assert.match((await grow(genome.text, { name: 'device', data: {} }, PHRASE, { policy: { junk: 1 } })).why, /genesis/);
  const bare = await grow(genome.text, { name: 'device', data: {} }, PHRASE, null);
  assert.equal(bare.ok, false);
});

test('roundTrip and fingerprint: one ask as it crosses a wire, and the system as one digest', async () => {
  const genome = await seal({ name: 'system-test', parents: [], gate: { auc: 0.6 }, organs: [seedOf('triage'), seedOf('water')] }, MAKER);
  const sub = { name: 'device', data: { triage: TRIAGE } };
  const cases = [0, 7, 19].map((i) => caseOf(TRIAGE, i));
  const s = await grow(genome.text, sub, PHRASE, { policy: POLICY, clock, cases: { triage: cases } });
  const t = await roundTrip(s, 'triage', cases[0]);
  assert.deepEqual(t, { outcome: 'verified', answer: answerOf(s.organism, 'triage', cases[0]) });
  assert.equal((await roundTrip(s, 'water', {})).outcome, 'unasked');
  assert.equal((await roundTrip(s, 'triage', cases[1], s.nodes.keeper)).outcome, 'unanswered', 'the keeper holds no organ: it does not answer');
  // a node with the organ's own key that lies from the start (taken over): the label flipped, the receipt sealed again so
  // it holds. The door lets it in; the keeper's check catches it. Joining late, with the key but not the node's count of
  // what it has sent, it is refused at the door as a replay.
  const sL = await grow(genome.text, sub, PHRASE, { policy: POLICY, clock, cases: { triage: cases } });
  const liar = await createNode({ name: 'triage', identity: sL.planted.ids.triage, genesis: sL.planted.genesis, clock, skills: { triage: async (x) => { const a = answerOf(sL.organism, 'triage', x); const { receiptHash, ...core } = { ...a.receipt, label: 1 - a.label }; return { ...a, label: 1 - a.label, receipt: { ...core, receiptHash: hashOf(core) } }; } } });
  await liar.pin(sL.nodes.keeper.card());
  const lie = await roundTrip(sL, 'triage', cases[1], liar);
  assert.equal(lie.outcome, 'failed');
  assert.equal(lie.answer.label, 1 - answerOf(sL.organism, 'triage', cases[1]).label);
  const late = await createNode({ name: 'triage', identity: s.planted.ids.triage, genesis: s.planted.genesis, clock, skills: { triage: async (x) => answerOf(s.organism, 'triage', x) } });
  await late.pin(s.nodes.keeper.card());
  assert.equal((await roundTrip(s, 'triage', cases[1], late)).outcome, 'refused');
  // the same genome, data and phrase grow the same fingerprint; another phrase grows other keys, so another roster
  const f = await fingerprint(s, { triage: cases.slice(0, 2), water: [{}] });
  const s2 = await grow(genome.text, sub, PHRASE, { policy: POLICY, clock, cases: { triage: cases } });
  const f2 = await fingerprint(s2, { water: [{}], triage: cases.slice(0, 2) });
  assert.deepEqual(f2, f);
  assert.equal(f.asked, 3);
  assert.equal(f.verified, 2);
  assert.equal(f.organism, s.organism.id);
  assert.equal(f.roster, digestOf(s.roster));
  assert.equal(f.answers, digestOf([{ organ: 'triage', outcome: 'verified', receipt: answerOf(s.organism, 'triage', cases[0]).receipt.receiptHash }, { organ: 'triage', outcome: 'verified', receipt: answerOf(s.organism, 'triage', cases[1]).receipt.receiptHash }, { organ: 'water', outcome: 'unasked', receipt: null }]));
  assert.equal(f.digest, digestOf({ organism: f.organism, roster: f.roster, answers: f.answers }));
  const s3 = await grow(genome.text, sub, PHRASE + ' and another', { policy: POLICY, clock, cases: { triage: cases } });
  const f3 = await fingerprint(s3, { triage: cases.slice(0, 2), water: [{}] });
  assert.equal(f3.organism, f.organism);
  assert.notEqual(f3.roster, f.roster);
  assert.notEqual(f3.digest, f.digest);
  assert.equal(f3.answers, f.answers, 'the receipts name the organism, not the keys');
});

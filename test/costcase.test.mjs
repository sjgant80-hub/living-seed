// the For-your-business cost case: every external figure from the sourced basis, every measured one from this repository's
// receipts, the reader's own inputs, like for like, floors not top ends, and never a throw
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULTS, BASIS_KEYS, sourcesOf, measured, over, seedCase } from '../src/costcase.mjs';

const raw = (p) => readFileSync(new URL('../' + p, import.meta.url));
const J = (p) => JSON.parse(raw(p).toString('utf8'));
const BASIS = J('vendor/sovereign-enterprise/data/basis.json');
const ANSWERS = J('data/organ-2b/llm-answers.json'), REC2 = J('data/organ-2/record.json'), REC1 = J('data/record.json');
const M = measured(ANSWERS, REC2, REC1);
const base = (patch) => ({ ...BASIS, ...patch });
const r2 = (x) => Math.round(x * 100) / 100;

test('the basis is sovereign-enterprise’s, byte for byte (data/basis.json at 003e447)', () => {
  assert.equal(createHash('sha256').update(raw('vendor/sovereign-enterprise/data/basis.json')).digest('hex'), '83e9c2effa2f81596dcfa7110f030940032c1910cdf928d27d628ae59d73bb42');
  for (const k of BASIS_KEYS) assert.match(BASIS[k].source || '', /^https:\/\//, k + ' carries its source');
});

test('measured · read from the receipts: organ 2b’s 1,200 calls, organ 2’s timing, organ 1’s genome', () => {
  assert.equal(M.ok, true);
  assert.equal(M.calls, ANSWERS.calls.length);
  const t = ANSWERS.calls.map((c) => c.promptTokens).sort((a, b) => a - b);
  assert.equal(t.length % 2, 0);
  assert.equal(M.tokensIn, (t[t.length / 2 - 1] + t[t.length / 2]) / 2);
  assert.equal(M.tokensIn, 2450);
  assert.equal(M.tokensOut, Math.max(...ANSWERS.calls.map((c) => c.reply.length)));
  assert.equal(M.tokensOut, 2);
  assert.equal(M.answerUs, REC2.contest.organ.timing.perAnswerUs);
  assert.equal(M.box, REC2.contest.organ.timing.box);
  assert.equal(M.genomeBytes, REC1.genome.bytes);
});

test('measured · the median of an odd count is the middle one, of an even count the mean of the two middle ones', () => {
  const calls = (ts) => ({ calls: ts.map((t) => ({ promptTokens: t, reply: '5' })) });
  assert.equal(measured(calls([5, 1, 9]), REC2, REC1).tokensIn, 5);
  assert.equal(measured(calls([4, 1, 9, 2]), REC2, REC1).tokensIn, 3);
  assert.equal(measured(calls([7]), REC2, REC1).tokensIn, 7);
  assert.equal(measured(calls([1, 3]), REC2, REC1).tokensIn, 2);
  assert.equal(measured({ calls: [{ promptTokens: 3, reply: 'abc' }, { promptTokens: 3, reply: '' }] }, REC2, REC1).tokensOut, 3);
});

test('measured · refuses receipts it cannot read, with the reason, and never throws', () => {
  const why = (a, r2, r1) => measured(a, r2, r1).why;
  const t = (patch) => ({ contest: { organ: { timing: { ...REC2.contest.organ.timing, ...patch } } } });
  assert.equal(why({ calls: [] }, REC2, REC1), 'organ 2b’s committed calls');
  assert.equal(why({ calls: 'x' }, REC2, REC1), 'organ 2b’s committed calls');
  assert.equal(why({ calls: [{ promptTokens: 0, reply: '1' }] }, REC2, REC1), 'organ 2b’s committed calls');
  assert.equal(why({ calls: [{ promptTokens: 1.5, reply: '1' }] }, REC2, REC1), 'organ 2b’s committed calls');
  assert.equal(why({ calls: [{ promptTokens: 9, reply: 1 }] }, REC2, REC1), 'organ 2b’s committed calls');
  assert.equal(measured({ calls: [{ promptTokens: 1, reply: '' }] }, REC2, REC1).ok, true);
  assert.equal(why(ANSWERS, t({ perAnswerUs: 0 }), REC1), 'organ 2’s timing');
  assert.equal(why(ANSWERS, t({ perAnswerUs: -1 }), REC1), 'organ 2’s timing');
  assert.equal(why(ANSWERS, t({ box: 7 }), REC1), 'organ 2’s timing');
  assert.equal(measured(ANSWERS, t({ perAnswerUs: 0.001 }), REC1).ok, true);
  assert.equal(why(ANSWERS, REC2, { genome: { bytes: 0 } }), 'the genome’s size');
  assert.equal(why(ANSWERS, REC2, { genome: { bytes: 4.5 } }), 'the genome’s size');
  assert.equal(measured(ANSWERS, REC2, { genome: { bytes: 1 } }).ok, true);
  for (const bad of [[null, REC2, REC1], [ANSWERS, null, REC1], [ANSWERS, REC2, null], [undefined, undefined, undefined]]) assert.deepEqual(measured(...bad), { ok: false, why: 'the receipts could not be read' });
});

test('seedCase · the default case: every line from the basis and the receipts, nothing typed', () => {
  const r = seedCase(BASIS, M, {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.inputs, { ...DEFAULTS, tokensIn: 2450, tokensOut: 2 });
  assert.equal(r.records, 40 * 10000 * 12);
  assert.deepEqual(r.lines, { staff: 20456.8, takenOff: 10228.4, frontier: 17805.52, open: 2046.04, sentOff: 0, power: 0 });
  assert.deepEqual(r.perYear, { today: 20456.8, hostedFrontier: 28033.92, hostedOpen: 12274.44, seed: 10228.4 });
  assert.deepEqual(r.over, { today: 63292.54, hostedFrontier: 86735.86, hostedOpen: 37976.64, seed: 31646.27 });
  assert.deepEqual(r.versus, { today: 10228.4, hostedFrontier: 17805.52, hostedOpen: 2046.04 });
  assert.deepEqual(r.versusOver, { today: 31646.27, hostedFrontier: 55089.59, hostedOpen: 6330.37 });
  assert.ok(Math.abs(r.kwh - 4800000 * 1.224e-6 * 15 / 3.6e6) < 1e-15, 'the answers’ energy: measured time × the chip’s base power');
  assert.deepEqual(r.travel, { shippedMB: 40 * 50 * 12, seedBytes: 40 * 496 * 12, shipping: null, recordsLeaving: 4800000 });
});

test('seedCase · like for like: a hosted model takes the same share off; the two differ only in the bill', () => {
  const r = seedCase(BASIS, M, { share: 0.8, sites: 3, recordsPerMonth: 2000, tokensIn: 1000, tokensOut: 50, gbpPer1000: 0.4 });
  const fx = BASIS.fxGbpPerUsd.value, recs = 3 * 2000 * 12;
  assert.equal(r.lines.takenOff, r2(r.lines.staff * 0.8));
  assert.equal(r.lines.frontier, r2(recs * (1000 * BASIS.frontier.inPerM + 50 * BASIS.frontier.outPerM) / 1e6 * fx));
  assert.equal(r.lines.open, r2(recs * (1000 * BASIS.bedrockGptOss120b.inPerM + 50 * BASIS.bedrockGptOss120b.outPerM) / 1e6 * fx));
  assert.equal(r.lines.sentOff, r2(recs / 1000 * 0.4));
  assert.equal(r.perYear.hostedFrontier, r2(r.lines.staff - r.lines.takenOff + r.lines.frontier + r.lines.sentOff));
  assert.equal(r.perYear.hostedOpen, r2(r.lines.staff - r.lines.takenOff + r.lines.open + r.lines.sentOff));
  assert.equal(r.perYear.seed, r2(r.lines.staff - r.lines.takenOff + r.lines.power));
  assert.equal(r.versus.hostedFrontier, r2(r.perYear.hostedFrontier - r.perYear.seed));
  assert.equal(r.versus.hostedOpen, r2(r.perYear.hostedOpen - r.perYear.seed));
  assert.equal(r.versus.today, r2(r.perYear.today - r.perYear.seed));
  assert.equal(r.versusOver.hostedOpen, r2(r.over.hostedOpen - r.over.seed));
});

test('seedCase · the figures move with the basis and the receipts, not with anything typed', () => {
  assert.equal(seedCase(base({ wageMedianHourly: { ...BASIS.wageMedianHourly, value: 30 } }), M, {}).lines.staff, 20 * 52 * 30);
  const fx1 = seedCase(base({ fxGbpPerUsd: { ...BASIS.fxGbpPerUsd, value: 1 } }), M, { tokensIn: 1000, tokensOut: 100, recordsPerMonth: 1000, sites: 1 });
  assert.equal(fx1.lines.frontier, r2(12000 * (1000 * 2 + 100 * 10) / 1e6));
  assert.equal(fx1.lines.open, r2(12000 * (1000 * 0.23 + 100 * 0.93) / 1e6));
  const slow = seedCase(base({ electricityPencePerKwh: { value: 100 }, laptopExtraWatts: { value: 3.6e6 } }), { ...M, answerUs: 1e6 }, { sites: 1, recordsPerMonth: 1 });
  assert.equal(slow.kwh, 12);
  assert.equal(slow.lines.power, 12);
  assert.equal(seedCase(BASIS, { ...M, tokensIn: 10, tokensOut: 1 }, {}).inputs.tokensIn, 10, 'the defaults are the measured ones');
  assert.equal(seedCase(BASIS, M, { tokensIn: 7 }).inputs.tokensIn, 7, 'and the reader’s own win');
  const g = seedCase(BASIS, { ...M, genomeBytes: 1024 ** 3 }, { sites: 1, modelMB: 2048, updatesPerYear: 1, gbpPerGb: 3 });
  assert.deepEqual(g.travel, { shippedMB: 2048, seedBytes: 1024 ** 3, shipping: 3, recordsLeaving: 120000 });
  assert.equal(seedCase(BASIS, M, { gbpPerGb: 0 }).travel.shipping, 0);
});

test('seedCase · boundaries hold at both ends of every input', () => {
  for (const ok of [{ hoursPerWeek: 0 }, { hoursPerWeek: 168 }, { share: 0 }, { share: 1 }, { sites: 1 }, { years: 1 }, { years: 10 }, { recordsPerMonth: 0, tokensIn: 0, tokensOut: 0 },
    { modelMB: 0, updatesPerYear: 0 }, { gbpPerGb: 0, gbpPer1000: 0 }]) assert.equal(seedCase(BASIS, M, ok).ok, true, JSON.stringify(ok));
  assert.equal(seedCase(BASIS, M, { share: 1 }).perYear.seed, seedCase(BASIS, M, { share: 1 }).lines.power);
  assert.equal(seedCase(BASIS, M, { share: 0 }).versus.today, 0);
  assert.equal(seedCase(BASIS, { ...M, answerUs: 1e9 }, { share: 0, sites: 1, recordsPerMonth: 1 }).versus.today, -r2(12 * 1e3 * 15 / 3.6e6 * BASIS.electricityPencePerKwh.value / 100));
  assert.equal(seedCase(BASIS, M, { years: 1 }).over.today, 20456.8);
  assert.equal(seedCase(BASIS, M, { recordsPerMonth: 0 }).lines.frontier, 0);
});

test('seedCase · each bad input refused with its reason', () => {
  const why = (i) => seedCase(BASIS, M, i).why;
  assert.equal(why({ sites: 0 }), 'sites: a whole number, at least 1');
  assert.equal(why({ sites: 2.5 }), 'sites: a whole number, at least 1');
  assert.equal(why({ sites: -1 }), 'sites: a whole number, at least 1');
  assert.equal(why({ recordsPerMonth: -1 }), 'records and tokens: numbers');
  assert.equal(why({ tokensIn: NaN }), 'records and tokens: numbers');
  assert.equal(why({ tokensOut: 'x' }), 'records and tokens: numbers');
  assert.equal(why({ hoursPerWeek: 168.5 }), 'hours a week: 0 to 168');
  assert.equal(why({ hoursPerWeek: -1 }), 'hours a week: 0 to 168');
  assert.equal(why({ share: 1.01 }), 'the share of the work taken off: 0 to 1');
  assert.equal(why({ share: -0.1 }), 'the share of the work taken off: 0 to 1');
  assert.equal(why({ years: 0 }), 'years: 1 to 10');
  assert.equal(why({ years: 11 }), 'years: 1 to 10');
  assert.equal(why({ years: 2.5 }), 'years: 1 to 10');
  assert.equal(why({ modelMB: -1 }), 'model size and updates: numbers');
  assert.equal(why({ updatesPerYear: Infinity }), 'model size and updates: numbers');
  assert.equal(why({ gbpPerGb: -1 }), 'your own costs: numbers, or left out');
  assert.equal(why({ gbpPer1000: '2' }), 'your own costs: numbers, or left out');
  assert.equal(why({ gbpPerGb: null, gbpPer1000: null }), undefined);
});

test('seedCase · refuses a basis missing any figure it reads, and receipts it was not given', () => {
  const refused = { ok: false, why: 'a sourced basis with every figure the case reads' };
  assert.deepEqual(seedCase(null, M, {}), refused);
  for (const k of BASIS_KEYS) { const b = { ...BASIS }; delete b[k]; assert.deepEqual(seedCase(b, M, {}), refused, k); }
  assert.deepEqual(seedCase(base({ cpi: { value: -0.1 } }), M, {}), refused);
  assert.deepEqual(seedCase(base({ frontier: { inPerM: 2 } }), M, {}), refused);
  assert.deepEqual(seedCase(base({ bedrockGptOss120b: { outPerM: 1 } }), M, {}), refused);
  for (const m of [null, undefined, { ok: false, why: 'x' }, { ...M, ok: 'yes' }]) assert.deepEqual(seedCase(BASIS, m, {}), { ok: false, why: 'the measured receipts' });
  for (const m of [{ ...M, answerUs: undefined }, { ...M, answerUs: -1 }, { ...M, genomeBytes: 1.5 }, { ...M, genomeBytes: -2 }]) assert.deepEqual(seedCase(BASIS, m, {}), { ok: false, why: 'the measured receipts' });
  assert.equal(seedCase(BASIS, { ...M, answerUs: 0, genomeBytes: 0 }, {}).ok, true);
});

test('over · CPI on every year after the first, compounding', () => {
  assert.equal(over(100, 0.1, 1), 100);
  assert.equal(over(100, 0.1, 2), 210);
  assert.equal(over(100, 0.1, 3), 331);
  assert.equal(over(100, 0, 4), 400);
  assert.equal(over(100, 0.1, 0), 0);
});

test('sourcesOf · every figure the case reads, with what it is and where it came from', () => {
  const s = sourcesOf(BASIS);
  assert.deepEqual(s.map((x) => x.key), [...BASIS_KEYS]);
  assert.equal(s.find((x) => x.key === 'frontier').what, 'Claude Sonnet 5 (API)');
  assert.equal(s.find((x) => x.key === 'wageMedianHourly').source, BASIS.wageMedianHourly.source);
  assert.deepEqual(sourcesOf(null), []);
  assert.deepEqual(sourcesOf({}), []);
});

test('fuzz · garbage in, a refusal out, never a throw', () => {
  const junk = [null, undefined, 0, -1, NaN, Infinity, '', 'x', [], {}, () => 1, Symbol('s'), 10n, { valueOf() { throw new Error('no'); } }];
  const proxy = new Proxy({}, { get() { throw new Error('trap'); } });
  for (const a of [...junk, proxy]) {
    for (const b of [...junk, proxy]) {
      assert.doesNotThrow(() => seedCase(a, M, b));
      assert.doesNotThrow(() => seedCase(BASIS, a, b));
      assert.doesNotThrow(() => measured(a, b, REC1));
      assert.doesNotThrow(() => sourcesOf(a));
      const r = seedCase(BASIS, M, { sites: a, years: b });
      assert.ok(r.ok === true || typeof r.why === 'string');
    }
  }
});

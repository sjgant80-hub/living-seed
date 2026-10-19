#!/usr/bin/env node
// tools/measure-2.mjs — organ 2's measurement: the body over the origin organism, and the head-to-head against the
// local language models. Deterministic (seeded keys and draws, no clock): the models' answers are read from the
// committed data/organ-2/llm-answers.json, never asked here, so anyone re-runs this to the same bytes.
//   node tools/measure-2.mjs           → writes data/organ-2/record.json
//   node tools/measure-2.mjs --check   → re-runs and refuses unless the committed record is reproduced byte for byte
// The rules and predictions were sealed first (data/organ-2/prereg.json, tools/seal-2.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { seal } from '../src/genome.mjs';
import { germinate, answer, caseOf, stable } from '../src/germinate.mjs';
import * as B from '../src/body.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng, auc, round6, utf8Bytes } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8, sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { MODELS, sampleOf } from './sample.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const CSV = read('data/online_shoppers_intention.csv');
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })]));

/** The 2.5th percentile of AUC(a) − AUC(b) over paired bootstrap resamples of the same cases (seeded). */
export function pairedLow(a, b, y, n = 2000, seed = 99) {
  const r = rng(seed), d = [];
  for (let k = 0; k < n; k++) {
    const idx = y.map(() => Math.floor(r() * y.length));
    d.push(auc(idx.map((i) => a[i]), idx.map((i) => y[i])) - auc(idx.map((i) => b[i]), idx.map((i) => y[i])));
  }
  d.sort((x, z) => x - z);
  return round6(d[Math.floor(0.025 * n)]);
}

export async function measure() {
  const maker = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
  const genome = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: run.library.seeds.map((s) => s.seed) }, maker);
  const REF = { name: 'reference', data: DATA };
  const org = (await germinate(genome.text, REF)).organism;
  const body = B.embody(org, REF).body;

  // B1 · patterns: every unseen case of every domain, asked of its organ and unasked
  const patterns = Object.fromEntries(DOMAIN_IDS.map((d) => {
    const ds = DATA[d];
    let verified = 0, same = 0, routed = 0, receipts = 0;
    for (const i of ds.heldRows) {
      const x = caseOf(ds, i), a = B.ask(body, x, { domain: d }), o = answer(org, d, x);
      if (a.verdict === 'VERIFIED') { verified++; if (a.label === o.label && a.score === o.score) same++; if (B.checkReceipt(a.receipt)) receipts++; }
      if (B.ask(body, x).domain === d) routed++;
    }
    return [d, { held: ds.heldRows.length, verified, sameAsOrgan: same, receiptsCheck: receipts, routedHome: routed }];
  }));

  // B2 · far from the data: per domain, 500 cases with every measurement drawn outside what the organ grew on; and
  // every domain's unseen cases asked of every other organ
  const r = rng(31);
  const far = Object.fromEntries(DOMAIN_IDS.map((d) => {
    const p = body.patterns[d];
    let abstained = 0;
    for (let k = 0; k < 500; k++) {
      const x = Object.fromEntries(p.features.map((f) => { const s = p.shape[f], w = s.max - s.min + 1; return [f, r() < 0.5 ? s.max + (1 + r()) * 3 * w : s.min - (1 + r()) * 3 * w]; }));
      if (B.ask(body, x).verdict === 'ABSTAIN' && B.ask(body, x, { domain: d }).verdict === 'ABSTAIN') abstained++;
    }
    return [d, { cases: 500, abstained }];
  }));
  let crossAsked = 0, crossAbstained = 0;
  for (const d of DOMAIN_IDS) for (const e of DOMAIN_IDS) if (d !== e) for (const i of DATA[d].heldRows.slice(0, 100)) { crossAsked++; if (B.ask(body, caseOf(DATA[d], i), { domain: e }).verdict === 'ABSTAIN') crossAbstained++; }

  // B3 · the cube: 2,000 seeded writes over 400 keys and 5 sources; every read exact; near-miss keys never answer;
  // every single-fact edit found where it happened
  const rc = rng(41);
  let c = B.cube();
  const truth = new Map(), last = new Map();
  for (let k = 0; k < 2000; k++) {
    const key = 'k-' + Math.floor(rc() * 400), source = 's-' + Math.floor(rc() * 5), ts = Math.floor(rc() * 1000);
    const kind = Math.floor(rc() * 3), value = kind === 0 ? round6(rc() * 1e6) : kind === 1 ? 'v' + Math.floor(rc() * 1e9) : [Math.floor(rc() * 9), { n: round6(rc()) }];
    c = B.cubeWrite(c, { key, value, source, ts }).cube;
    const t = truth.get(key + '|' + source); if (!t || ts >= t.ts) truth.set(key + '|' + source, { ts, value });
    const l = last.get(key); if (!l || ts >= l.ts) last.set(key, { ts, value });
  }
  let exactBySource = 0, exactLatest = 0, nearMissAnswered = 0;
  for (const [ks, t] of truth) { const [key, source] = ks.split('|'); if (stable(B.cubeRead(c, key, { source }).value) === stable(t.value)) exactBySource++; }
  for (const [key, l] of last) { if (stable(B.cubeRead(c, key).value) === stable(l.value)) exactLatest++; for (const near of [key.toUpperCase(), key + ' ', ' ' + key, key.replace('-', '_')]) if (B.cubeRead(c, near).verdict !== 'ABSTAIN') nearMissAnswered++; }
  let editsFound = 0;
  const edits = Array.from({ length: 200 }, () => Math.floor(rc() * c.facts.length));
  for (const at of edits) if (B.cubeCheck({ ...c, facts: c.facts.map((f, i) => (i === at ? { ...f, value: 'edited' } : f)) }).at === at) editsFound++;

  // B4 · memory: 150 episodes; the chain holds; every edit to an entry with a successor is found where it happened;
  // each episode's own words recall it first
  let m = B.memory();
  const rm = rng(51), vocab = ['seed', 'genome', 'organ', 'gate', 'shop', 'water', 'crop', 'triage', 'cut', 'live', 'dormant', 'sealed', 'measured', 'device', 'rule', 'held', 'case', 'answer', 'abstain', 'receipt'];
  for (let k = 0; k < 150; k++) m = B.remember(m, { text: 'episode ' + k + ' ' + Array.from({ length: 6 }, () => vocab[Math.floor(rm() * vocab.length)]).join(' '), what: 'note-' + k, when: k, why: 'measurement' }).memory;
  let chainEdits = 0, selfFirst = 0;
  for (let i = 0; i < m.entries.length - 1; i++) {
    const { id, ...core } = { ...m.entries[i], text: m.entries[i].text + '!' };
    const forged = { ...core, id: sha256Hex(stable(core)).slice(0, 16) };   // the forger re-hashes the entry they changed
    if (B.memoryCheck({ entries: m.entries.map((e, j) => (j === i ? forged : e)) }).at === i + 1) chainEdits++;
  }
  for (const e of m.entries) if ((B.recall(m, e.text + ' ' + e.what, { k: 1 })[0] || {}).id === e.id) selfFirst++;

  // B5 · the head-to-head: the shop organ against the local models, on the same 300 unseen sessions
  const shop = DATA.shopper, sample = sampleOf(shop), y = sample.map((i) => shop.y[i]);
  const organScores = sample.map((i) => answer(org, 'shopper', caseOf(shop, i)).score);
  const seed = genome.text.split('\n').find((l) => l.startsWith('organ ◊ seed.v1 shopper')).slice(6);
  const contest = { sample: { cases: sample.length, purchases: y.reduce((a, v) => a + v, 0), sha: sha256Hex(stable(sample)).slice(0, 16) }, organ: { auc: round6(auc(organScores, y)), seedBytes: utf8Bytes(seed), ruleBytes: utf8Bytes(JSON.stringify(org.organs[0].body)) }, models: {} };
  const answersPath = new URL('data/organ-2/llm-answers.json', ROOT);
  if (existsSync(answersPath)) {
    const doc = JSON.parse(readFileSync(answersPath, 'utf8'));
    for (const model of MODELS) for (const condition of ['zero', 'few']) {
      const calls = new Map(doc.calls.filter((x) => x.model === model && x.condition === condition).map((x) => [x.row, x]));
      if (calls.size !== sample.length) { contest.models[model + ' · ' + condition] = { missing: sample.length - calls.size }; continue; }
      const p = sample.map((i) => (calls.get(i).p === null ? 0.5 : calls.get(i).p));
      const ms = sample.map((i) => calls.get(i).wallMs).sort((a, b) => a - b);
      contest.models[model + ' · ' + condition] = {
        auc: round6(auc(p, y)), organLead: round6(auc(organScores, y) - auc(p, y)), organLeadLow95: pairedLow(organScores, p, y),
        unreadable: sample.filter((i) => calls.get(i).p === null).length, distinct: new Set(p).size, medianMs: ms[ms.length >> 1], bytes: doc.models[model].bytes, digest: doc.models[model].digest,
      };
    }
    contest.organ.timing = doc.organTiming;
  }

  return {
    kind: 'living-seed.organ-2.record', v: 1,
    body: { organism: org.id, genome: genome.id, patterns: Object.keys(body.patterns), resting: body.resting.length },
    patterns, far, cross: { asked: crossAsked, abstained: crossAbstained },
    cube: { writes: 2000, facts: c.facts.length, keysBySource: truth.size, exactBySource, keys: last.size, exactLatest, nearMisses: last.size * 4, nearMissAnswered, edits: edits.length, editsFound, chain: B.cubeCheck(c).ok },
    memory: { episodes: m.entries.length, chain: B.memoryCheck(m).ok, forgedEdits: m.entries.length - 1, forgedFound: chainEdits, selfFirst },
    contest,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-2.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-2/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    writeFileSync(new URL('data/organ-2/record.json', ROOT), text);
    console.log('wrote data/organ-2/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

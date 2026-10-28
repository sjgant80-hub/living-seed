#!/usr/bin/env node
// tools/measure-14.mjs — organ 14's measurement: the compute layer is swappable. The organism grown by organ 1 is scored
// on every held-out case of every live organ by four substrates (src/substrate.mjs): JavaScript doubles (the reference,
// exactly germinate.mjs's answer), exact integers in millionths, a hand-assembled WebAssembly module, and single
// precision (a stand-in for a GPU or an analog part). The intelligence is the organ's structure, not the engine that runs
// the arithmetic, so the three 64-bit substrates must give the organism's own answer byte for byte; single precision is
// allowed to differ, and every difference is counted and shown to sit where single precision cannot tell a value from the
// line. Deterministic, offline. The rules were sealed first (data/organ-14/prereg.json, tools/seal-14.mjs).
//   node tools/measure-14.mjs [--check] | --smoke
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { grow } from '../src/system.mjs';
import { answer, caseOf } from '../src/germinate.mjs';
import { seal } from '../src/genome.mjs';
import { SUBSTRATES, prepare, WASM } from '../src/substrate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';
import { PHRASE, POLICY, clock } from './organ-13.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const SMOKE = process.argv.includes('--smoke');
const cap = (a) => (SMOKE ? a.slice(0, 20) : a);
const SEEDS = JSON.parse(read('data/seed-library-run.json')).library.seeds.map((s) => s.seed);
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const F = Math.fround;

export async function measure() {
  const origin = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, await key('origin'));
  const s = await grow(origin.text, { name: 'reference', data: DATA }, PHRASE, { policy: POLICY, clock, cases: {} });
  const subs = Object.fromEntries(await Promise.all(SUBSTRATES.map(async (n) => [n, await prepare(n)])));
  const live = s.plan.live;

  const perSubstrate = {};
  for (const n of SUBSTRATES) perSubstrate[n] = { cases: 0, sameScore: 0, sameLabel: 0, labelDiffs: [] };
  const perOrgan = {};
  for (const d of live) {
    const organ = s.organism.organs.find((o) => o.domain === d), body = organ.body;
    const rows = cap(DATA[d].heldRows);
    perOrgan[d] = { held: rows.length, rules: body.rules.length };
    for (const i of rows) {
      const x = caseOf(DATA[d], i);
      const ref = answer(s.organism, d, x);                       // the organism's own answer (germinate.mjs)
      const refV = { score: ref.score, label: ref.label };
      for (const n of SUBSTRATES) {
        const v = subs[n].score(body, x);
        const ps = perSubstrate[n];
        ps.cases++;
        if (v && v.score === refV.score) ps.sameScore++;
        if (v && v.label === refV.label) ps.sameLabel++;
        else if (n === 'f32' && v) {
          // where single precision disagrees, show the margin it could not resolve: the single-precision sum against the
          // single-precision line, the two within one single-precision step of each other
          const sumF = body.rules.reduce((a, r) => (r.op === '>' ? F(x[r.feat]) > F(r.v) : F(x[r.feat]) <= F(r.v)) ? F(a + F(r.w)) : a, F(0));
          ps.labelDiffs.push({ organ: d, case: i, refScore: refV.score, f32Score: v.score, gapF32: F(sumF - F(body.threshold)) });
        } else if (!v) ps.labelDiffs.push({ organ: d, case: i, nulled: true });
      }
    }
  }
  const f32 = perSubstrate.f32;
  return {
    kind: 'living-seed.organ-14.record', v: 1, phrase: PHRASE,
    organism: s.organism.id, live, totalCases: perSubstrate.f64.cases, perOrgan,
    substrates: Object.fromEntries(SUBSTRATES.map((n) => {
      const p = perSubstrate[n];
      return [n, { cases: p.cases, sameScore: p.sameScore, sameLabel: p.sameLabel, labelDiffs: p.labelDiffs.length, ...(n === 'f32' ? { diffs: f32.labelDiffs.slice(0, 20), allWithinOneStep: f32.labelDiffs.every((x) => !x.nulled && Math.abs(x.gapF32) <= F(2 ** -23) * Math.max(1, Math.abs(x.f32Score))) } : {}) }];
    })),
    wasm: { bytes: WASM.length, valid: WebAssembly.validate(WASM) },
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-14.mjs');
if (isMain) {
  const t0 = Date.now(), rec = await measure();
  if (SMOKE) { console.log('SMOKE RAN · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + rec.totalCases + ' cases · f32 label diffs ' + rec.substrates.f32.labelDiffs); process.exit(0); }
  const text = JSON.stringify(rec, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    if (read('data/organ-14/record.json') !== text) { console.log('RECORD MISMATCH · re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } else {
    mkdirSync(new URL('data/organ-14/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-14/record.json', ROOT), text);
    console.log('wrote data/organ-14/record.json · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  }
}

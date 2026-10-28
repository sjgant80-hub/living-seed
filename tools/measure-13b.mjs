#!/usr/bin/env node
// tools/measure-13b.mjs — organ 13b: organ 13 at its exact scope. Organ 13 tried one bit in every byte of a message, not
// every bit; its scan of the files the system loads also named four fragments of text as modules; and its fingerprint did
// not travel to a browser tab, because the synthetic domains are drawn with Math.log and Math.cos, which two engines can
// round differently in the last digit. 13b measures every bit, reads only import statements, and takes a fingerprint
// made to travel: the real shop sessions (read from a file, the same bits in every engine), and for the synthetic cases
// what each answer says — its label, score and rules fired — not the last digits of the case it was asked.
//   node tools/measure-13b.mjs [--check]   → data/organ-13b/record.json
//   node tools/measure-13b.mjs --smoke     → every step on a few cases, the record's shape only
// The rules were sealed first (data/organ-13b/prereg.json, tools/seal-13b.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { KEEPER, grow } from '../src/system.mjs';
import { seal } from '../src/genome.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';
import { PHRASE, POLICY, clock } from './organ-13.mjs';
import { SHOP_CASES, travelCases, travel } from './organ-13b.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const SMOKE = process.argv.includes('--smoke');
const SEEDS = JSON.parse(read('data/seed-library-run.json')).library.seeds.map((s) => s.seed);
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const REF = { name: 'reference', data: DATA };
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/' + s)));
const tally = (xs) => xs.reduce((a, x) => ({ ...a, [x]: (a[x] || 0) + 1 }), {});
const values = (node) => node.ledger().log.filter((e) => e.entry.type === 'value').length;

/** The files the system loads, read as code: only import and export statements count — a statement starts a line, and a
 *  dynamic import() is counted wherever it appears outside a comment. */
const STATEMENT = /^[ \t]*(?:import|export)\b[^;'"`]*?(?:\bfrom\s*)?['"]([^'"\n]+)['"]/gm;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
function importsOf() {
  const seen = new Set(), outside = new Set();
  let dynamic = 0;
  const walk = (url) => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const src = strip(readFileSync(url, 'utf8'));
    dynamic += (src.match(/\bimport\s*\(/g) || []).length;
    for (const m of src.matchAll(STATEMENT)) { if (m[1].startsWith('.')) walk(new URL(m[1], url)); else outside.add(m[1]); }
  };
  walk(new URL('src/system.mjs', ROOT));
  const list = [...seen].map((h) => h.slice(ROOT.href.length)).sort();
  return { files: list.length, list, sameFilesAsOrgan13: JSON.stringify(list) === JSON.stringify(JSON.parse(read('data/organ-13/record.json')).offline.imports.list), outside: [...outside].sort(), dynamic };
}

export async function measure() {
  const origin = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, await key('origin'));
  const sys = await grow(origin.text, REF, PHRASE, { policy: POLICY, clock, cases: { triage: [travelCases(DATA).triage[0]] } });

  // B1: every bit of every byte, at both doors
  const x = travelCases(DATA).triage[0];
  const q = await sys.nodes[KEEPER].ask('triage', x);
  const bits = (n) => (SMOKE ? 3 : n * 8);
  const flip = (b, k) => { const c = b.slice(); c[k >> 3] ^= 1 << (k & 7); return c; };
  const askDoor = [];
  for (let k = 0; k < bits(q.bytes.length); k++) { const r = await sys.nodes.triage.hear(flip(q.bytes, k)); askDoor.push(r.ok === false && r.replies.length === 0 ? 'refused' : 'ANSWERED'); }
  const reply = (await sys.nodes.triage.hear(q.bytes)).replies[0].bytes;
  const answerDoor = [];
  for (let k = 0; k < bits(reply.length); k++) { const h = await sys.nodes[KEEPER].hear(flip(reply, k)); answerDoor.push(h.ok === false ? 'refused' : 'ADMITTED ' + h.outcome); }
  const genuine = await sys.nodes[KEEPER].hear(reply);

  // B3: the fingerprint made to travel, on a fresh system
  const cases = travelCases(DATA);
  const sT = await grow(origin.text, REF, PHRASE, { policy: POLICY, clock, cases });
  const t = await travel(sT, cases);

  return {
    kind: 'living-seed.organ-13b.record', v: 1,
    doors: { askBytes: q.bytes.length, ask: { bits: askDoor.length, outcomes: tally(askDoor) }, answerBytes: reply.length, answer: { bits: answerDoor.length, outcomes: tally(answerDoor) }, genuineAfter: genuine.outcome || 'refused', credited: values(sys.nodes[KEEPER]) },
    imports: importsOf(),
    travel: { shopCases: SHOP_CASES, ...t },
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-13b.mjs');
if (isMain) {
  const t0 = Date.now(), rec = await measure();
  if (SMOKE) {
    const keys = (o, d = 0) => (o && typeof o === 'object' && !Array.isArray(o) && d < 2 ? '{' + Object.keys(o).map((k) => k + keys(o[k], d + 1)).join(' ') + '}' : '');
    console.log('SMOKE RAN END TO END · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + keys(rec));
    process.exit(0);
  }
  const text = JSON.stringify(rec, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-13b/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } else {
    mkdirSync(new URL('data/organ-13b/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-13b/record.json', ROOT), text);
    console.log('wrote data/organ-13b/record.json · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  }
}

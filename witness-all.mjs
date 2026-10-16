#!/usr/bin/env node
// witness-all.mjs — the mutation + fuzz gate over the Living Seed's kernels. Each organ's kernel is mutated (comparisons,
// logic, booleans, ±1) and its tests must kill every mutant, or the survivor is reviewed and written down with a reason.
//   genome.mjs    — the genome: seal, verify before parse, one byte form (step 1)
//   germinate.mjs — Γ: grow each organ on the device's own data, gate it, answer or abstain (step 1)
// The vendored ribosome (seed-library), the keys and the data loaders are gated in their own repositories.
import { runMutations } from './.witness/witness.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const HERE = dirname(fileURLToPath(import.meta.url));

/** Where the witness would hide REAL code: its masker reads '…' / "…" as strings and does not stop at a newline, so a
 *  stray quote inside a regex or a backtick template blanks code up to the next matching quote — and those operators are
 *  never mutated (a false clean). A JS string cannot span lines unescaped, so any quoted run that crosses one is a span
 *  of hidden code. Returns [first line, last line] for each. */
export function hiddenSpans(src) {
  const spans = [];
  let state = 'code', start = -1, line = 1, startLine = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') line++;
    if (state === 'code') {
      if (c === '/' && d === '/') { i++; state = 'line'; }
      else if (c === '/' && d === '*') { i++; state = 'block'; }
      else if (c === "'" || c === '"') { state = c; start = i; startLine = line; }
    } else if (state === 'line') { if (c === '\n') state = 'code'; }
    else if (state === 'block') { if (c === '*' && d === '/') { i++; state = 'code'; } }
    else if (c === '\\') { if (src[i + 1] === '\n') line++; i++; }
    else if (c === state) { if (line > startLine) spans.push([startLine, line]); state = 'code'; }
  }
  if (state === "'" || state === '"') spans.push([startLine, line]);
  return spans;
}
export const PAIRS = [
  ['src/genome.mjs', ['test/genome.test.mjs']],
  ['src/germinate.mjs', ['test/germinate.test.mjs', 'test/recycle.test.mjs']],
  ['src/body.mjs', ['test/body.test.mjs']],
  ['src/gate.mjs', ['test/gate.test.mjs', 'test/mesh.test.mjs', 'test/immune.test.mjs']],
  ['src/evolve.mjs', ['test/evolve.test.mjs', 'test/recycle.test.mjs']],
  ['src/card.mjs', ['test/card.test.mjs']],
  ['src/breed.mjs', ['test/breed.test.mjs']],
  ['src/recycle.mjs', ['test/recycle.test.mjs']],
  ['src/psi.mjs', ['test/psi.test.mjs']],
  ['src/mesh.mjs', ['test/mesh.test.mjs', 'test/immune.test.mjs']],
  ['src/immune.mjs', ['test/immune.test.mjs']],
  ['src/align.mjs', ['test/align.test.mjs']],
  ['src/organism.mjs', ['test/organism.test.mjs']],
];
// imported (by the tests) it only lends hiddenSpans and PAIRS; run directly, it is the gate
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();

function main() {
const only = process.argv.slice(2);
// a name that matches no kernel judges nothing — and nothing judged must never print CLEAN
const unknown = only.filter((o) => !PAIRS.some(([src]) => src === o));
if (unknown.length) { console.log(`WITNESS NOT RUN — no kernel named ${unknown.join(', ')} (name it as its path, e.g. src/oversight.mjs)`); process.exit(1); }
let allClean = true; const rows = [];
for (const [src, tests] of PAIRS) {
  if (only.length && !only.includes(src)) continue;
  if (!existsSync(join(HERE, src))) continue;
  const t0 = Date.now();
  // code the masker would hide is never mutated — refuse to judge rather than report a clean that skipped it
  const hidden = hiddenSpans(readFileSync(join(HERE, src), 'utf8'));
  if (hidden.length) {
    console.log(`✗ ${src.padEnd(16)} HIDDEN CODE — a stray quote hides lines ${hidden.map(([a, b]) => a + '–' + b).join(', ')} from mutation; write it as \\x22 / \\x27`);
    allClean = false;
    continue;
  }
  // a red suite kills every mutant and reads as CLEAN — so the unmutated code must pass its tests first, or nothing is judged
  const base = spawnSync(process.execPath, ['--test', ...tests], { cwd: HERE, encoding: 'utf8', timeout: 300000 });
  if (base.status !== 0) {
    console.log(`✗ ${src.padEnd(16)} RED BASELINE — its tests fail with no mutation applied (${tests.join(', ')}); nothing can be judged`);
    allClean = false;
    continue;
  }
  const r = runMutations(join(HERE, src), { cwd: HERE, cap: 5000, timeout: 120000, testCmd: ['node', '--test', ...tests] });
  rows.push(r);
  console.log(`${r.clean && !r.capped ? '✓' : '✗'} ${src.padEnd(16)} ${String(r.killed).padStart(3)}/${String(r.total).padEnd(3)} killed${r.ignored.length ? ` · ${r.ignored.length} reviewed-equivalent` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const s of r.survived) console.log(`    SURVIVED line ${s.line}: ${s.mutation} :: ${s.snippet}`);
  if (!r.clean || r.capped) allClean = false;
}
const k = rows.reduce((a, r) => a + r.killed, 0), n = rows.reduce((a, r) => a + r.total, 0);
console.log(`\n${allClean ? 'WITNESS CLEAN' : 'WITNESS NOT CLEAN'} — ${k}/${n} mutants killed`);
process.exit(allClean ? 0 : 1);
}

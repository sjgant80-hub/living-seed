#!/usr/bin/env node
// tools/order.mjs — proves from git that organ 1 was sealed before it was measured, on the very code the seal pinned.
//   node tools/order.mjs   → ORDER ✓ or ✗ (exit 1)
// The last commit to touch data/prereg.json must be a strict ancestor of the commit that first added data/record.json (the
// seal as it stands came first and has not moved since), and every file the seal pins must be byte-identical in the
// record's commit.
//
// Why this is its own file: the sealed judge (tools/judge.mjs) carries an order check of its own, and it is broken — it
// passes git's --format after the '--' that ends the options, so git reads it as a path and the check fails on a true
// order. That was found when the judge first ran, after the measurement, so the judge was left byte-identical to the seal
// (its rules are what the verdict stands on) and the order proof was rewritten here. This file judges nothing; it reads git.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const run = { cwd: new URL('.', ROOT), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 };
const git = (...a) => execFileSync('git', a, { ...run, encoding: 'utf8' });
const commits = (opts, path) => git('log', ...opts, '--format=%H', '--', path).trim().split('\n').filter(Boolean);

/** later: the files that must come after the seal (each judged at the commit that first added it).
 *  → { ok, why, seal, record } — record: the first commit of the last of them */
export function order(prereg, sealPath = 'data/prereg.json', later = ['data/record.json']) {
  const seal = commits(['-1'], sealPath)[0];
  if (!seal) return { ok: false, why: 'the seal is not committed' };
  let record = null;
  for (const path of [].concat(later)) {
    record = commits(['--diff-filter=A'], path).pop();
    if (!record) return { ok: false, why: path + ' is not committed', seal };
    if (seal === record) return { ok: false, why: 'the seal and ' + path + ' came in the same commit', seal, record };
    try { git('merge-base', '--is-ancestor', seal, record); } catch { return { ok: false, why: 'the seal as it stands was not committed before ' + path, seal, record }; }
    for (const [p, hash] of Object.entries(prereg.files)) {
      let bytes;
      try { bytes = execFileSync('git', ['show', record + ':' + p], run); } catch { return { ok: false, why: p + ' is missing from the commit that added ' + path, seal, record }; }
      if (fileHash(bytes) !== hash) return { ok: false, why: p + ' changed between the seal and ' + path, seal, record };
    }
  }
  return { ok: true, why: 'sealed in ' + seal.slice(0, 7) + ', then ' + [].concat(later).map((p) => p.split('/').pop() + ' in ' + commits(['--diff-filter=A'], p).pop().slice(0, 7)).join(', ') + ' — on the ' + Object.keys(prereg.files).length + ' files it pinned, byte for byte', seal, record };
}

const ORGANS = {
  1: { seal: 'data/prereg.json', later: ['data/record.json'] },
  2: { seal: 'data/organ-2/prereg.json', later: ['data/organ-2/llm-answers.json', 'data/organ-2/record.json'] },
  3: { seal: 'data/organ-3/prereg.json', later: ['data/organ-3/record.json'] },
  4: { seal: 'data/organ-4/prereg.json', later: ['data/organ-4/record.json'] },
  '4b': { seal: 'data/organ-4b/prereg.json', later: ['data/organ-4b/record.json'] },
  5: { seal: 'data/organ-5/prereg.json', later: ['data/organ-5/record.json'] },
  6: { seal: 'data/organ-6/prereg.json', later: ['data/organ-6/record.json', 'data/organ-6/timing.json'] },
  7: { seal: 'data/organ-7/prereg.json', later: ['data/organ-7/record.json'] },
  8: { seal: 'data/organ-8/prereg.json', later: ['data/organ-8/record.json'] },
  '8b': { seal: 'data/organ-8b/prereg.json', later: ['data/organ-8b/record.json'] },
  '8c': { seal: 'data/organ-8c/prereg.json', later: ['data/organ-8c/record.json'] },
  9: { seal: 'data/organ-9/prereg.json', later: ['data/organ-9/record.json'] },
};

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/order.mjs');
if (isMain) {
  const at = process.argv.indexOf('--organ'), o = ORGANS[at > 0 ? process.argv[at + 1] : 1];
  if (!o) { console.log('ORDER ✗ no such organ'); process.exit(1); }
  const h = order(JSON.parse(readFileSync(new URL(o.seal, ROOT), 'utf8')), o.seal, o.later);
  console.log((h.ok ? 'ORDER ✓ ' : 'ORDER ✗ ') + h.why);
  process.exit(h.ok ? 0 : 1);
}

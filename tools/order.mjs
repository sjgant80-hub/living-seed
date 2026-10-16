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

/** → { ok, why, seal, record } */
export function order(prereg, sealPath = 'data/prereg.json', recordPath = 'data/record.json') {
  const seal = commits(['-1'], sealPath)[0], record = commits(['--diff-filter=A'], recordPath).pop();
  if (!seal || !record) return { ok: false, why: 'the seal or the record is not committed' };
  if (seal === record) return { ok: false, why: 'the seal and the record came in the same commit', seal, record };
  try { git('merge-base', '--is-ancestor', seal, record); } catch { return { ok: false, why: 'the seal as it stands was not committed before the record', seal, record }; }
  for (const [path, hash] of Object.entries(prereg.files)) {
    let bytes;
    try { bytes = execFileSync('git', ['show', record + ':' + path], run); } catch { return { ok: false, why: path + ' is missing from the record commit', seal, record }; }
    if (fileHash(bytes) !== hash) return { ok: false, why: path + ' changed between the seal and the measurement', seal, record };
  }
  return { ok: true, why: 'sealed in ' + seal.slice(0, 7) + ', measured in ' + record.slice(0, 7) + ' on the ' + Object.keys(prereg.files).length + ' files it pinned, byte for byte', seal, record };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/order.mjs');
if (isMain) {
  const h = order(JSON.parse(readFileSync(new URL('data/prereg.json', ROOT), 'utf8')));
  console.log((h.ok ? 'ORDER ✓ ' : 'ORDER ✗ ') + h.why);
  process.exit(h.ok ? 0 : 1);
}

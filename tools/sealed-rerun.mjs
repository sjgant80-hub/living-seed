#!/usr/bin/env node
// tools/sealed-rerun.mjs — re-run an organ's measurement on the exact bytes its seal pinned, read back out of the seal
// commit itself, and check it gives the committed record byte for byte.
//   node tools/sealed-rerun.mjs --organ 2   → SEALED RE-RUN ✓ or ✗
// Why it exists: tools/order.mjs proves every pinned file is unchanged at the record's commit. When a pinned file did
// change between the seal and the record (organ 2's src/germinate.mjs gained organ 6's opt-in pool hook while organ 2's
// models were still answering), the order proof refuses, rightly. This is the stronger test of what the seal promised:
// the record must follow from the sealed bytes themselves — every one of them, as sealed — and the data committed after.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 });
const ORGANS = { 2: { seal: 'data/organ-2/prereg.json', measure: 'tools/measure-2.mjs', data: ['data/organ-2/llm-answers.json', 'data/organ-2/record.json'] } };

const at = process.argv.indexOf('--organ'), o = ORGANS[at > 0 ? process.argv[at + 1] : ''];
if (!o) { console.log('SEALED RE-RUN ✗ no such organ'); process.exit(1); }
const sealCommit = git('log', '-1', '--format=%H', '--', o.seal).toString().trim();
const pinned = Object.keys(JSON.parse(git('show', sealCommit + ':' + o.seal).toString()).files);
const dir = mkdtempSync(join(tmpdir(), 'ls-sealed-'));
try {
  const put = (path, bytes) => { mkdirSync(join(dir, dirname(path)), { recursive: true }); writeFileSync(join(dir, path), bytes); };
  for (const p of pinned) put(p, git('show', sealCommit + ':' + p));                 // every pinned file, as sealed
  for (const p of [o.seal, ...o.data]) put(p, readFileSync(join(ROOT, p)));          // the seal, and what was committed after it
  const out = execFileSync(process.execPath, [o.measure, '--check'], { cwd: dir, encoding: 'utf8' }).trim();
  const ok = out.startsWith('RECORD REPRODUCED');
  console.log((ok ? 'SEALED RE-RUN ✓ ' : 'SEALED RE-RUN ✗ ') + 'the ' + pinned.length + ' files as sealed in ' + sealCommit.slice(0, 7) + ' give ' + (ok ? 'the committed record byte for byte — ' : 'a different record — ') + out);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.log('SEALED RE-RUN ✗ ' + String(e.stdout || e.message).trim().split('\n').pop());
  process.exit(1);
} finally { rmSync(dir, { recursive: true, force: true }); }

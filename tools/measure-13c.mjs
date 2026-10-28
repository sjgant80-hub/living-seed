#!/usr/bin/env node
// tools/measure-13c.mjs — organ 13c: what the system loads, asked of Node's own module loader rather than read with a
// pattern. Organ 13's scan and organ 13b's both read source text with a regular expression, and both named strings as
// modules (13b's B2 failed, kept). Here a child Node process registers a resolve hook (node:module registerHooks), loads
// src/system.mjs, and reports every module the loader itself resolved: exactly what runs, nothing read into it.
//   node tools/measure-13c.mjs [--check]   → data/organ-13c/record.json
//   node tools/measure-13c.mjs --smoke     → the instrument on a fixture with a known answer (a file that imports one
//                                           sibling and one built-in), then the record's shape only
// The rules were sealed first (data/organ-13c/prereg.json, tools/seal-13c.mjs).
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/** Every module Node's loader resolves while loading entry (a file: URL), in the order it resolved them. */
export function resolvedBy(entry) {
  const probe = [
    "import { registerHooks } from 'node:module';",
    'const seen = [];',
    'registerHooks({ resolve(specifier, context, next) { const r = next(specifier, context); seen.push(r.url); return r; } });',
    'await import(' + JSON.stringify(entry) + ');',
    "process.stdout.write(JSON.stringify(seen));",
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) throw new Error('the loader probe failed: ' + (r.stderr || '').split('\n')[0]);
  return JSON.parse(r.stdout);
}

/** Split what the loader resolved into this repository's files and everything else. */
export function sorted(urls, root) {
  const inside = [...new Set(urls.filter((u) => u.startsWith(root)))].map((u) => u.slice(root.length)).sort();
  return { files: inside.length, list: inside, outside: [...new Set(urls.filter((u) => !u.startsWith(root)))].sort(), resolutions: urls.length };
}

export function measure() {
  const got = sorted(resolvedBy(new URL('src/system.mjs', ROOT).href), ROOT.href);
  const organ13 = JSON.parse(read('data/organ-13/record.json')).offline.imports.list;
  return { kind: 'living-seed.organ-13c.record', v: 1, loader: { ...got, sameFilesAsOrgan13: JSON.stringify(got.list) === JSON.stringify(organ13) } };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-13c.mjs');
if (isMain) {
  if (process.argv.includes('--smoke')) {
    // the instrument, on a fixture whose answer is known: a.mjs imports ./b.mjs and node:path; b.mjs imports nothing
    const dir = mkdtempSync(join(tmpdir(), 'ls13c-'));
    try {
      writeFileSync(join(dir, 'a.mjs'), "import { b } from './b.mjs';\nimport { join } from 'node:path';\nexport const a = b + join('x');\nexport const s = 'from \\'not-a-module\\'';\n");
      writeFileSync(join(dir, 'b.mjs'), "export const b = 'import \\'also-not\\'';\n");
      const base = pathToFileURL(dir + '/').href, got = sorted(resolvedBy(base + 'a.mjs'), base);
      const right = JSON.stringify(got.list) === '["a.mjs","b.mjs"]' && JSON.stringify(got.outside) === '["node:path"]';
      console.log('INSTRUMENT ' + (right ? 'RIGHT' : 'WRONG') + ' on the fixture · files ' + got.list.join(', ') + ' · outside ' + got.outside.join(', '));
      if (!right) process.exit(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const rec = measure();
    console.log('SMOKE RAN END TO END · ' + Object.keys(rec).join(' ') + ' {' + Object.keys(rec.loader).join(' ') + '}');
    process.exit(0);
  }
  const text = JSON.stringify(measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-13c/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-13c/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-13c/record.json', ROOT), text);
    console.log('wrote data/organ-13c/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}

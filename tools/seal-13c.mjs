#!/usr/bin/env node
// tools/seal-13c.mjs — organ 13c's pre-registration, committed BEFORE tools/measure-13c.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';
import { resolvedBy, sorted } from './measure-13c.mjs';

const ROOT = new URL('../', import.meta.url);
// what each tool loads, asked of Node's loader (tools/measure-13c.mjs) — a pattern over source text reads strings as imports
const loaded = (entries) => entries.flatMap((e) => sorted(resolvedBy(new URL(e, ROOT).href), ROOT.href).list);
// (this file is pinned by name: loading it in the probe would run the seal again)
const FILES = [...new Set([...loaded(['tools/measure-13c.mjs', 'tools/judge-13c.mjs', 'tools/judge.mjs', 'src/system.mjs']), 'tools/seal-13c.mjs', 'data/organ-13/record.json', 'data/organ-13b/record.json'])].sort();

const prereg = {
  kind: 'living-seed.organ-13c.prereg', v: 1,
  organ: 'organ 13c — what the system loads, asked of Node’s own module loader rather than read with a pattern',
  design: 'Organ 13’s scan and organ 13b’s both read source text with a regular expression, and both named strings as modules; 13b’s B2 failed on it and is kept. Here a child Node process registers a resolve hook (node:module registerHooks) and loads src/system.mjs; the hook records every module the loader itself resolves. Before this seal the instrument was run on a fixture whose answer is known — a file importing one sibling and one built-in, with two strings shaped like imports — and it named exactly the sibling and the built-in.',
  rules: [
    { id: 'L1', kind: 'prediction', claim: 'Node’s own loader, loading src/system.mjs, resolves exactly the files organ 13 followed, every one inside this repository, and nothing else: no built-in module, and none from outside the repository — so nothing that could reach a network is even loaded', seenBeforeSeal: 'in kind — organ 13’s walk followed these files by their relative imports; what the loader resolves, built-ins included, has not been asked' },
  ],
  disclosure: 'The record holds no Node version, so that CI (Node 22) re-runs it byte for byte against the one made here (Node 25); registerHooks is in both. The instrument was checked on the fixture in smoke mode. This seal itself asks the same loader which files to pin, so the files of this repository that src/system.mjs loads were computed while sealing (their names are the pinned list below); what lies outside the repository — the half of L1 that could fail — was not printed or read before this seal. A failed prediction is kept.',
  judgedBy: 'tools/judge-13c.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-13c/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-13c/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-13c/prereg.json · ' + prereg.rules.length + ' rule (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' prediction) · ' + FILES.length + ' files pinned');

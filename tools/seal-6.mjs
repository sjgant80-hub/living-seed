#!/usr/bin/env node
// tools/seal-6.mjs — organ 6's pre-registration, committed BEFORE tools/measure-6.mjs and tools/time-6.mjs run.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/genome.mjs', 'src/germinate.mjs', 'src/evolve.mjs', 'src/breed.mjs', 'src/gate.mjs', 'src/recycle.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/organ-4b/record.json',
  'tools/measure-6.mjs', 'tools/time-6.mjs', 'tools/judge-6.mjs', 'tools/seal-6.mjs', 'tools/judge.mjs',
  'test/recycle.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-6.prereg', v: 1,
  organ: 'organ 6 — self-powering: completed computation is kept in a pool and reused, so the organism pays fresh only for new work',
  workload: 'A — organ 4’s second-design evolution (four domains and the shuffled shop, 30 generations × 8 children × 3 folds), run plain, through a pool that keeps nothing (so every sort is counted on the same code path), and through a pool that keeps. B — the organism’s life so far: the seven genomes of organs 1–5 (origin, evolved, child, grandchild, three generations of replication) each grown on organ 1’s five devices, fresh and through one shared pool.',
  rules: [
    { id: 'S1', kind: 'property', claim: 'recycling never changes an answer: evolution through the pool takes exactly the same steps as without it, and every one of the 35 organisms grown through the pool is byte-for-byte the organism grown fresh', seenBeforeSeal: 'in kind — unit tests on toy data' },
    { id: 'S2', kind: 'prediction', claim: 'evolution performs at most 2% of the column sorts it asks for — the rest are read from the pool', seenBeforeSeal: 'no — on a toy set it sorted at most once per fold and feature' },
    { id: 'S3', kind: 'prediction', claim: 'across the organism’s life, at least half of all organ growths come from the pool — the same recipe on equal data, grown once', seenBeforeSeal: 'no' },
    { id: 'S4', kind: 'prediction', claim: 'on this machine the pooled evolution runs at least three times faster in wall time than plain (median of three alternating repeats)', seenBeforeSeal: 'no' },
  ],
  disclosure: 'Recycling here is reuse of finished work — sorted columns and grown organs — not energy from nowhere: no power meter is attached, so watt-hours are not claimed, only work not repeated and the time it saves. Wall time is measured once, with a local language model answering in the background, and recorded with the machine. A failed prediction is kept.',
  judgedBy: 'tools/judge-6.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-6/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-6/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-6/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');

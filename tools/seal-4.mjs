#!/usr/bin/env node
// tools/seal-4.mjs — organ 4's pre-registration, committed BEFORE tools/measure-4.mjs runs on the real domains.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/evolve.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-4.mjs', 'tools/judge-4.mjs', 'tools/seal-4.mjs', 'tools/judge.mjs',
  'test/evolve.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-4.prereg', v: 1,
  organ: 'organ 4 — variation and selection (μ + f): an organ’s recipe varied and the fitter variant kept, blind to the cases it is judged on',
  question: 'When each origin organ is evolved for 30 generations on its training cases alone, does what it gains on its own validation slice carry over to the unseen cases a separate judge reads — and on data with no signal, does selection manufacture anything the gate would let through?',
  design: '30 generations × 8 children per organ, seed 1; a child is the champion with k single changes; kept only if it beats the champion on validation (carved from training, a third) by more than 0.002; k follows Rechenberg’s one-fifth rule over the last five generations (1 ≤ k ≤ 8). The evolver is handed the data with every held-out case removed; judge() then grows every kept recipe on the full data and reads the held-out score.',
  rules: [
    { id: 'E1', kind: 'property', claim: 'every evolution run is shown 0 held-out cases and tries exactly 1 + 30 × 8 variants', seenBeforeSeal: 'in kind — unit tests on a synthetic set; no real domain has been evolved' },
    { id: 'E2', kind: 'prediction', claim: 'on validation each kept step beats the last, and the champion ends higher than it started on at least 3 of the 4 domains', seenBeforeSeal: 'no' },
    { id: 'E3', kind: 'prediction', claim: 'on the unseen cases the separate judge reads, the final champion beats the origin organ by at least 0.005 AUC on at least 2 of the 4 domains, and loses more than 0.01 on none', seenBeforeSeal: 'no' },
    { id: 'E4', kind: 'prediction', claim: 'from one kept champion to the next, the unseen-case AUC never drops by more than 0.01, on at least 3 of the 4 domains', seenBeforeSeal: 'no' },
    { id: 'E5', kind: 'prediction', claim: 'with the shop labels shuffled, validation still rises — selection finds noise to fit — but no kept champion reaches the 0.6 gate on unseen cases: evolution cannot manufacture signal the gate would pass', seenBeforeSeal: 'in kind — a unit test on synthetic noise saw a held-out AUC between 0.35 and 0.65; the shop has not been looked at' },
    { id: 'E6', kind: 'prediction', claim: 'the step size moves in every run (at least two different values of k): the variation is regulated, not locked', seenBeforeSeal: 'in kind — on the synthetic set it moved' },
  ],
  disclosure: 'The kernel and its unit tests use only a synthetic dataset made in the test, so that no real domain was evolved before this seal. The origin seeds were themselves evolved by seed-library on the same training cases, so further gains may be small — E3 is the prediction most able to fail. A failed prediction is kept.',
  judgedBy: 'tools/judge-4.mjs (pinned below): a rule it does not know is a FAIL',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return; check it out again and re-seal'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-4/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-4/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-4/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');

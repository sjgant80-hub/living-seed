#!/usr/bin/env node
// tools/seal-4b.mjs — organ 4, second design: its pre-registration, committed BEFORE tools/measure-4b.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/evolve.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/organ-4/record.json',
  'tools/measure-4b.mjs', 'tools/judge-4b.mjs', 'tools/seal-4b.mjs', 'tools/judge.mjs',
  'test/evolve.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-4b.prereg', v: 1,
  organ: 'organ 4, second design — variation and selection that has to win on every fold',
  why: 'The first design (data/organ-4/verdict.json, kept as it is) climbed on its one validation slice on all four domains and fell on unseen cases on three: the winner’s curse of choosing among 241 variants by one small slice. This design changes only the selection: fitness is the mean AUC over 3 stratified cross-validation folds of the training cases, and a child is kept only if it beats the champion on EVERY fold, and on the mean by more than 0.002. Everything else — 30 generations × 8 children, seed 1, the one-fifth rule, blindness, the separate judge — is unchanged.',
  rules: [
    { id: 'F1', kind: 'property', claim: 'every run is shown 0 held-out cases, tries exactly 1 + 30 × 8 variants, and scores each on 3 folds', seenBeforeSeal: 'in kind — unit tests on a synthetic set' },
    { id: 'F2', kind: 'prediction', claim: 'do no harm: on the unseen cases, the final champion is no more than 0.005 AUC below the origin organ on all 4 domains', seenBeforeSeal: 'no' },
    { id: 'F3', kind: 'prediction', claim: 'some good: on at least 1 of the 4 domains the final champion beats the origin organ by at least 0.005 AUC on the unseen cases', seenBeforeSeal: 'no' },
    { id: 'F4', kind: 'prediction', claim: 'from one kept champion to the next, the unseen-case AUC never drops by more than 0.01, on all 4 domains', seenBeforeSeal: 'no' },
    { id: 'F5', kind: 'prediction', claim: 'with the shop labels shuffled, at most one step is kept (a unanimous win across folds is hard to fake on noise), and nothing reaches the 0.6 gate on unseen cases', seenBeforeSeal: 'no' },
    { id: 'F6', kind: 'prediction', claim: 'on at least 3 of the 4 domains this design’s final champion scores at least as well on unseen cases as the first design’s', seenBeforeSeal: 'no — the first design’s numbers are known (its verdict is committed); this design’s are not' },
  ],
  disclosure: 'Written after the first design failed E3 and E4, and aimed at the cause. The predictions are deliberately modest — do no harm first, some good second — because the origin seeds were already evolved by seed-library on these training cases. The shop’s unseen cases are later months (November–December) than its training, a shift no fold of the training data can show; that is not fixed here and is said so. A failed prediction is kept.',
  judgedBy: 'tools/judge-4b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-4b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-4b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-4b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');

#!/usr/bin/env node
// tools/seal-2c.mjs — organ 2c's pre-registration, committed BEFORE any classical model scores a held-out session.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/baseline.mjs', 'src/genome.mjs', 'src/germinate.mjs', 'src/body.mjs', 'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs', 'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/record.json',
  'tools/sample.mjs', 'tools/measure-2.mjs', 'tools/measure-2c.mjs', 'tools/judge-2c.mjs', 'tools/seal-2c.mjs', 'tools/judge.mjs',
];

const prereg = {
  kind: 'living-seed.organ-2c.prereg', v: 1,
  organ: 'organ 2, against the classical models — what does the shop organ give up, or gain, against what a data scientist would fit first on the same table?',
  why: 'The page compares the organ with language models, but a buyer’s analyst would compare it with the standard models first. This fits three on the same 10 measurements and the same 7,605 February–October sessions the organ grew on, and scores them on the same 4,725 November–December sessions it never grew on: PageValues alone (the measurement an analyst would try first), logistic regression, and gradient-boosted trees (src/baseline.mjs, mutation-gated; settings fixed in tools/measure-2c.mjs before any held-out score was computed).',
  scenario: 'The organ is organ 1’s shop organ: the origin genome grown on the reference data (six threshold rules; its score is a sum of on/off rules, so it ranks with ties). Logistic regression: log(1 + x), standardised on the fitted sessions, L2 penalty 1, Newton’s method to convergence. Boosted trees: 200 trees of depth 2, learning rate 0.1, cuts at 32 quantiles, L2 on leaves 1. Bounds: organ 2’s paired bootstrap (2,000 resamples, seed 99) on the 4,725. The other columns of the dataset (browser, region, traffic type, visitor type, weekend) are not used by the organ and are not given to the models either.',
  rules: [
    { id: 'D1', kind: 'property', claim: 'every model is fitted on the 7,605 February–October sessions alone (scrambling every November–December measurement and label leaves each fit unchanged), each fit is the same twice, every one of the 4,725 November–December sessions gets a finite score, and the organ scores what organ 1 sealed', seenBeforeSeal: 'the plumbing only: a dry run in a scratch copy that printed nothing but “ran”' },
    { id: 'D2', kind: 'prediction', claim: 'the organ beats PageValues alone on November–December: the 95% lower bound of its lead is above 0', seenBeforeSeal: 'no — PageValues was chosen as the measurement an analyst would try first here; the organ itself leans on it twice' },
    { id: 'D3', kind: 'prediction', claim: 'the organ is not worse than logistic regression by more than 0.02 AUC: the 95% lower bound of its lead is above −0.02', seenBeforeSeal: 'no' },
    { id: 'D4', kind: 'prediction', claim: 'the organ is not worse than the boosted trees by more than 0.05 AUC: the 95% lower bound of its lead is above −0.05', seenBeforeSeal: 'no — nothing was computed on this split; the expectation was that the trees win' },
  ],
  disclosure: 'Designed knowing the organ’s own score (0.815 on these 4,725) and nothing about the classical models on them. The predictions are the claims a seller would like to make; written before the run, the expectation was that the boosted trees win and that D2 and D3 are genuinely open. A failed prediction is kept, and the page says what it means for a buyer.',
  judgedBy: 'tools/judge-2c.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-2c/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-2c/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-2c/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');

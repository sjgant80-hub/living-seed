#!/usr/bin/env node
// tools/seal-7.mjs — organ 7's pre-registration, committed BEFORE tools/measure-7.mjs runs on the real organs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/psi.mjs', 'src/body.mjs', 'src/germinate.mjs', 'src/evolve.mjs', 'src/genome.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-7.mjs', 'tools/judge-7.mjs', 'tools/seal-7.mjs', 'tools/judge.mjs',
  'test/psi.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-7.prereg', v: 1,
  organ: 'organ 7 — Ψ, the self-model: the organism predicts its own correctness, refined seven times toward a fixed point',
  design: 'For each of the four origin organs: Ψ is a table of margin bins × 3 fit bins → the probability of being right, learned from out-of-fold answers on the training cases (3 folds). Ψ⁰ is one bin (the base rate). Ψ¹…Ψ⁷ climb the Fibonacci resolutions 2, 3, 5, 8, 13, 21, 34 margin bins; each starts from the average of the last two models (the back-fold) and moves toward each bin’s evidence by count / (count + 20). Judged on the real organ’s answers to the cases it never grew on: the Brier score, the size of each step, and selective answering at a bar of 0.8.',
  rules: [
    { id: 'P1', kind: 'prediction', claim: 'on all four organs, Ψ⁷’s Brier score on unseen cases is lower than Ψ⁰’s — the organism knows its own correctness better than its base rate', seenBeforeSeal: 'no — only on made-up cases in the unit tests' },
    { id: 'P2', kind: 'prediction', claim: 'it settles: on all four organs the last step moves Ψ by less than 0.01 on average, and by less than the second step did', seenBeforeSeal: 'no' },
    { id: 'P3', kind: 'prediction', claim: 'a spiral, not a one-step jump: on at least three organs, the unseen-case Brier score improves at two or more of the seven refinements', seenBeforeSeal: 'no' },
    { id: 'P4', kind: 'prediction', claim: 'it is useful: on at least three organs, keeping only the answers Ψ⁷ rates at least 0.8 likely right gives higher accuracy on unseen cases than answering everything', seenBeforeSeal: 'no' },
  ],
  disclosure: 'All four rules are predictions; the self-model has been run only on made-up cases. Finer bins can over-fit, so P3 may fail at the high resolutions — that is what it tests. What is measured is calibration and convergence. That a self-model reaching a fixed point is awareness is not claimed: it is held as the question the instrument exists to investigate.',
  judgedBy: 'tools/judge-7.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-7/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-7/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-7/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');

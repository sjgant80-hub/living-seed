#!/usr/bin/env node
// tools/seal-2b.mjs — organ 2b's pre-registration, committed BEFORE the model is asked a single new case.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/genome.mjs', 'src/germinate.mjs', 'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs', 'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/organ-2/llm-answers.json',
  'tools/sample.mjs', 'tools/sample-2b.mjs', 'tools/ask-llm-2b.mjs', 'tools/measure-2b.mjs', 'tools/measure-2.mjs', 'tools/judge-2b.mjs', 'tools/seal-2b.mjs', 'tools/judge.mjs',
];

const prereg = {
  kind: 'living-seed.organ-2b.prereg', v: 1,
  organ: 'organ 2, the head-to-head, settled — on 1,200 new sessions, does the 58-byte organ beat qwen2.5:14b shown 24 examples, or only tie it?',
  why: 'Organ 2 measured the organ (AUC 0.8205) against qwen2.5:14b shown 24 past sessions (0.80645) on 300 held-out sessions: a lead of 0.014 whose 95% lower bound was −0.017 — a tie on that sample, and its B6 failed. The power needed to tell a lead that size from zero is roughly 1,600 sessions; this asks 1,200 more, new ones, so it may still not be enough. Two questions are sealed: does the organ beat the 14B (C2, which may fail), and is it at least not worse by more than 0.02 AUC (C3).',
  scenario: '1,200 held-out November–December sessions organ 2 never asked (400 that ended in a purchase, 800 that did not; tools/sample-2b.mjs, seeds 3026–3028). Everything else is organ 2’s, unchanged: the organ (the origin genome grown on the reference data), the 24 examples, the prompt, the reply parser, temperature 0, seed 7, a 4,096-token window, the paired bootstrap (2,000 resamples, seed 99). Only qwen2.5:14b with 24 examples is asked — the one condition organ 2 could not separate. Run on this machine’s processor, with no cloud.',
  rules: [
    { id: 'C1', kind: 'property', claim: 'all 1,200 new sessions are answered and none is in organ 2’s 300; every prompt fits the 4,096-token window; the model is the very one organ 2 asked (same digest)', seenBeforeSeal: 'no new case has been asked' },
    { id: 'C2', kind: 'prediction', claim: 'on the 1,200 new sessions the organ beats the 14B shown 24 examples: the 95% lower bound of its lead is above 0', seenBeforeSeal: 'no — organ 2’s 300 gave a lead of 0.014, bound −0.017' },
    { id: 'C3', kind: 'prediction', claim: 'on the 1,200 new sessions the organ is not worse than the 14B by more than 0.02 AUC: the 95% lower bound of its lead is above −0.02', seenBeforeSeal: 'no' },
    { id: 'C4', kind: 'prediction', claim: 'organ 2’s 300 were representative: on the new sessions the 14B scores within 0.03 of 0.80645 and the organ within 0.03 of 0.8205', seenBeforeSeal: 'no' },
  ],
  disclosure: 'Designed after organ 2’s verdict, knowing its numbers; organ 2’s verdict stands as it was. The 1,500 sessions of both samples together are reported too, but judged only on the 1,200 that no rule has seen. A failed prediction is kept.',
  judgedBy: 'tools/judge-2b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-2b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-2b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-2b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
